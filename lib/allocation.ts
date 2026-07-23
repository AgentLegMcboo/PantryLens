import { BoxRules, InventoryItem } from './store';

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
  inventory: InventoryItem[],
  boxRules: BoxRules,
  requestedBoxes: number,
  familySize: number = 4
): AllocationPlan {
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
    const scaledNeed = Math.max(0, Math.round(baseRule * familyScale));
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
