import { DEFAULT_WARNING_DAYS, isPastDate, todayISO, windowEndISO } from './expiry';
import { BoxRules, BulkLot, InventoryItem, isUsableCondition } from './store';

/** What was on the shelf but kept out of the boxes, and why. */
export interface ExcludedStock {
  items: number;
  units: number;
}

/**
 * Turns everything the pantry can actually give out into one pool.
 *
 * Three things happen here, and all three matter for correctness:
 *
 *  - Items that failed inspection (dented, rusted, broken seal) are dropped. A
 *    dented can is physically present but must not be promised to a family
 *    until someone clears it.
 *  - Stock whose date has gone by is dropped, BY DATE and not by its condition
 *    flag. That flag is written once, when an item is scanned in, and then
 *    never revisited — so a tin scanned in good order in June with a date in
 *    July is still marked 'ok' in August, and anything typed in by hand was
 *    never checked at all. Worse, the allocator sorts by date ascending, so
 *    past-date stock was not merely included: it was sorted to the front and
 *    packed first. The app's most confident recommendation was the food it
 *    should least have been handing out.
 *  - Weighed bulk lots enter as synthetic items carrying their estimated unit
 *    count, so a 60 lb protein drop actually counts toward boxes instead of
 *    being invisible to the engine.
 */
export function buildStockUnits(
  inventory: InventoryItem[],
  bulkLots: BulkLot[] = [],
  today: string = todayISO(),
): InventoryItem[] {
  const usableItems = inventory.filter(
    i => isUsableCondition(i.condition) && i.count > 0 && !isPastDate(i.expiration, today),
  );

  const bulkAsItems: InventoryItem[] = bulkLots
    .filter(lot => lot.est_units > 0 && !isPastDate(lot.expiration, today))
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
  /**
   * The window these numbers were worked out against, so a screen can say "use
   * within 14 days" and mean it rather than quoting a setting the engine
   * ignored.
   */
  warningDays: number;
  /**
   * Stock deliberately left out of the plan. Surfaced rather than silently
   * dropped: a volunteer who can see twelve tins on the shelf and a plan that
   * refuses to use them is owed a reason.
   */
  excluded: {
    pastDate: ExcludedStock;
    flagged: ExcludedStock;
  };
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
  bulkLots: BulkLot[] = [],
  /**
   * The pantry's own settings. Optional so a test can pin the day, but every
   * caller in the app passes its warning window — this used to be hardcoded to
   * 30 days here while Settings offered 14, 21 or 30, so choosing 14 changed
   * every screen except the one that builds the boxes.
   */
  options: { warningDays?: number; today?: string } = {},
): AllocationPlan {
  const warningDays = options.warningDays ?? DEFAULT_WARNING_DAYS;
  const today = options.today ?? todayISO();

  // Damaged and out-of-date stock is excluded and weighed lots are folded in
  // before any maths.
  const inventory = buildStockUnits(rawInventory, bulkLots, today);

  const tally = (rows: InventoryItem[]): ExcludedStock => ({
    items: rows.length,
    units: rows.reduce((sum, i) => sum + i.count, 0),
  });
  const excluded = {
    pastDate: tally(rawInventory.filter(i => i.count > 0 && isPastDate(i.expiration, today))),
    flagged: tally(
      rawInventory.filter(
        i => i.count > 0 && !isUsableCondition(i.condition) && !isPastDate(i.expiration, today),
      ),
    ),
  };

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

  // The pantry's window, not a number baked in here.
  const warningStr = windowEndISO(warningDays, new Date(`${today}T00:00:00`));

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
    warningDays,
    excluded,
    allocatedItems,
    packingChecklist
  };
}
