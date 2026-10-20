import { allowedInBox } from './diet';
import { normaliseFamilySizes } from './box-families';
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
  /**
   * What this particular box will not carry, and what it must.
   *
   * Empty by default, which is every box that existed before. A box with
   * constraints draws from a narrower pool — that is the point — and the
   * narrowing happens here so categoryTotals, achievableBoxes and the pick list
   * all agree about what is available. See lib/diet.ts for why an untagged tin
   * survives an exclusion but fails a requirement.
   */
  constraints: { excludes?: string[]; requires?: string[] } = {},
): InventoryItem[] {
  const { excludes = [], requires = [] } = constraints;
  const usableItems = inventory.filter(
    i =>
      isUsableCondition(i.condition) &&
      i.count > 0 &&
      !isPastDate(i.expiration, today) &&
      allowedInBox(i.diet_tags, excludes, requires),
  );

  // A weighed lot is a pile of mixed product nobody has read a label on, so it
  // carries no tags — which means it cannot satisfy a requirement, and a
  // no-cook box will not be filled out of a 60 lb pallet. That is correct.
  const bulkAsItems: InventoryItem[] = bulkLots
    .filter(
      lot =>
        lot.est_units > 0 &&
        !isPastDate(lot.expiration, today) &&
        allowedInBox([], excludes, requires),
    )
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

export interface IndividualBoxPlan {
  number: number;
  familySize: number;
  perBoxNeeds: BoxRules;
  itemNeeds: { name: string; category: keyof BoxRules; count: number }[];
  allocatedItems: AllocationPlan['allocatedItems'];
}

export interface AllocationPlan {
  requestedBoxes: number;
  familySize: number;
  achievableBoxes: number;
  /** Requested household sizes in packing order. Only a complete prefix is packed. */
  familySizes: number[];
  totalNeededPerCategory: Record<keyof BoxRules, number>;
  boxes: IndividualBoxPlan[];
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
    /** Held back by THIS box's dietary constraints, not by anything wrong with it. */
    dietary: ExcludedStock;
  };
  /**
   * Set when a specific item, not a category, is what runs out first: the
   * item's name and how many more of it the requested boxes need.
   */
  limitingItem: { name: string; short: number } | null;
  /** The constraints this plan was built under, so a screen can explain itself. */
  constraints: { excludes: string[]; requires: string[] };
  allocatedItems: {
    item: InventoryItem;
    countToGrab: number;
    useFirst: boolean;
  }[];
  packingChecklist: {
    category: keyof BoxRules;
    /** Set for a specific item: its name, shown instead of the category. */
    label?: string;
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
  options: {
    /** One household size per requested box; missing entries use familySize. */
    familySizes?: number[];
    /** Fixed-size kits still record household sizes without scaling contents. */
    scalesWithFamily?: boolean;
    warningDays?: number;
    today?: string;
    /** This box's dietary rules. See buildStockUnits. */
    excludes?: string[];
    requires?: string[];
    /** Particular products this box must hold, on top of the category amounts. */
    items?: { name: string; category: keyof BoxRules; count: number }[];
  } = {},
): AllocationPlan {
  const warningDays = options.warningDays ?? DEFAULT_WARNING_DAYS;
  const today = options.today ?? todayISO();
  const excludes = options.excludes ?? [];
  const requires = options.requires ?? [];

  // Damaged and out-of-date stock is excluded and weighed lots are folded in
  // before any maths.
  const allStock = buildStockUnits(rawInventory, bulkLots, today, { excludes, requires });
  const specific = (options.items ?? []).filter(i => i.name.trim() && i.count > 0);
  const nameKey = (n: string) => n.trim().toLowerCase();
  const specificNames = new Set(specific.map(i => nameKey(i.name)));
  // A product the box names is kept for its own slot, so the category maths
  // can't hand it out as "any protein" as well.
  const inventory = allStock.filter(i => !specificNames.has(nameKey(i.name)));

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
    // Perfectly good food this box cannot take. Counted apart from the other two
    // because it needs a different sentence: nothing is wrong with it, it just
    // is not for this household.
    dietary: tally(
      rawInventory.filter(
        i =>
          i.count > 0 &&
          isUsableCondition(i.condition) &&
          !isPastDate(i.expiration, today) &&
          !allowedInBox(i.diet_tags, excludes, requires),
      ),
    ),
  };

  // Scale box template by family size factor (standard family size = 4)
  const familySizes = normaliseFamilySizes(options.familySizes, requestedBoxes, familySize);
  const scales = options.scalesWithFamily !== false;
  const scaleNeed = (base: number, size: number) => base > 0
    ? Math.max(1, Math.round(base * (scales ? size / 4 : 1))) : 0;
  const sum = (values: number[], count = values.length) => values.slice(0, count).reduce((n, value) => n + value, 0);
  // Keep the volunteer's box order. A larger household never silently gets
  // skipped just to make the headline count higher.
  const coveredCount = (needs: number[], stock: number) => {
    let used = 0;
    let count = 0;
    for (const need of needs) {
      if (used + need > stock) break;
      used += need;
      count++;
    }
    return count;
  };
  const categories = Object.keys(boxRules) as (keyof BoxRules)[];

  const perBoxNeeds: Record<keyof BoxRules, number> = {} as any;
  const needsByCategory: Record<keyof BoxRules, number[]> = {} as any;
  const totalNeededPerCategory: Record<keyof BoxRules, number> = {} as any;
  const categoryTotals: Record<keyof BoxRules, number> = {} as any;
  const maxBoxesPossible: Record<keyof BoxRules, number> = {} as any;
  const shortfallPerCategory: Record<keyof BoxRules, number> = {} as any;

  categories.forEach(cat => {
    const baseRule = boxRules[cat] || 0;
    // Scale rule per box (min 1 if rule > 0)
    const needs = familySizes.map(size => scaleNeed(baseRule, size));
    needsByCategory[cat] = needs;
    totalNeededPerCategory[cat] = sum(needs);
    const scaledNeed = needs[0] ?? 0;
    perBoxNeeds[cat] = scaledNeed;

    // Calculate current total stock in this category
    const catItems = inventory.filter(i => i.category === cat);
    const totalStock = catItems.reduce((sum, item) => sum + item.count, 0);
    categoryTotals[cat] = totalStock;

    if (scaledNeed > 0) {
      maxBoxesPossible[cat] = coveredCount(needs, totalStock);
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

  // Each named product limits the box count the same way a category does.
  const itemNeeds = specific.map(rule => {
    const needs = familySizes.map(size => scaleNeed(rule.count, size));
    const perBox = needs[0] ?? 0;
    const rows = allStock.filter(i => nameKey(i.name) === nameKey(rule.name));
    const stock = rows.reduce((sum, i) => sum + i.count, 0);
    return { rule, perBox, needs, rows, stock, max: coveredCount(needs, stock) };
  });
  const tightestItem = itemNeeds.reduce<(typeof itemNeeds)[number] | null>(
    (worst, n) => (!worst || n.max < worst.max ? n : worst),
    null,
  );
  let limitingItem: AllocationPlan['limitingItem'] = null;
  if (tightestItem && tightestItem.max < minBoxes) {
    minBoxes = tightestItem.max;
    const short = Math.max(0, sum(tightestItem.needs) - tightestItem.stock);
    if (short > 0) limitingItem = { name: tightestItem.rule.name, short };
  }

  const achievableBoxes = Math.min(minBoxes === Infinity ? 0 : minBoxes, requestedBoxes);

  // Compute shortfall to reach target requested boxes
  categories.forEach(cat => {
    const totalNeededForTarget = totalNeededPerCategory[cat];
    const deficit = Math.max(0, totalNeededForTarget - categoryTotals[cat]);
    shortfallPerCategory[cat] = deficit;
  });

  // Expiration-aware Greedy Allocation (Pack soonest expiring items first)
  const allocatedItems: { item: InventoryItem; countToGrab: number; useFirst: boolean }[] = [];
  const packingChecklist: AllocationPlan['packingChecklist'] = [];

  // The pantry's window, not a number baked in here.
  const warningStr = windowEndISO(warningDays, new Date(`${today}T00:00:00`));

  // Named products first, soonest date first, each as its own pick-list line.
  for (const need of itemNeeds) {
    const totalNeeded = sum(need.needs, achievableBoxes);
    if (totalNeeded === 0) continue;
    let left = totalNeeded;
    const lines: AllocationPlan['packingChecklist'][number]['items'] = [];
    const rows = [...need.rows].sort((a, b) =>
      !a.expiration ? 1 : !b.expiration ? -1 : a.expiration.localeCompare(b.expiration),
    );
    for (const item of rows) {
      if (left <= 0) break;
      const units = Math.min(item.count, left);
      left -= units;
      const useFirst = !!item.expiration && item.expiration <= warningStr;
      allocatedItems.push({ item, countToGrab: units, useFirst });
      lines.push({ id: item.id, name: item.name, count: units, expiration: item.expiration, useFirst });
    }
    packingChecklist.push({
      category: need.rule.category,
      label: need.rule.name,
      neededPerBox: need.perBox,
      totalNeeded,
      allocatedCount: totalNeeded - left,
      items: lines,
    });
  }

  categories.forEach(cat => {
    const neededPerBox = perBoxNeeds[cat];
    const totalNeeded = sum(needsByCategory[cat], achievableBoxes);
    if (neededPerBox === 0 || totalNeeded === 0) return;

    /**
     * The order this category gets picked in, and the one place in the engine
     * where "what the pantry needs" and "what the family needs" disagree.
     *
     * Soonest-expiring first prevents waste, and for anything close to its date
     * that still wins outright. But it used to be the ONLY rule, which meant a
     * category was drained one product at a time: a pantry sitting on forty
     * units of carrot juice filled every vegetable slot in every box with
     * carrot juice until it ran out.
     *
     * That is the mechanism behind the complaint people who use food banks make
     * most often — "we get the same things every week". It is not indifference,
     * it is a greedy loop, and nobody chose it.
     *
     *   1. Anything inside the expiry window goes first, in date order. Urgency
     *      is not negotiable; food about to be binned helps nobody.
     *   2. Everything else is taken in ROTATION across distinct products, so
     *      twelve boxes get a spread of what is on the shelf rather than twelve
     *      servings of whichever tin happened to sort first.
     *
     * Variety cannot be invented from a shelf holding one product. This only
     * makes sure it is not thrown away when the shelf holds several.
     */
    const byDate = (a: InventoryItem, b: InventoryItem) => {
      if (!a.expiration) return 1;
      if (!b.expiration) return -1;
      return a.expiration.localeCompare(b.expiration);
    };

    const inCategory = inventory.filter(i => i.category === cat).sort(byDate);
    const urgent = inCategory.filter(i => !!i.expiration && i.expiration <= warningStr);
    const unhurried = inCategory.filter(i => !(!!i.expiration && i.expiration <= warningStr));

    // Grouped by product, each group still in date order, then interleaved.
    const groups = new Map<string, InventoryItem[]>();
    for (const item of unhurried) {
      const key = item.name.trim().toLowerCase();
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }

    const rotated: InventoryItem[] = [];
    const lanes = [...groups.values()];
    for (let depth = 0; rotated.length < unhurried.length; depth++) {
      for (const lane of lanes) {
        if (depth < lane.length) rotated.push(lane[depth]);
      }
    }

    let remainingToFill = totalNeeded;
    /** Units taken from each row, by row id. Built before anything is emitted. */
    const take = new Map<string, number>();
    const order: InventoryItem[] = [];

    const grab = (item: InventoryItem, units: number) => {
      if (units <= 0) return;
      if (!take.has(item.id)) order.push(item);
      take.set(item.id, (take.get(item.id) ?? 0) + units);
      remainingToFill -= units;
    };

    // 1. Urgency, uncapped and in strict date order. Food about to be binned
    //    helps nobody, and spreading it thinner does not make it last.
    for (const item of urgent) {
      if (remainingToFill <= 0) break;
      grab(item, Math.min(item.count, remainingToFill));
    }

    /**
     * 2. Everything else, with a ceiling per PRODUCT.
     *
     * Reordering the list alone changed nothing, because the loop took the whole
     * of the first row before looking at the second: forty units of carrot juice
     * still filled all thirty-six vegetable slots. The ceiling is the actual
     * fix — roughly an equal share each, so twelve boxes get a spread.
     *
     * Per product rather than per row, or a product split across ten deliveries
     * would quietly get ten times the share of one that arrived in a single case.
     */
    const lanesRemaining = Math.max(1, lanes.length);
    const cap = Math.max(1, Math.ceil(remainingToFill / lanesRemaining));
    const takenPerProduct = new Map<string, number>();

    for (const item of rotated) {
      if (remainingToFill <= 0) break;
      const key = item.name.trim().toLowerCase();
      const already = takenPerProduct.get(key) ?? 0;
      const allowance = Math.min(cap - already, item.count, remainingToFill);
      if (allowance <= 0) continue;
      takenPerProduct.set(key, already + allowance);
      grab(item, allowance);
    }

    // 3. Whatever the ceiling left short, filled without it. A box that is
    //    short because of a fairness rule would be a worse box, not a fairer one.
    for (const item of rotated) {
      if (remainingToFill <= 0) break;
      const left = item.count - (take.get(item.id) ?? 0);
      grab(item, Math.min(left, remainingToFill));
    }

    const catAllocations: { id: string; name: string; count: number; expiration: string | null; useFirst: boolean }[] = [];

    for (const item of order) {
      const countToTake = take.get(item.id) ?? 0;
      if (countToTake <= 0) continue;
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

  const boxes: IndividualBoxPlan[] = familySizes.slice(0, achievableBoxes).map((size, index) => ({
    number: index + 1,
    familySize: size,
    perBoxNeeds: Object.fromEntries(categories.map(cat => [cat, needsByCategory[cat][index]])) as unknown as BoxRules,
    itemNeeds: itemNeeds.map(need => ({ ...need.rule, count: need.needs[index] })),
    allocatedItems: [],
  }));
  const itemById = new Map(allocatedItems.map(pick => [pick.item.id, pick.item]));
  // Split the combined trolley list back into exact box contents. Stock is
  // consumed once, including named products and estimated bulk-lot units.
  for (const group of packingChecklist) {
    const remaining = group.items.map(item => ({ ...item }));
    let rowIndex = 0;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index];
      let left = group.label
        ? box.itemNeeds.find(item => nameKey(item.name) === nameKey(group.label!))?.count ?? 0
        : box.perBoxNeeds[group.category];
      while (left > 0 && rowIndex < remaining.length) {
        const row = remaining[rowIndex];
        const countToGrab = Math.min(left, row.count);
        const item = itemById.get(row.id)!;
        if (countToGrab > 0) box.allocatedItems.push({ item, countToGrab, useFirst: row.useFirst });
        row.count -= countToGrab;
        left -= countToGrab;
        if (row.count === 0) rowIndex++;
      }
    }
  }

  return {
    requestedBoxes,
    familySize,
    familySizes,
    totalNeededPerCategory,
    boxes,
    achievableBoxes,
    limitingCategory: limitingCat,
    limitingCategoryCount: categoryTotals[limitingCat],
    shortfallPerCategory,
    categoryTotals,
    perBoxNeeds,
    warningDays,
    excluded,
    limitingItem,
    constraints: { excludes, requires },
    allocatedItems,
    packingChecklist
  };
}
