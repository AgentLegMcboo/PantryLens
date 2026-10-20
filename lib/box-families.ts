import { normaliseItems, normaliseRules } from './box-presets';

/** Household sizes stay whole and bounded, including values read from routes. */
export function normaliseFamilySize(value: unknown, fallback = 4): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(99, Math.floor(n)) : fallback;
}

/** Resizing a plan fills new slots without changing existing households. */
export function normaliseFamilySizes(raw: unknown, count: number, fallback = 4): number[] {
  const values = Array.isArray(raw) ? raw : [];
  const size = normaliseFamilySize(fallback);
  return Array.from({ length: Math.max(0, Math.min(200, Math.floor(count) || 0)) },
    (_, index) => normaliseFamilySize(values[index], size));
}

export function describeFamilySizes(sizes: number[]): string {
  const counts = new Map<number, number>();
  for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  if (counts.size > 3) {
    const sorted = [...counts.keys()].sort((a, b) => a - b);
    return `${sizes.length} boxes · families of ${sorted[0]}–${sorted[sorted.length - 1]}`;
  }
  return [...counts].sort(([a], [b]) => a - b)
    .map(([size, count]) => `${count} ${count === 1 ? 'box' : 'boxes'} for ${size}`)
    .join(' · ');
}

/** The existing per_box JSON can retain the household alongside its recipe. */
export type PackedBoxContents = import('./store').BoxRules & {
  familySize?: number;
  boxNumber?: number;
  items?: import('./box-presets').BoxItemRule[];
};

export function normalisePackedContents(raw: unknown): PackedBoxContents {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const contents: PackedBoxContents = normaliseRules(source);
  // Template limits apply before scaling. A packed large-family box can
  // legitimately hold more than the template editor's 99-unit limit.
  for (const category of Object.keys(contents) as (keyof import('./store').BoxRules)[]) {
    const n = Number(source[category]);
    if (Number.isSafeInteger(n) && n >= 0) contents[category] = n;
  }
  if (typeof source.familySize === 'number' && source.familySize >= 1) {
    contents.familySize = normaliseFamilySize(source.familySize);
  }
  if (typeof source.boxNumber === 'number' && Number.isInteger(source.boxNumber) && source.boxNumber > 0) {
    contents.boxNumber = source.boxNumber;
  }
  if (Array.isArray(source.items)) {
    const rawItems = source.items as Record<string, unknown>[];
    contents.items = normaliseItems(source.items).map(item => {
      const original = rawItems.find(raw => typeof raw?.name === 'string' && raw.name.trim().toLowerCase() === item.name.toLowerCase());
      const count = Number(original?.count);
      return { ...item, count: Number.isSafeInteger(count) && count > 0 ? count : item.count };
    });
  }
  return contents;
}
