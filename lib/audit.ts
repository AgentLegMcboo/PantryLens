import type { Category, InventoryItem } from './store';

/**
 * Reconciling a counted shelf against what the books say is on it.
 *
 * This is the half of auditing that has nothing to do with the camera or the
 * database, so it lives on its own and is tested on its own: given the rows the
 * app thinks are on Shelf A and the rows a count produced, what actually
 * changed?
 *
 * The direction matters and is the whole fix. An intake starts from what the
 * camera saw and adds it. An audit starts from WHAT THE BOOKS SAY and asks the
 * count to account for each line — which is the only way a thing that has
 * quietly disappeared can ever be noticed.
 */

/** A row the count produced. Straight off the vision pipeline, or typed by hand. */
export interface CountedRow {
  name: string;
  category?: Category | null;
  count: number;
  expiration?: string | null;
  /** The model's own confidence, where the row came from a photo. */
  confidence?: number;
}

export type AuditStatus =
  /** The books were right. Most lines, in a healthy pantry. */
  | 'unchanged'
  /** A different number is there. The everyday result. */
  | 'corrected'
  /** On the books, not seen in the count. NEVER applied without being asked. */
  | 'missing'
  /** Seen on the shelf, not on the books. */
  | 'new';

export interface AuditLine {
  /** Stable across a re-reconcile, so edits survive a second photo. */
  key: string;
  name: string;
  category: Category;
  /**
   * The inventory rows behind this line, oldest first.
   *
   * A line is a NAME, not a row: a shelf can hold three separate batches of
   * corn with different dates, and a volunteer looking at the shelf sees corn.
   * Asking them which batch shrank would be asking them to invent an answer,
   * so the line carries the total and the batches are settled in `planWrites`.
   */
  rows: InventoryItem[];
  /** What the books say, summed over `rows`. */
  expected: number;
  /** What is physically there. Editable by the volunteer. */
  counted: number;
  status: AuditStatus;
  /**
   * Whether a 'missing' line should actually be removed. Starts false, always:
   * a camera failing to see something is far likelier than the food vanishing,
   * and an audit that deletes on silence is worse than no audit at all.
   */
  confirmedGone?: boolean;
  expiration: string | null;
  imageUrl: string | null;
  confidence?: number;
}

/**
 * The form of a name that two spellings of the same thing share.
 *
 * "Green Beans", "green beans" and "Green Beans (14.5oz)" are one line on a
 * shelf. Deliberately blunt — over-matching merges two real products, so this
 * only strips case, accents, punctuation, bracketed asides and a trailing
 * plural, and stops there.
 */
export function normaliseName(raw: string): string {
  return (raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\b(\w{4,})s\b/g, '$1');
}

/** Oldest first: what FIFO says left the shelf first. */
function byAge(a: InventoryItem, b: InventoryItem): number {
  const added = (a.date_added ?? '').localeCompare(b.date_added ?? '');
  if (added !== 0) return added;
  return (a.expiration ?? '9999').localeCompare(b.expiration ?? '9999');
}

/**
 * What the shelf says versus what was counted, one line per name.
 *
 * Everything on the books comes back, including what the count never mentioned
 * — those are the lines worth looking at.
 */
export function reconcile(onShelf: InventoryItem[], counted: CountedRow[]): AuditLine[] {
  const lines = new Map<string, AuditLine>();

  for (const item of onShelf) {
    const key = normaliseName(item.name);
    const existing = lines.get(key);
    if (existing) {
      existing.rows.push(item);
      existing.expected += item.count;
      existing.imageUrl = existing.imageUrl ?? item.image_url ?? null;
      continue;
    }
    lines.set(key, {
      key,
      name: item.name,
      category: item.category,
      rows: [item],
      expected: item.count,
      counted: 0,
      status: 'missing',
      confirmedGone: false,
      expiration: item.expiration ?? null,
      imageUrl: item.image_url ?? null,
    });
  }

  for (const row of counted) {
    const key = normaliseName(row.name);
    const units = Math.max(0, Math.round(row.count) || 0);
    const existing = lines.get(key);

    if (existing) {
      existing.counted += units;
      // Keep the lowest confidence seen: a line read twice is only as
      // trustworthy as its worst reading.
      if (row.confidence !== undefined) {
        existing.confidence =
          existing.confidence === undefined
            ? row.confidence
            : Math.min(existing.confidence, row.confidence);
      }
      continue;
    }

    lines.set(key, {
      key,
      name: row.name.trim() || 'Unlabeled item',
      category: (row.category ?? 'unknown') as Category,
      rows: [],
      expected: 0,
      counted: units,
      status: 'new',
      expiration: row.expiration ?? null,
      imageUrl: null,
      confidence: row.confidence,
    });
  }

  for (const line of lines.values()) {
    line.rows.sort(byAge);
    line.status = statusOf(line);
  }

  // Lines needing a decision first, then corrections, then the quiet ones. A
  // volunteer should not have to scroll past nine confirmations to find the one
  // thing that is wrong.
  const rank: Record<AuditStatus, number> = { missing: 0, new: 1, corrected: 2, unchanged: 3 };
  return [...lines.values()].sort(
    (a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name),
  );
}

/** Recomputed whenever a volunteer edits a count, so the badge never lies. */
export function statusOf(line: Pick<AuditLine, 'rows' | 'expected' | 'counted'>): AuditStatus {
  if (line.rows.length === 0) return 'new';
  if (line.counted === 0) return 'missing';
  return line.counted === line.expected ? 'unchanged' : 'corrected';
}

/** A single line the server will act on. Mirrors apply_shelf_audit's contract. */
export interface AuditWrite {
  item_id: string | null;
  expected: number | null;
  name: string;
  category: Category;
  count: number;
  expiration: string | null;
}

/**
 * Splits each line's total back across the real rows behind it.
 *
 * Shortfalls come off the OLDEST row first. If stock left a shelf unrecorded it
 * went out of the front, and FIFO says the front is the oldest — so the oldest
 * batch is the one that is short. A surplus goes onto the newest row, because
 * something shelved without being logged was shelved recently.
 *
 * Lines that need no write produce none: an unchanged line, and a 'missing'
 * line nobody has confirmed, are both left out entirely. The server treats a
 * row it is not told about as untouched, which is exactly what is wanted.
 */
export function planWrites(lines: AuditLine[]): AuditWrite[] {
  const writes: AuditWrite[] = [];

  for (const line of lines) {
    const status = statusOf(line);

    if (status === 'new') {
      if (line.counted > 0) {
        writes.push({
          item_id: null,
          expected: null,
          name: line.name,
          category: line.category,
          count: line.counted,
          expiration: line.expiration,
        });
      }
      continue;
    }

    // The safety rule: silence is not evidence. Nothing is removed because the
    // camera failed to mention it — only because somebody said it is gone.
    if (status === 'missing' && !line.confirmedGone) continue;
    if (status === 'unchanged') continue;

    let left = line.counted;
    // Oldest first gets what is there; whatever is short falls off the end.
    // The newest row keeps any surplus, so `left` is spent on the newest last.
    const targets = line.rows.map(row => {
      const take = Math.min(row.count, left);
      left -= take;
      return { row, count: take };
    });
    if (left > 0 && targets.length > 0) targets[targets.length - 1].count += left;

    for (const target of targets) {
      if (target.count === target.row.count) continue; // this batch is untouched
      writes.push({
        item_id: target.row.id,
        expected: target.row.count,
        name: target.row.name,
        category: target.row.category,
        count: target.count,
        expiration: target.row.expiration ?? null,
      });
    }
  }

  return writes;
}

export interface AuditSummary {
  unchanged: number;
  corrected: number;
  /** On the books and not seen — however the volunteer has since decided. */
  missing: number;
  /** Of those, the ones marked as actually gone. Only these get removed. */
  confirmedGone: number;
  added: number;
  unitsBefore: number;
  /** What the shelf will hold once this is applied, unconfirmed lines included. */
  unitsAfter: number;
  /** Lines the count reported with low confidence, worth a second look. */
  lowConfidence: number;
}

/** Low enough that the number on screen is a suggestion, not a reading. */
export const LOW_CONFIDENCE = 0.7;

export function summarise(lines: AuditLine[]): AuditSummary {
  const summary: AuditSummary = {
    unchanged: 0,
    corrected: 0,
    missing: 0,
    confirmedGone: 0,
    added: 0,
    unitsBefore: 0,
    unitsAfter: 0,
    lowConfidence: 0,
  };

  for (const line of lines) {
    const status = statusOf(line);
    summary.unitsBefore += line.expected;

    if (status === 'new') {
      summary.added += line.counted > 0 ? 1 : 0;
      summary.unitsAfter += line.counted;
    } else if (status === 'missing') {
      summary.missing++;
      if (line.confirmedGone) summary.confirmedGone++;
      // An unconfirmed line stays on the shelf, so it still counts afterwards.
      summary.unitsAfter += line.confirmedGone ? 0 : line.expected;
    } else if (status === 'corrected') {
      summary.corrected++;
      summary.unitsAfter += line.counted;
    } else {
      summary.unchanged++;
      summary.unitsAfter += line.counted;
    }

    if (line.confidence !== undefined && line.confidence < LOW_CONFIDENCE) {
      summary.lowConfidence++;
    }
  }

  return summary;
}
