import type { BoxRules, BulkLot, InventoryItem } from './store';
import { isUsableStock } from './stock';

/**
 * Turns everything the pantry holds into one pool the allocator can draw from.
 *
 * Two things happen here, and both matter for correctness:
 *
 *  - Items that failed inspection (dented, rusted, broken seal, expired) are
 *    dropped. A dented can is physically present but must not be promised to a
 *    family until someone clears it.
 *  - Weighed bulk lots enter as synthetic items carrying their estimated unit
 *    count, so a 60 lb protein drop actually counts toward boxes instead of
 *    being invisible to the engine.
 */
export function buildStockUnits(inventory: InventoryItem[], bulkLots: BulkLot[] = []): InventoryItem[] {
  const usableItems = inventory.filter(i => isUsableStock(i) && i.count > 0);

  const bulkAsItems: InventoryItem[] = bulkLots
    .filter(lot => isUsableStock(lot) && lot.est_units > 0)
    .map(lot => ({
      id: lot.id,
      name: `Bulk ${lot.category} (${lot.weight_lbs} lb lot)`,
      category: lot.category,
      count: lot.est_units,
      expiration: lot.expiration,
      date_added: lot.date_added,
      source: 'donation' as const,
      condition: 'ok' as const,
      bulk_lot_id: lot.id,
    }));

  return [...usableItems, ...bulkAsItems];
}

/** True when this allocated row came from a weighed lot, so the UI can say "estimated". */
export const isBulkUnit = (item: InventoryItem) => !!item.bulk_lot_id;

export interface AllocationPlan {
  requestedBoxes: number;
  familySize: number;
  achievableBoxes: number;
  limitingCategory: keyof BoxRules;
  limitingCategoryCount: number;
  shortfallPerCategory: Record<keyof BoxRules, number>;
  categoryTotals: Record<keyof BoxRules, number>;
  perBoxNeeds: Record<keyof BoxRules, number>;
  allocatedItems: {
    item: InventoryItem;
    countToGrab: number;
    useFirst: boolean;
  }[];
  packingChecklist: {
    category: keyof BoxRules;
    neededPerBox: number;
    totalNeeded: number;
    allocatedCount: number;
    items: {
      id: string;
      name: string;
      count: number;
      expiration: string | null;
      useFirst: boolean;
    }[];
  }[];
}

export function computeAllocation(
  rawInventory: InventoryItem[],
  boxRules: BoxRules,
  requestedBoxes: number,
  familySize: number = 4,
  bulkLots: BulkLot[] = []
): AllocationPlan {
  // Damaged stock is excluded and weighed lots are folded in before any maths.
  const inventory = buildStockUnits(rawInventory, bulkLots);

  // Scale box template by family size factor (standard family size = 4)
  const familyScale = familySize / 4;
  const categories = Object.keys(boxRules) as (keyof BoxRules)[];

  const perBoxNeeds: Record<keyof BoxRules, number> = {} as any;
  const categoryTotals: Record<keyof BoxRules, number> = {} as any;
  const maxBoxesPossible: Record<keyof BoxRules, number> = {} as any;
  const shortfallPerCategory: Record<keyof BoxRules, number> = {} as any;

  categories.forEach(cat => {
    const baseRule = boxRules[cat] || 0;
    // Scale rule per box (min 1 if rule > 0)
    const scaledNeed = baseRule > 0 ? Math.max(1, Math.round(baseRule * familyScale)) : 0;
    perBoxNeeds[cat] = scaledNeed;

    // Calculate current total stock in this category
    const catItems = inventory.filter(i => i.category === cat);
    const totalStock = catItems.reduce((sum, item) => sum + item.count, 0);
    categoryTotals[cat] = totalStock;

    if (scaledNeed > 0) {
      maxBoxesPossible[cat] = Math.floor(totalStock / scaledNeed);
    } else {
      maxBoxesPossible[cat] = 999;
    }
  });

  // Find limiting category (minimum achievable boxes across required categories)
  let limitingCat: keyof BoxRules = 'protein';
  let minBoxes = Infinity;

  categories.forEach(cat => {
    if (perBoxNeeds[cat] > 0) {
      if (maxBoxesPossible[cat] < minBoxes) {
        minBoxes = maxBoxesPossible[cat];
        limitingCat = cat;
      }
    }
  });

  const achievableBoxes = Math.min(minBoxes === Infinity ? 0 : minBoxes, requestedBoxes);

  // Compute shortfall to reach target requested boxes
  categories.forEach(cat => {
    const totalNeededForTarget = requestedBoxes * perBoxNeeds[cat];
    const deficit = Math.max(0, totalNeededForTarget - categoryTotals[cat]);
    shortfallPerCategory[cat] = deficit;
  });

  // Expiration-aware Greedy Allocation (Pack soonest expiring items first)
  const allocatedItems: { item: InventoryItem; countToGrab: number; useFirst: boolean }[] = [];
  const packingChecklist: AllocationPlan['packingChecklist'] = [];

  const warningLimit = new Date();
  warningLimit.setDate(warningLimit.getDate() + 30);
  const warningStr = warningLimit.toISOString().split('T')[0];

  categories.forEach(cat => {
    const neededPerBox = perBoxNeeds[cat];
    const totalNeeded = achievableBoxes * neededPerBox;
    if (neededPerBox === 0 || totalNeeded === 0) return;

    // Fetch items for this category and sort by expiration ascending (nulls last)
    const catItems = inventory
      .filter(i => i.category === cat)
      .sort((a, b) => {
        if (!a.expiration && !b.expiration) return 0;
        if (!a.expiration) return 1;
        if (!b.expiration) return -1;
        return new Date(a.expiration).getTime() - new Date(b.expiration).getTime();
      });

    let remainingToFill = totalNeeded;
    const catAllocations: { id: string; name: string; count: number; expiration: string | null; useFirst: boolean }[] = [];

    for (const item of catItems) {
      if (remainingToFill <= 0) break;

      const countToTake = Math.min(item.count, remainingToFill);
      remainingToFill -= countToTake;

      const isExpiringSoon = !!item.expiration && item.expiration <= warningStr;

      allocatedItems.push({
        item,
        countToGrab: countToTake,
        useFirst: isExpiringSoon
      });

      catAllocations.push({
        id: item.id,
        name: item.name,
        count: countToTake,
        expiration: item.expiration,
        useFirst: isExpiringSoon
      });
    }

    packingChecklist.push({
      category: cat,
      neededPerBox,
      totalNeeded,
      allocatedCount: totalNeeded - remainingToFill,
      items: catAllocations
    });
  });

  return {
    requestedBoxes,
    familySize,
    achievableBoxes,
    limitingCategory: limitingCat,
    limitingCategoryCount: categoryTotals[limitingCat],
    shortfallPerCategory,
    categoryTotals,
    perBoxNeeds,
    allocatedItems,
    packingChecklist
  };
}
