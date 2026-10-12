import AsyncStorage from '@react-native-async-storage/async-storage';
import { normaliseBarcode, sameBarcode } from './barcode-scanner';
import { log } from './log';
import type { BarcodeLookup } from './ai_vision';

const BARCODE_CACHE_KEY = 'pantrylens.barcode_cache.v1';

// Pre-seeded common pantry items so popular items scan instantly even on first launch offline
const SEED_BARCODES: Record<string, Omit<BarcodeLookup, 'barcode' | 'found'>> = {
  // Goya Black Beans 15.5oz
  '041331024175': {
    name: 'Goya Black Beans (15.5 oz)',
    brand: 'Goya',
    category: 'protein',
    dietTags: ['vegan', 'vegetarian'],
  },
  // Jif Creamy Peanut Butter 16oz
  '051500255162': {
    name: 'Jif Creamy Peanut Butter (16 oz)',
    brand: 'Jif',
    category: 'protein',
    dietTags: ['contains-peanuts', 'vegetarian'],
  },
  // Barilla Spaghetti 16oz
  '076808500139': {
    name: 'Barilla Spaghetti Pasta (16 oz)',
    brand: 'Barilla',
    category: 'grain',
    dietTags: ['contains-wheat', 'vegetarian'],
  },
  // Del Monte Sweet Corn 15.25oz
  '024000163183': {
    name: 'Del Monte Whole Kernel Sweet Corn',
    brand: 'Del Monte',
    category: 'vegetable',
    dietTags: ['vegan', 'vegetarian'],
  },
  // Campbell's Tomato Soup 10.75oz
  '051000012517': {
    name: "Campbell's Condensed Tomato Soup",
    brand: "Campbell's",
    category: 'vegetable',
    dietTags: ['vegetarian'],
  },
  // Quaker Quick 1-Minute Oats 42oz
  '030000010402': {
    name: 'Quaker Quick 1-Minute Oats',
    brand: 'Quaker',
    category: 'breakfast',
    dietTags: ['vegan', 'vegetarian'],
  },
  // StarKist Chunk Light Tuna in Water 5oz
  '080000001306': {
    name: 'StarKist Chunk Light Tuna in Water',
    brand: 'StarKist',
    category: 'protein',
    dietTags: ['contains-fish'],
  },
};

let memoryCache: Map<string, BarcodeLookup> = new Map();
let cacheLoaded = false;

async function ensureLoaded(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(BARCODE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [code, val] of Object.entries(parsed)) {
        memoryCache.set(code, val as BarcodeLookup);
      }
    }
  } catch (err) {
    log.warn('barcode', 'Failed to load local barcode cache', err);
  }

  // Populate seeds if not present
  for (const [code, seed] of Object.entries(SEED_BARCODES)) {
    if (!memoryCache.has(code)) {
      memoryCache.set(code, {
        found: true,
        barcode: code,
        ...seed,
      });
    }
  }

  cacheLoaded = true;
}

export async function getCachedBarcode(rawCode: string): Promise<BarcodeLookup | null> {
  await ensureLoaded();
  const normalized = normaliseBarcode(rawCode);
  if (!normalized) return null;

  // Direct match
  if (memoryCache.has(normalized)) {
    return memoryCache.get(normalized)!;
  }

  // Match variants (e.g. 12-digit UPC vs 13-digit EAN with leading zero)
  for (const [cachedCode, product] of memoryCache.entries()) {
    if (sameBarcode(cachedCode, normalized)) {
      return product;
    }
  }

  return null;
}

export async function saveCachedBarcode(product: BarcodeLookup): Promise<void> {
  if (!product.found || !product.barcode) return;
  await ensureLoaded();

  memoryCache.set(product.barcode, product);
  try {
    const serializable: Record<string, BarcodeLookup> = {};
    for (const [k, v] of memoryCache.entries()) {
      serializable[k] = v;
    }
    await AsyncStorage.setItem(BARCODE_CACHE_KEY, JSON.stringify(serializable));
  } catch (err) {
    log.warn('barcode', 'Failed to persist barcode cache', err);
  }
}

/**
 * Direct client-side lookup fallback against Open Food Facts API
 * if the Supabase Edge Function is unreachable or offline.
 */
export async function directOpenFoodFactsLookup(rawCode: string): Promise<BarcodeLookup | null> {
  const code = normaliseBarcode(rawCode);
  if (!code) return null;

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,categories_tags,image_front_small_url,allergens_tags`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PantryLens-App/1.0 (volunteer@pantrylens.org)',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const name = p.product_name?.trim();
    if (!name) return null;

    const brand = p.brands?.trim() || null;
    const imageUrl = p.image_front_small_url || null;

    // Deduce category from name or categories
    let category: any = 'unknown';
    const lowerName = name.toLowerCase();
    if (/bean|lentil|pea|nut|butter|chicken|tuna|salmon|beef|pork|meat|egg|tofu/.test(lowerName)) {
      category = 'protein';
    } else if (/corn|tomato|green bean|carrot|spinach|vegetable|fruit|peach|pear|apple/.test(lowerName)) {
      category = 'vegetable';
    } else if (/rice|pasta|noodle|spaghetti|macaroni|bread|flour|quinoa/.test(lowerName)) {
      category = 'grain';
    } else if (/oat|cereal|granola|pancake|syrup/.test(lowerName)) {
      category = 'breakfast';
    } else if (/chip|cracker|cookie|snack|bar|popcorn/.test(lowerName)) {
      category = 'snack';
    } else if (/soap|shampoo|toothpaste|diaper|hygiene/.test(lowerName)) {
      category = 'hygiene';
    }

    const hit: BarcodeLookup = {
      found: true,
      barcode: code,
      name,
      brand,
      category,
      imageUrl,
      dietTags: [],
    };

    // Cache locally for instant subsequent scans
    await saveCachedBarcode(hit);
    return hit;
  } catch {
    return null;
  }
}
