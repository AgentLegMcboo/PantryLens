// Type-only, so this module pulls in no supabase client and stays runnable
// anywhere — including a plain node process.
import { normaliseDietTags, type DietTag } from './diet';
import type { Category, Condition, InventoryItem } from './store';

/**
 * Pure normalisation of whatever the vision model returns.
 *
 * Kept free of any supabase import so it can be exercised directly — this is the
 * layer that decides what a volunteer actually sees, and it is worth being able
 * to run it over a pile of awkward model output without a network or a device.
 */

const VALID_CATEGORIES: Category[] = [
  'grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown',
];

/** The model occasionally answers with a near-miss. Map the ones it actually uses. */
const CATEGORY_ALIASES: Record<string, Category> = {
  grains: 'grain', cereal: 'breakfast', cereals: 'breakfast', pasta: 'grain', rice: 'grain',
  vegetables: 'vegetable', veg: 'vegetable', veggies: 'vegetable', produce: 'vegetable',
  fruit: 'vegetable', fruits: 'vegetable',
  proteins: 'protein', meat: 'protein', beans: 'protein', dairy: 'protein',
  snacks: 'snack', toiletries: 'hygiene', personal_care: 'hygiene', hygeine: 'hygiene',
  infant: 'baby', formula: 'baby', other: 'unknown', misc: 'unknown',
};

export function normaliseCategory(raw: unknown): Category {
  const key = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if ((VALID_CATEGORIES as string[]).includes(key)) return key as Category;
  return CATEGORY_ALIASES[key] ?? 'unknown';
}

export function normaliseCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  // A single photo of a donation bag does not contain 400 of anything; a wild
  // number is a misread, and an inflated count silently corrupts box maths.
  return Math.min(n, 99);
}

/**
 * Accepts YYYY-MM-DD, YYYY-MM and MM/YYYY — cans very often print only a month.
 * A month-only date becomes the 1st, which is the conservative reading: it pulls
 * the item forward rather than letting it sit past its date.
 */
export function normaliseExpiration(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s.toLowerCase() === 'null') return null;

  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
  else if (/^\d{4}-\d{2}$/.test(s)) iso = `${s}-01`;
  else {
    const monthYear = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthYear) iso = `${monthYear[2]}-${monthYear[1].padStart(2, '0')}-01`;
  }
  if (!iso) return null;

  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  // Date rolls impossible days over instead of rejecting them: "2027-02-30"
  // silently becomes 2 March. Comparing the parsed parts back against what was
  // written is the only way to catch a misread day.
  const [y, m, d] = iso.split('-').map(Number);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() + 1 !== m ||
    parsed.getDate() !== d
  ) {
    return null;
  }

  // Shelf-stable food does not carry a date twenty years out, and a date decades
  // in the past is a misread label rather than genuinely ancient stock.
  const year = parsed.getFullYear();
  const thisYear = new Date().getFullYear();
  if (year < thisYear - 5 || year > thisYear + 15) return null;

  return iso;
}

export function normaliseConfidence(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/** Anything the model flags as damaged arrives here; the volunteer confirms it. */
export function normaliseCondition(raw: unknown): Condition {
  const key = String(raw ?? 'ok').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const allowed: Condition[] = ['ok', 'dented', 'rusted', 'seal_broken', 'expired'];
  if ((allowed as string[]).includes(key)) return key as Condition;
  if (key === 'broken_seal' || key === 'open' || key === 'opened') return 'seal_broken';
  if (key === 'rusty' || key === 'rust') return 'rusted';
  if (key === 'dent' || key === 'damaged') return 'dented';
  return 'ok';
}

/**
 * Where an item sits in its photo, as fractions of the image (0-1).
 *
 * Stored as fractions rather than the model's 0-1000 integers or raw pixels so
 * the overlay can lay boxes over an image at whatever size it happens to be
 * rendered, without knowing anything about the original.
 */
export interface DetectionBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type ScanCandidate = Partial<InventoryItem> & {
  name: string;
  category: Category;
  count: number;
  expiration: string | null;
  confidence: number;
  condition: Condition;
  /** Which photo this was found in. */
  imageIndex: number;
  /** A validated GTIN, when the digits were legible and checksummed. */
  barcode?: string | null;
  /**
   * What named this row, when it was something better than the vision model.
   * The review screen shows it, because "the manufacturer says so" and "your
   * pantry has called it this eleven times" deserve to be told apart from a
   * guess — and from each other.
   */
  resolvedBy?: 'barcode' | 'catalogue' | null;
  /** The manufacturer's pack shot, when a barcode lookup found one. */
  imageUrl?: string | null;
  /**
   * Allergens and diet, when a barcode identified the product.
   *
   * Everything the model returns is untrusted, and this is no exception — it is
   * normalised against the shipped vocabulary rather than stored as given,
   * because an unrecognised string here would be a tag that silently fails to
   * match a box exclusion.
   */
  diet_tags?: DietTag[];
  /** Null when the model gave no usable box — the item is still verifiable. */
  box: DetectionBox | null;
};

/** Converts the model's [ymin, xmin, ymax, xmax] 0-1000 box into fractions. */
export function normaliseBox(raw: unknown): DetectionBox | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;

  const nums = raw.map(Number);
  if (nums.some(n => !Number.isFinite(n))) return null;

  // Subtracted in the model's own 0-1000 integer space and divided once at the
  // end. Dividing first makes 300-100 come out as 0.19999999999999998.
  let [ymin, xmin, ymax, xmax] = nums.map(n => Math.min(1000, Math.max(0, n)));
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];

  const width = xmax - xmin;
  const height = ymax - ymin;
  // Below half a percent of the frame there is nothing a finger could hit.
  if (width < 5 || height < 5) return null;

  return { top: ymin / 1000, left: xmin / 1000, width: width / 1000, height: height / 1000 };
}

export function normaliseItem(raw: any): ScanCandidate | null {
  const name = String(raw?.name ?? '').trim();
  if (!name) return null;

  const expiration = normaliseExpiration(raw?.expiration);
  const condition = normaliseCondition(raw?.condition);

  // An item already past its date is inspection-failed on arrival, whatever the
  // model thought of the tin itself.
  const today = new Date().toISOString().split('T')[0];
  const isExpired = !!expiration && expiration < today;

  const imageIndex = Math.floor(Number(raw?.image_index));

  const barcode = String(raw?.barcode ?? '').replace(/\D/g, '');

  return {
    name: name.slice(0, 120),
    category: normaliseCategory(raw?.category),
    count: normaliseCount(raw?.count),
    expiration,
    confidence: normaliseConfidence(raw?.confidence),
    condition: isExpired ? 'expired' : condition,
    imageIndex: Number.isFinite(imageIndex) && imageIndex >= 0 ? imageIndex : 0,
    barcode: barcode || null,
    resolvedBy: raw?.resolved_by === 'barcode' ? 'barcode' : null,
    imageUrl: typeof raw?.image_url === 'string' && raw.image_url ? raw.image_url : null,
    diet_tags: normaliseDietTags(raw?.diet_tags),
    box: normaliseBox(raw?.box_2d),
  };
}

/** The identity of a product: same name, same category, ignoring punctuation. */
function productKey(item: ScanCandidate): string {
  return `${item.category}|${item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/**
 * Folds `item` into `existing`, taking `count` from the caller.
 *
 * Everything except the count merges the same way in both passes: keep the best
 * reading of each field, and let whichever frame saw the product most clearly
 * own the box.
 */
function combine(existing: ScanCandidate, item: ScanCandidate, count: number): ScanCandidate {
  // Pointing at the item in the photo where it is clearest is the whole point of
  // the overlay.
  const clearest = item.confidence > existing.confidence ? item : existing;

  return {
    ...existing,
    count: normaliseCount(count),
    confidence: Math.max(existing.confidence, item.confidence),
    expiration: existing.expiration ?? item.expiration,
    // A damage flag on either reading is worth keeping: it only ever holds stock
    // back for a human to look at, which is the safe direction to be wrong in.
    condition: existing.condition !== 'ok' ? existing.condition : item.condition,
    imageIndex: clearest.imageIndex,
    box: clearest.box ?? existing.box ?? item.box,
    // One frame reading the barcode is enough for both.
    barcode: existing.barcode ?? item.barcode,
    resolvedBy: existing.resolvedBy ?? item.resolvedBy,
    imageUrl: existing.imageUrl ?? item.imageUrl,
  };
}

/**
 * Collapses the same product reported more than once — in two passes, because
 * "twice" means two opposite things depending on where it happened.
 *
 * WITHIN one photo, two rows for the same product are two groups of DIFFERENT
 * cans. The model is told to box a stack once and set the count, but it does not
 * always: shown ten tins of green beans in two clusters it will often report six
 * and four. Those add up to ten.
 *
 * ACROSS photos, two rows for the same product are usually the SAME cans seen
 * from another angle — volunteers are told to shoot a pile from several sides —
 * so the counts must not add. The higher of the two is the better estimate of
 * how many there really are.
 *
 * Doing one pass of `max` over everything, which is what this used to do, got
 * the cross-photo case right and silently undercounted the split-stack case:
 * ten tins went into inventory as six. That mattered little while the model was
 * being asked to de-duplicate everything itself; now that each photo is analysed
 * on its own it is the difference between correct stock and quietly wrong stock.
 */
export function mergeDuplicates(items: ScanCandidate[]): ScanCandidate[] {
  // Pass one: within a photo, counts add.
  const perPhoto = new Map<string, ScanCandidate>();
  for (const item of items) {
    const key = `${item.imageIndex}|${productKey(item)}`;
    const existing = perPhoto.get(key);
    perPhoto.set(key, existing ? combine(existing, item, existing.count + item.count) : item);
  }

  // Pass two: across photos, the same cans seen twice — take the better reading.
  const merged = new Map<string, ScanCandidate>();
  for (const item of perPhoto.values()) {
    const key = productKey(item);
    const existing = merged.get(key);
    merged.set(
      key,
      existing ? combine(existing, item, Math.max(existing.count, item.count)) : item,
    );
  }

  return [...merged.values()];
}
