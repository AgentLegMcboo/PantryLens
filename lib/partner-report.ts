import type { InventoryItem } from './store';
import type { StockExit } from './reports';

export function reportingMonth(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (year < 2000 || year > 2100) return null;
  return { start: new Date(year, month - 1, 1).toISOString(), end: new Date(year, month, 1).toISOString() };
}

const cell = (value: unknown) => {
  let text = String(value ?? '');
  // Spreadsheet formulas are data, never executable cells in shared exports.
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/** Units stay units. Missing measurements stay blank, never invented pounds/meals. */
export function partnerReportCsv(pantry: string, month: string, exits: StockExit[], inventory: InventoryItem[], generatedAt: string) {
  const window = reportingMonth(month);
  if (!window) throw new Error('Choose a real reporting month, YYYY-MM.');
  const start = new Date(window.start).getTime(), end = new Date(window.end).getTime();
  const scoped = exits.filter(exit => { const occurred = new Date(exit.occurred_at).getTime(); return occurred >= start && occurred < end; });
  const categories = [...new Set([...scoped.map(e => e.category), ...inventory.map(i => i.category)])].sort();
  const rows: unknown[][] = categories.map(category => {
    const count = (reason: StockExit['reason']) => scoped.filter(e => e.category === category && e.reason === reason).reduce((sum, e) => sum + e.count, 0);
    const stock = inventory.filter(i => i.category === category);
    return [pantry, month, category, count('given_out'), count('discarded'), count('correction'), '', '', '', stock.reduce((sum, i) => sum + i.count, 0), stock.filter(i => (i.condition ?? 'ok') !== 'ok').reduce((sum, i) => sum + i.count, 0), generatedAt, 'Exit log only; received totals, measured distributed weight and household counts not collected. Stock is a current snapshot, not month-end stock.'];
  });
  if (!rows.length) rows.push([pantry, month, 'No recorded activity', 0, 0, 0, '', '', '', 0, 0, generatedAt, 'No recorded activity is not proof of no activity. Missing measurements are blank.']);
  return '\uFEFF' + [
    ['Pantry', 'Reporting month', 'Category', 'Distributed units (recorded)', 'Discarded units (recorded)', 'Correction units (recorded)', 'Total received units (not collected)', 'Distributed pounds (not measured)', 'Households served (not collected)', 'Current stock units', 'Current condition-held units', 'Snapshot generated at', 'Coverage notes'],
    ...rows,
  ].map(row => row.map(cell).join(',')).join('\r\n');
}
