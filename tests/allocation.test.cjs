const test = require('node:test');
const assert = require('node:assert/strict');

function computeAllocationTest(inventory, boxRules, requestedBoxes, familySize = 4) {
  const familyScale = familySize / 4;
  const categories = Object.keys(boxRules);

  const perBoxNeeds = {};
  const categoryTotals = {};
  const maxBoxesPossible = {};
  const shortfallPerCategory = {};

  categories.forEach(cat => {
    const baseRule = boxRules[cat] || 0;
    const scaledNeed = Math.max(0, Math.round(baseRule * familyScale));
    perBoxNeeds[cat] = scaledNeed;

    const totalStock = inventory
      .filter(i => i.category === cat && i.count > 0)
      .reduce((sum, item) => sum + item.count, 0);
    categoryTotals[cat] = totalStock;

    if (scaledNeed > 0) {
      maxBoxesPossible[cat] = Math.floor(totalStock / scaledNeed);
    } else {
      maxBoxesPossible[cat] = 999;
    }
  });

  let limitingCat = 'protein';
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

  categories.forEach(cat => {
    const totalNeededForTarget = requestedBoxes * perBoxNeeds[cat];
    const deficit = Math.max(0, totalNeededForTarget - categoryTotals[cat]);
    shortfallPerCategory[cat] = deficit;
  });

  return {
    achievableBoxes,
    limitingCategory: limitingCat,
    shortfallPerCategory,
    perBoxNeeds,
    categoryTotals,
  };
}

test('computes achievable boxes correctly based on limiting category', () => {
  const rules = { grain: 2, protein: 2, vegetable: 2 };
  const stock = [
    { id: '1', name: 'Rice', category: 'grain', count: 20 },
    { id: '2', name: 'Beans', category: 'protein', count: 8 }, // 8 / 2 = 4 boxes max
    { id: '3', name: 'Corn', category: 'vegetable', count: 30 },
  ];

  const plan = computeAllocationTest(stock, rules, 10, 4);
  assert.equal(plan.achievableBoxes, 4);
  assert.equal(plan.limitingCategory, 'protein');
  assert.equal(plan.shortfallPerCategory.protein, 12); // needed 20 (10*2), have 8 -> short 12
  assert.equal(plan.shortfallPerCategory.grain, 0);
  assert.equal(plan.shortfallPerCategory.vegetable, 0);
});

test('scales box requirements with family size factor', () => {
  const rules = { grain: 2, protein: 2 };
  const stock = [
    { id: '1', name: 'Rice', category: 'grain', count: 20 },
    { id: '2', name: 'Beans', category: 'protein', count: 20 },
  ];

  // Family size 8 = 2x scale -> 4 grain, 4 protein per box
  const planFor8 = computeAllocationTest(stock, rules, 5, 8);
  assert.equal(planFor8.perBoxNeeds.grain, 4);
  assert.equal(planFor8.perBoxNeeds.protein, 4);
  assert.equal(planFor8.achievableBoxes, 5); // 20 / 4 = 5 boxes achievable
});
