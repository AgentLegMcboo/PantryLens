import { barcodeVariants, normaliseBarcode, sameBarcode } from './gtin.ts'
export { normaliseBarcode } from './gtin.ts'

/**
 * Turning a UPC into a product.
 *
 * A barcode is the one thing in this pipeline that is not a guess, so it is
 * worth a lot: a hit here replaces the vision model's reading of a label with
 * the manufacturer's own name for the product, at confidence 1.
 *
 * Two providers, in order of how well they know American shelf-stable food:
 * USDA FoodData Central's Branded dataset first, Open Food Facts second. OFF is
 * excellent in Europe and thinner on US groceries, which is the wrong way round
 * for a US pantry — but it is free, needs no key, and catches things USDA misses,
 * so it stays as the fallback.
 *
 * Exact product matches are cached for 30 days. Misses are retried, so an
 * outage or a newly catalogued product never gets stuck as unknown.
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
  /**
   * Allergens, diet and whether a person without a kitchen can use it.
   *
   * Open Food Facts returns all of this in the SAME request that was already
   * being made for the name and the pack shot — it was simply not being asked
   * for, and was thrown away. See mapDietTags.
   */
  dietTags: string[]
  source: 'usda' | 'openfoodfacts' | 'miss' | 'cache'
  unavailable?: boolean
}

/**
 * Must match diet_tag_vocabulary() in the migration and DIET_TAGS in lib/diet.ts.
 * The column has a check constraint against the same list, so an unknown tag is
 * a rejected insert rather than a silently stored typo.
 */
const DIET_TAGS = [
  'contains-wheat', 'contains-milk', 'contains-eggs', 'contains-peanuts',
  'contains-tree-nuts', 'contains-soy', 'contains-fish', 'contains-shellfish',
  'contains-sesame', 'vegan', 'vegetarian', 'no-cook', 'easy-open',
]

/** Open Food Facts allergen slugs to ours. Their tags are prefixed by language. */
const ALLERGEN_MAP: Record<string, string> = {
  gluten: 'contains-wheat',
  wheat: 'contains-wheat',
  milk: 'contains-milk',
  eggs: 'contains-eggs',
  egg: 'contains-eggs',
  peanuts: 'contains-peanuts',
  peanut: 'contains-peanuts',
  nuts: 'contains-tree-nuts',
  'tree-nuts': 'contains-tree-nuts',
  soybeans: 'contains-soy',
  soy: 'contains-soy',
  fish: 'contains-fish',
  crustaceans: 'contains-shellfish',
  molluscs: 'contains-shellfish',
  shellfish: 'contains-shellfish',
  sesame: 'contains-sesame',
  'sesame-seeds': 'contains-sesame',
}

/** "en:gluten" -> "gluten". Their tags carry a language prefix that varies. */
const stripLang = (tag: string) => String(tag).toLowerCase().replace(/^[a-z]{2}:/, '').trim()

/**
 * Turns an Open Food Facts product into our tags.
 *
 * Only POSITIVE claims are recorded. `allergens_tags` listing gluten means we
 * say so; `allergens_tags` being empty means nobody has filled it in, which is
 * not the same as the food being free of anything, and nothing here ever writes
 * a "free from" tag. `traces_tags` ("may contain") is treated as containing:
 * for somebody with a severe allergy that is the only safe reading, and this
 * data decides what goes in their box.
 */
export function mapDietTags(product: Record<string, unknown>): string[] {
  const tags = new Set<string>()

  const allergenFields = ['allergens_tags', 'traces_tags']
  for (const field of allergenFields) {
    const list = Array.isArray(product[field]) ? (product[field] as unknown[]) : []
    for (const raw of list) {
      const mapped = ALLERGEN_MAP[stripLang(String(raw))]
      if (mapped) tags.add(mapped)
    }
  }

  // Their ingredient analysis. Only the positive verdicts: 'maybe-vegan' means
  // the ingredient list could not be parsed, which is no information at all.
  const analysis = Array.isArray(product.ingredients_analysis_tags)
    ? (product.ingredients_analysis_tags as unknown[]).map((t) => stripLang(String(t)))
    : []
  if (analysis.includes('vegan')) tags.add('vegan')
  if (analysis.includes('vegetarian')) tags.add('vegetarian')
  // Vegan implies vegetarian; the data does not always say both.
  if (tags.has('vegan')) tags.add('vegetarian')

  // No-cook and easy-open are not fields anybody publishes, so they are left for
  // a volunteer holding the tin. Guessing them from a category would be guessing
  // about the one thing a person with no kitchen depends on.

  return DIET_TAGS.filter((t) => tags.has(t))
}

const CATEGORIES = ['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown']

/** Neither provider should ever be able to hold a scan open. */
const PROVIDER_TIMEOUT_MS = 4_000

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
  const words = (typeof haystack === 'string' ? haystack : '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const has = (...terms: string[]) => terms.some(term => (' ' + words + ' ').includes(' ' + term + ' '))
  if (has('infant', 'baby food', 'baby wipes', 'formula', 'diaper', 'diapers')) return 'baby'
  if (has('soap', 'shampoo', 'toothpaste', 'deodorant', 'detergent', 'sanitizer', 'hygiene', 'toilet paper', 'paper towel', 'paper towels', 'personal care', 'household')) return 'hygiene'
  if (has('snack', 'snacks', 'cracker', 'crackers', 'cookie', 'cookies', 'chip', 'chips', 'chocolate', 'chocolates', 'candy', 'bar', 'bars', 'popcorn', 'pretzel', 'pretzels')) return 'snack'
  if (has('green bean', 'green beans', 'string beans', 'wax beans', 'french beans')) return 'vegetable'
  if (has('cereal', 'cereals', 'breakfast', 'oatmeal', 'oats', 'granola', 'pancake', 'pancakes', 'syrup')) return 'breakfast'
  if (has('bean', 'beans', 'legume', 'legumes', 'peanut butter', 'nut butter', 'nuts', 'peanuts', 'tofu', 'meat', 'beef', 'pork', 'turkey', 'poultry', 'chicken', 'tuna', 'salmon', 'fish', 'sardines', 'protein', 'lentil', 'lentils', 'chickpea', 'chickpeas', 'egg', 'eggs', 'dairy', 'milk', 'cheese')) return 'protein'
  if (has('vegetable', 'vegetables', 'tomato', 'tomatoes', 'corn', 'pea', 'peas', 'carrot', 'carrots', 'potato', 'potatoes', 'fruit', 'fruits', 'peach', 'peaches', 'pear', 'pears', 'produce')) return 'vegetable'
  if (has('pasta', 'rice', 'grain', 'grains', 'flour', 'bread', 'noodle', 'noodles', 'macaroni', 'tortilla', 'tortillas')) return 'grain'
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

type ProviderResult = { product: BarcodeProduct | null; unavailable: boolean }
const providerText = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

async function getJson(url: string, headers: Record<string, string> = {}, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<{ data: any; unavailable: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (response.status === 404) return { data: null, unavailable: false }
    if (!response.ok) return { data: null, unavailable: true }
    return { data: await response.json(), unavailable: false }
  } catch {
    return { data: null, unavailable: true }
  } finally {
    clearTimeout(timer)
  }
}

async function lookupUsda(barcode: string, apiKey: string): Promise<ProviderResult> {
  const url = 'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(apiKey) +
    '&query=' + encodeURIComponent(barcode) + '&dataType=Branded&pageSize=25'
  const { data, unavailable } = await getJson(url)
  const foods: any[] = Array.isArray(data?.foods) ? data.foods : []
  // A fuzzy search match is useful only if it carries this exact, valid GTIN.
  const hit = foods.find(food => sameBarcode(food?.gtinUpc, barcode) && typeof food?.description === 'string' && food.description.trim())
  if (!hit) return { product: null, unavailable }
  const brand = providerText(hit.brandName) || providerText(hit.brandOwner) || null
  const description = hit.description.trim()
  return { unavailable: false, product: {
    barcode, name: composeName(brand, description), brand,
    category: mapCategory(description) ?? mapCategory(hit.foodCategory ?? ''),
    imageUrl: null, dietTags: [], source: 'usda',
  } }
}

async function lookupOpenFoodFacts(barcode: string): Promise<ProviderResult> {
  // UPC-A is often stored with an EAN-13 leading zero. Never alter a check digit
  // or a nonzero case indicator to invent a match.
  const deadline = Date.now() + 2 * PROVIDER_TIMEOUT_MS
  for (const variant of barcodeVariants(barcode)) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return { product: null, unavailable: true }
    const url = 'https://world.openfoodfacts.org/api/v2/product/' + variant + '.json' +
      '?fields=code,product_name,product_name_en,brands,quantity,categories_tags,image_front_small_url,image_front_url,allergens_tags,traces_tags,ingredients_analysis_tags'
    const { data, unavailable } = await getJson(url, {
      'User-Agent': 'PantryLens/1.0 (food pantry inventory; https://github.com/AgentLegMcboo/PantryLens)',
    }, Math.min(PROVIDER_TIMEOUT_MS, remaining))
    if (unavailable) return { product: null, unavailable: true }
    if (!data || data.status === 0) continue
    const product = data.product
    if (!sameBarcode(product?.code ?? data.code, barcode)) continue
    if (data.code != null && !sameBarcode(data.code, barcode)) continue
    const name = [product?.product_name, product?.product_name_en]
      .find(value => typeof value === 'string' && value.trim())?.trim()
    if (!name) continue
    const brand = providerText(product.brands).split(',')[0].trim() || null
    const quantity = providerText(product.quantity)
    const tags: string[] = Array.isArray(product.categories_tags) ? product.categories_tags : []
    return { unavailable: false, product: {
      barcode, name: composeName(brand, name, quantity), brand,
      category: mapCategory(name) ?? mapCategory(tags.join(' ')),
      imageUrl: providerText(product.image_front_small_url) || providerText(product.image_front_url) || null,
      dietTags: mapDietTags(product), source: 'openfoodfacts',
    } }
  }
  return { product: null, unavailable: false }
}

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

async function readCache(barcodes: string[], supabaseUrl: string, serviceKey: string) {
  const found = new Map<string, BarcodeProduct>()
  if (!barcodes.length) return found
  const list = barcodes.map(code => '"' + code + '"').join(',')
  const { data } = await getJson(supabaseUrl + '/rest/v1/barcode_cache?barcode=in.(' + list +
    ')&select=barcode,name,brand,category,image_url,diet_tags,source,fetched_at', {
    apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
  })
  for (const row of Array.isArray(data) ? data : []) {
    if (!row || typeof row !== 'object') continue
    const age = Date.now() - new Date(row.fetched_at).getTime()
    if (!barcodes.includes(row.barcode) || !normaliseBarcode(row.barcode) ||
      !Number.isFinite(age) || age < -300000 || age >= CACHE_MAX_AGE_MS ||
      !['usda', 'openfoodfacts'].includes(row.source) || typeof row.name !== 'string' || !row.name.trim()) continue
    found.set(row.barcode, {
      barcode: row.barcode, name: tidyName(row.name), brand: row.brand ?? null,
      category: mapCategory(row.name) ?? (CATEGORIES.includes(row.category) ? row.category : null),
      imageUrl: row.image_url ?? null,
      dietTags: Array.isArray(row.diet_tags) ? row.diet_tags.filter((tag: string) => DIET_TAGS.includes(tag)) : [],
      source: 'cache',
    })
  }
  return found
}

async function writeCache(rows: BarcodeProduct[], supabaseUrl: string, serviceKey: string): Promise<void> {
  // An outage and an unknown product must never become a permanent miss.
  const hits = rows.filter(row => row.name && row.source !== 'miss')
  if (!hits.length) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    await fetch(supabaseUrl + '/rest/v1/barcode_cache?on_conflict=barcode', {
      method: 'POST', signal: controller.signal,
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(hits.map(row => ({
        barcode: row.barcode, name: row.name, brand: row.brand, category: row.category,
        image_url: row.imageUrl, diet_tags: row.dietTags, source: row.source,
        fetched_at: new Date().toISOString(),
      }))),
    })
  } catch (error) {
    console.warn('barcode cache write failed (ignored):', error)
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveBarcodes(barcodes: string[]): Promise<Map<string, BarcodeProduct>> {
  const unique = [...new Set(barcodes.map(normaliseBarcode).filter((code): code is string => !!code))]
  const resolved = new Map<string, BarcodeProduct>()
  if (!unique.length) return resolved
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const usdaKey = Deno.env.get('FDC_API_KEY') ?? ''
  if (supabaseUrl && serviceKey) {
    const variants = [...new Set(unique.flatMap(barcodeVariants))]
    const cached = await readCache(variants, supabaseUrl, serviceKey)
    for (const code of unique) {
      const hit = barcodeVariants(code).map(variant => cached.get(variant)).find(Boolean)
      if (hit) resolved.set(code, { ...hit, barcode: code })
    }
  }
  const fetched = await Promise.all(unique.filter(code => !resolved.has(code)).map(async barcode => {
    const [usda, off] = await Promise.all([
      usdaKey ? lookupUsda(barcode, usdaKey) : Promise.resolve({ product: null, unavailable: false }),
      lookupOpenFoodFacts(barcode),
    ])
    const primary = usda.product ?? off.product
    const product: BarcodeProduct = primary ? {
      ...primary, imageUrl: off.product?.imageUrl ?? primary.imageUrl,
      dietTags: off.product?.dietTags ?? primary.dietTags,
      category: primary.category ?? off.product?.category ?? null,
    } : { barcode, name: null, brand: null, category: null, imageUrl: null, dietTags: [],
      source: 'miss', unavailable: usda.unavailable || off.unavailable }
    resolved.set(barcode, product)
    return product
  }))
  if (supabaseUrl && serviceKey) await writeCache(fetched, supabaseUrl, serviceKey)
  return resolved
}
