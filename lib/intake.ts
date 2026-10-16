import type { Category, Condition } from './store';

/** Accept printed dates only; never turn a guessed shelf life into an expiry. */
export function parsePrintedDate(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  let iso = input;
  if (/^\d{4}-\d{2}$/.test(input)) iso = `${input}-01`;
  const monthYear = input.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYear) iso = `${monthYear[2]}-${monthYear[1].padStart(2, '0')}-01`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? iso : null;
}

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twelve: 12, dozen: 12 };

/** A case has no universal size. The caller must ask rather than assume twelve. */
export function parseQuickAdd(value: string, unitsPerPack?: number) {
  const input = value.trim().replace(/\s+/g, ' ');
  if (!input) return null;
  const match = input.match(/^(\d+|a|an|one|two|three|four|five|six|ten|twelve|dozen)\s+(?:(cases?|flats?|packs?|boxes|cans?|jars?|bags?|tins?|units?)\s+)?(?:of\s+)?(.+)$/i);
  const amount = match ? (NUMBERS[match[1].toLowerCase()] ?? Number(match[1])) : 1;
  const pack = !!match?.[2] && /^(case|flat|pack)/i.test(match[2]);
  const needsPackSize = pack && !(Number.isSafeInteger(unitsPerPack) && unitsPerPack! > 0);
  const count = amount * (pack && !needsPackSize ? unitsPerPack! : 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000000) return null;
  return { name: (match?.[3] ?? input).trim(), count, needsPackSize, packs: amount };
}

export function splitInspection<T extends { count?: number; condition?: Condition }>(row: T, held: number): T[] {
  const total = row.count ?? 1;
  if (!Number.isInteger(held) || held < 0 || held > total) throw new Error('Held quantity must be between zero and the total.');
  if (held === 0) return [{ ...row, condition: 'ok' }];
  if (!row.condition || row.condition === 'ok') throw new Error('Choose why these units need inspection.');
  return [
    ...(total > held ? [{ ...row, count: total - held, condition: 'ok' as Condition }] : []),
    { ...row, count: held },
  ];
}

export const INTAKE_CATEGORIES: Category[] = ['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown'];

export function canCombineIntake(a: { name?: string; category?: string; expiration?: string | null; condition?: Condition; barcode?: string | null }, b: typeof a): boolean {
  const name = (value?: string) => (value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  const sameName = !!name(a.name) && name(a.name) === name(b.name);
  const sameBarcode = !!a.barcode && !!b.barcode && a.barcode.replace(/^0+/, '') === b.barcode.replace(/^0+/, '');
  return (sameName || sameBarcode) && a.category === b.category && (a.expiration || null) === (b.expiration || null) && (a.condition || 'ok') === (b.condition || 'ok');
}
