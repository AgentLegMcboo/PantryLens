/**
 * Turning a UPC into a product.
 *
 * Validated barcodes can improve the model's label reading. Provider records
 * can still be incomplete or incorrect, so volunteers confirm the package.
 *
 * Two providers, in order of how well they know American shelf-stable food:
 * USDA FoodData Central's Branded dataset first, Open Food Facts second. OFF is
 * excellent in Europe and thinner on US groceries, which is the wrong way round
 * for a US pantry — but it is free, needs no key, and catches things USDA misses,
 * so it stays as the fallback.
 *
 * Positive matches are cached for 30 days. Misses are retried so an outage or
 * an incomplete provider record cannot permanently hide a product.
 */

export interface BarcodeProduct {
  barcode: string
  name: string | null
  brand: string | null
  category: string | null
  /**
   * The manufacturer's pack shot. Open Food Facts has one for most products it
   * knows; USDA has none at all, which is worth remembering when weighing the
   * two providers.
   */
  imageUrl: string | null
  source: 'usda' | 'openfoodfacts' | 'miss' | 'cache'
}

const CATEGORIES = ['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown']

/** Neither provider should ever be able to hold a scan open. */
const PROVIDER_TIMEOUT_MS = 4_000

/**
 * The GTIN check digit, which is why reading a barcode off a photograph is
 * safe at all.
 *
 * Every UPC-A, EAN-13 and EAN-8 carries a mod-10 checksum over its own digits.
 * That means a misread — the single likeliest failure when a vision model reads
 * 2mm-tall digits off a can in a wide shot — can be caught locally, for free,
 * with no round trip. A wrong barcode becomes an ABSENT barcode, which is the
 * right way to be wrong: the volunteer still gets the model's reading of the
 * label instead of a confidently incorrect product.
 *
 * Weights alternate 3 and 1 from the rightmost payload digit, which is the
 * general GTIN rule and works at every length.
 */
function gtinCheckDigit(payload: string): number {
  let sum = 0
  let weight = 3
  for (let i = payload.length - 1; i >= 0; i--) {
    sum += Number(payload[i]) * weight
    weight = weight === 3 ? 1 : 3
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Digits only, checksum verified. Returns null for anything that fails — a
 * barcode that does not validate is not a barcode.
 *
 * UPC-E is deliberately not accepted: it is a 6-digit compression that has to be
 * expanded to UPC-A before it means anything, and a half-understood code is
 * worse than none. The scanner is configured to the three formats handled here.
 */
export function normaliseBarcode(raw: unknown): string | null {
  const input = String(raw ?? '').trim()
  if (!/^[\d\s-]+$/.test(input)) return null
  const digits = input.replace(/[\s-]/g, '')
  if (![8, 12, 13, 14].includes(digits.length)) return null

  const payload = digits.slice(0, -1)
  const check = Number(digits[digits.length - 1])
  return gtinCheckDigit(payload) === check ? digits : null
}

/**
 * Best-effort mapping from a provider's taxonomy to the pantry's eight buckets.
 *
 * Deliberately keyword-based over both the provider's category strings and the
 * product name. The real taxonomies are enormous and mostly about things a food
 * pantry does not care about; the distinctions that matter here are few, and the
 * caller falls back to the vision model's own category when nothing matches.
 * Order matters — the first hit wins, so the narrow rules come first.
 */
export function mapCategory(haystack: string): string | null {
  const h = haystack.toLowerCase().replace(/[-_]/g, ' ')
  const has = (...needles: string[]) => needles.some((n) => new RegExp(`\\b${n.replace(/[-_]/g, ' ')}(?:s)?\\b`).test(h))

  if (has('infant', 'baby-food', 'baby food', 'formula', 'diaper')) return 'baby'
  if (has('soap', 'shampoo', 'toothpaste', 'deodorant', 'detergent', 'hygiene', 'toilet-paper',
          'paper-towel', 'personal-care', 'household')) return 'hygiene'
  if (has('granola bar', 'snack bar', 'protein bar', 'popcorn', 'cracker', 'cookie', 'candy', 'pretzel', 'potato chip')) return 'snack'
  if (has('green bean', 'green beans', 'string bean', 'sweet pea')) return 'vegetable'
  if (has('cereal', 'breakfast', 'oatmeal', 'oats', 'granola', 'pancake', 'syrup')) return 'breakfast'
  if (has('bean', 'legume', 'peanut-butter', 'peanut butter', 'nut-butter', 'meat', 'poultry',
          'chicken', 'tuna', 'salmon', 'fish', 'sardine', 'protein', 'lentil', 'chickpea',
          'egg', 'dairy', 'milk', 'cheese')) return 'protein'
  if (has('vegetable', 'tomato', 'corn', 'green-bean', 'pea', 'carrot', 'potato', 'fruit',
          'produce', 'canned-vegetable')) return 'vegetable'
  if (has('pasta', 'rice', 'grain', 'flour', 'bread', 'noodle', 'macaroni', 'tortilla')) return 'grain'
  if (has('snack', 'cracker', 'cookie', 'chip', 'candy', 'bar', 'popcorn', 'pretzel')) return 'snack'

  return null
}

/**
 * Collapses a leading word repeated straight back at itself.
 *
 * Open Food Facts very often stores the brand AS the product name, so joining
 * the two gives "Nutella Nutella". Applied on the way in AND on the way out, so
 * a row already cached in the doubled form is cleaned when it is read back
 * rather than having to be hunted down and deleted.
 */
function tidyName(raw: string): string {
  return raw
    .replace(/^(\S+)(\s+\1\b)+/i, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Brand, then product, then size — skipping the brand when the product name
 * already opens with it.
 */
function composeName(brand: string | null, name: string, extra?: string | null): string {
  const parts: string[] = []
  if (brand && !name.toLowerCase().startsWith(brand.toLowerCase())) parts.push(brand)
  parts.push(name)
  if (extra) parts.push(extra)
  return tidyName(parts.join(' ')).slice(0, 120)
}

/** A fetch that cannot hang, and that never throws into the caller. */
async function getJson(url: string, headers: Record<string, string> = {}): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * USDA FoodData Central, Branded dataset.
 *
 * The search endpoint is fuzzy, so the returned `gtinUpc` is compared back
 * against what was asked for. Without that check a search for one tin
 * cheerfully returns a different product, which is precisely the failure a
 * barcode exists to rule out.
 */
async function lookupUsda(barcode: string, apiKey: string): Promise<BarcodeProduct | null> {
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}` +
    `&query=${encodeURIComponent(barcode)}&dataType=Branded&pageSize=5`

  const data = await getJson(url)
  const foods: any[] = Array.isArray(data?.foods) ? data.foods : []

  // Leading zeros differ between datasets, so compare numerically-ish.
  const wanted = barcode.padStart(14, '0')
  const hit = foods.find((f) => normaliseBarcode(f?.gtinUpc)?.padStart(14, '0') === wanted)
  if (!hit) return null

  const brand = String(hit.brandName ?? hit.brandOwner ?? '').trim() || null
  const description = String(hit.description ?? '').trim()
  if (!description) return null

  return {
    barcode,
    // "Skippy" + "PEANUT BUTTER, CREAMY" reads better than either alone, and
    // matches how the vision model is asked to name things.
    name: composeName(brand, description),
    brand,
    category: mapCategory(`${hit.foodCategory ?? ''} ${description}`),
    // FoodData Central serves no product imagery.
    imageUrl: null,
    source: 'usda',
  }
}

/** Open Food Facts. No key, but it wants to know who is calling. */
async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json` +
    `?fields=code,product_name,brands,quantity,categories_tags,image_front_small_url,image_front_url`

  const data = await getJson(url, {
    'User-Agent': 'PantryLens/1.0 (food pantry inventory; https://github.com/pantrylens)',
  })

  const product = data?.product
  if (data?.status !== 1 || normaliseBarcode(product?.code)?.padStart(14, '0') !== barcode.padStart(14, '0')) return null
  const name = String(product?.product_name ?? '').trim()
  if (!name) return null

  const brand = String(product?.brands ?? '').split(',')[0].trim() || null
  const quantity = String(product?.quantity ?? '').trim()
  const tags: string[] = Array.isArray(product?.categories_tags) ? product.categories_tags : []

  // The small variant on purpose: this is rendered at 44px in a list, and the
  // full-size original is often over a megabyte.
  const image =
    String(product?.image_front_small_url ?? product?.image_front_url ?? '').trim() || null

  return {
    barcode,
    name: composeName(brand, name, quantity),
    brand,
    category: mapCategory(`${tags.join(' ')} ${name}`),
    imageUrl: image,
    source: 'openfoodfacts',
  }
}

/** Rows already known, keyed by barcode. Never throws — a cold cache is not an error. */
async function readCache(barcodes: string[], supabaseUrl: string, serviceKey: string) {
  const found = new Map<string, BarcodeProduct>()
  if (barcodes.length === 0) return found

  const list = barcodes.map((b) => `"${b}"`).join(',')
  const data = await getJson(
    `${supabaseUrl}/rest/v1/barcode_cache?barcode=in.(${list})&select=barcode,name,brand,category,image_url,source,fetched_at`,
    { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  )

  for (const row of Array.isArray(data) ? data : []) {
    // A provider outage is not evidence that a product does not exist.
    // Retry old misses and refresh positive entries after 30 days.
    if (!row.name || row.source === 'miss' || Date.now() - new Date(row.fetched_at).getTime() > 30 * 86400000) continue
    found.set(row.barcode, {
      barcode: row.barcode,
      name: row.name ? tidyName(row.name) : row.name,
      brand: row.brand,
      category: row.category,
      imageUrl: row.image_url ?? null,
      source: row.source === 'miss' ? 'miss' : 'cache',
    })
  }
  return found
}

/** Writes what was learned, misses included. Fire and forget: a failed cache write must not fail a scan. */
async function writeCache(
  rows: BarcodeProduct[],
  supabaseUrl: string,
  serviceKey: string,
): Promise<void> {
  if (rows.length === 0) return
  try {
    await fetch(`${supabaseUrl}/rest/v1/barcode_cache?on_conflict=barcode`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(
        rows.filter(r => r.source !== 'miss').map((r) => ({
          barcode: r.barcode,
          name: r.name,
          brand: r.brand,
          category: r.category && CATEGORIES.includes(r.category) ? r.category : null,
          image_url: r.imageUrl,
          source: r.source === 'cache' ? 'openfoodfacts' : r.source,
          fetched_at: new Date().toISOString(),
        })),
      ),
    })
  } catch (err) {
    console.warn('barcode cache write failed (ignored):', err)
  }
}

/**
 * Resolves a batch of barcodes. Cache first, then providers, concurrently.
 *
 * Returns a map of every barcode asked for. A value with `source: 'miss'` means
 * "asked and nobody knows", which is different from a barcode that is absent
 * from the map — that would mean it never validated.
 */
export async function resolveBarcodes(barcodes: string[]): Promise<Map<string, BarcodeProduct>> {
  const unique = [...new Set(barcodes.map(normaliseBarcode).filter((b): b is string => !!b))]
  const resolved = new Map<string, BarcodeProduct>()
  if (unique.length === 0) return resolved

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const usdaKey = Deno.env.get('FDC_API_KEY') ?? ''

  if (supabaseUrl && serviceKey) {
    for (const [code, row] of await readCache(unique, supabaseUrl, serviceKey)) {
      resolved.set(code, row)
    }
  }

  const missing = unique.filter((b) => !resolved.has(b))
  if (missing.length > 0) {
    const fetched = await Promise.all(
      missing.map(async (barcode): Promise<BarcodeProduct> => {
        const usda = usdaKey ? await lookupUsda(barcode, usdaKey) : null
        if (usda) return usda
        return (
          (await lookupOpenFoodFacts(barcode)) ?? {
            barcode,
            name: null,
            brand: null,
            category: null,
            imageUrl: null,
            source: 'miss',
          }
        )
      }),
    )

    for (const row of fetched) resolved.set(row.barcode, row)
    if (supabaseUrl && serviceKey) await writeCache(fetched, supabaseUrl, serviceKey)
  }

  return resolved
}
