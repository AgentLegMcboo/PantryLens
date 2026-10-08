import type { BulkLot, Category, InventoryItem } from "./store";

/** Calendar dates follow the pantry device's local day, including today. */
export function isUsableStock(item: { condition?: string; expiration?: string | null }) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (item.condition ?? "ok") === "ok" && (!item.expiration || item.expiration >= today);
}

export function stockTotals(
  inventory: InventoryItem[],
  bulkLots: BulkLot[] = [],
): Record<Category, number> {
  const totals: Record<Category, number> = {
    grain: 0,
    vegetable: 0,
    protein: 0,
    breakfast: 0,
    snack: 0,
    hygiene: 0,
    baby: 0,
    unknown: 0,
  };
  for (const item of inventory)
    if (isUsableStock(item))
      totals[item.category] += Math.max(0, item.count);
  for (const lot of bulkLots)
    if (isUsableStock(lot)) totals[lot.category] += Math.max(0, lot.est_units);
  return totals;
}

export function donationMessage(
  name: string,
  deficits: { category: string; deficit: number }[],
  examples: Record<string, string>,
  dropOff: string,
) {
  return `MOST NEEDED — ${name || "Our pantry"}\n\n${deficits.map((d) => `• ${d.category.toUpperCase()} — ${d.deficit} more needed\n  ${examples[d.category] ?? "Shelf-stable donations"}`).join("\n\n")}\n\n${dropOff.trim() ? `Drop-off: ${dropOff.trim()}\n` : ""}Thank you for helping feed our neighbours.`;
}
