const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute production allocation and persistence helpers, with only the native
// store boundary stubbed. These assertions exercise the actual pick algorithm.
const cache = new Map();
function load(name) {
  if (name === './store') return { isUsableCondition: condition => (condition ?? 'ok') === 'ok' };
  if (cache.has(name)) return cache.get(name);
  const exported = {};
  cache.set(name, exported);
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib', name.replace('./', '') + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports: exported, require: load });
  return exported;
}
const { computeAllocation } = load('./allocation');
const { normaliseFamilySizes, normalisePackedContents } = load('./box-families');
const { persistPackBatch } = load('./pack-batch');
const plain = value => JSON.parse(JSON.stringify(value));
const rules = { grain: 2, protein: 2, vegetable: 2, breakfast: 0, snack: 0, hygiene: 0, baby: 0 };
const stock = (id, category, count, extra = {}) => ({
  id, name: id, category, count, expiration: null, condition: 'ok', ...extra,
});
const supply = count => ['grain', 'protein', 'vegetable'].map(cat => stock(cat, cat, count));
const planFor = (items, sizes, extra = {}, customRules = rules, lots = []) =>
  computeAllocation(items, customRules, sizes.length, 4, lots, { today: '2026-10-18', familySizes: sizes, ...extra });

test('uniform boxes retain the limiting category and family scaling', () => {
  const plan = computeAllocation([stock('rice', 'grain', 20), stock('beans', 'protein', 8), stock('corn', 'vegetable', 30)], rules, 10, 4);
  assert.equal(plan.achievableBoxes, 4);
  assert.equal(plan.limitingCategory, 'protein');
  assert.equal(plan.shortfallPerCategory.protein, 12);
  const large = computeAllocation(supply(20), rules, 5, 8);
  assert.equal(large.perBoxNeeds.grain, 4);
  assert.equal(large.achievableBoxes, 5);
});

test('twenty boxes can all have different family sizes and exact individual recipes', () => {
  const sizes = Array.from({ length: 20 }, (_, index) => index + 1);
  const plan = planFor(supply(1000), sizes);
  assert.equal(plan.achievableBoxes, 20);
  assert.deepEqual(plain(plan.boxes.map(box => box.familySize)), sizes);
  const expectedGrain = sizes.reduce((n, size) => n + Math.max(1, Math.round(size / 2)), 0);
  assert.equal(plan.totalNeededPerCategory.grain, expectedGrain);
  assert.equal(plan.packingChecklist.find(group => group.category === 'grain').totalNeeded, expectedGrain);
  for (const box of plan.boxes) {
    for (const cat of ['grain', 'protein', 'vegetable']) {
      assert.equal(box.allocatedItems.filter(pick => pick.item.category === cat).reduce((n, pick) => n + pick.countToGrab, 0), box.perBoxNeeds[cat]);
    }
  }
});

test('rounding happens for each household before totals are added', () => {
  const plan = planFor(supply(20), [5, 5]);
  assert.equal(plan.totalNeededPerCategory.grain, 6);
  assert.equal(plan.boxes[0].perBoxNeeds.grain, 3);
});

test('a stock shortage packs a complete prefix in the requested order', () => {
  const plan = planFor(supply(5), [4, 8, 2]);
  assert.equal(plan.achievableBoxes, 1);
  assert.equal(plan.shortfallPerCategory.grain, 2);
  assert.equal(plan.boxes[0].number, 1);
  assert.equal(plan.packingChecklist.find(group => group.category === 'grain').totalNeeded, 2);
  assert.equal(plan.allocatedItems.reduce((n, pick) => n + pick.countToGrab, 0), 6);
});

test('family edits preserve existing sizes when the number of boxes changes', () => {
  assert.deepEqual(plain(normaliseFamilySizes([2, 7, 9], 5, 4)), [2, 7, 9, 4, 4]);
  assert.deepEqual(plain(normaliseFamilySizes([2, 7, 9], 2, 4)), [2, 7]);
  assert.deepEqual(plain(normaliseFamilySizes([0, null, 'invalid', 5.9, 150], 5, 6)), [6, 6, 6, 5, 99]);
});

test('fixed-content kits retain household sizes without scaling food', () => {
  const plan = planFor(supply(20), [1, 7, 20], { scalesWithFamily: false });
  assert.equal(plan.totalNeededPerCategory.grain, 6);
  assert.deepEqual(plain(plan.boxes.map(box => box.familySize)), [1, 7, 20]);
  assert.ok(plan.boxes.every(box => box.perBoxNeeds.grain === 2));
});

test('named products scale per household and are never also used as generic stock', () => {
  const inventory = [...supply(30), stock('tuna', 'protein', 4, { name: 'Tuna' })];
  const plan = planFor(inventory, [4, 8, 4], { items: [{ name: 'Tuna', category: 'protein', count: 1 }] });
  assert.equal(plan.achievableBoxes, 3);
  assert.deepEqual(plain(plan.boxes.map(box => box.itemNeeds[0].count)), [1, 2, 1]);
  assert.equal(plan.allocatedItems.filter(pick => pick.item.id === 'tuna').reduce((n, pick) => n + pick.countToGrab, 0), 4);
  const short = planFor(inventory.map(item => item.id === 'tuna' ? { ...item, count: 2 } : item), [4, 8, 4], { items: [{ name: 'Tuna', category: 'protein', count: 1 }] });
  assert.equal(short.achievableBoxes, 1);
  assert.equal(short.limitingItem.short, 2);
});

test('mixed boxes still exclude expired, damaged, and dietary-ineligible food', () => {
  const inventory = [
    ...supply(4).map(item => ({ ...item, diet_tags: ['vegan'] })),
    stock('expired', 'grain', 100, { expiration: '2026-10-17', diet_tags: ['vegan'] }),
    stock('dented', 'protein', 100, { condition: 'dented', diet_tags: ['vegan'] }),
    stock('untagged', 'vegetable', 100),
  ];
  const plan = planFor(inventory, [4, 8], { requires: ['vegan'] });
  assert.equal(plan.achievableBoxes, 1);
  assert.equal(plan.excluded.pastDate.units, 100);
  assert.equal(plan.excluded.flagged.units, 100);
  assert.equal(plan.excluded.dietary.units, 100);
});

test('per-box picks conserve shelf and bulk units and keep use-first food first', () => {
  const inventory = [stock('old', 'grain', 2, { expiration: '2026-10-20' }), stock('new', 'grain', 20)];
  const lots = [{ id: 'lot', category: 'protein', est_units: 20, weight_lbs: 10, expiration: null }];
  const recipe = { ...rules, vegetable: 0 };
  const plan = planFor(inventory, [4, 8, 6], {}, recipe, lots);
  assert.equal(plan.boxes[0].allocatedItems.find(pick => pick.item.id === 'old').countToGrab, 2);
  assert.ok(plan.boxes[0].allocatedItems.find(pick => pick.item.id === 'old').useFirst);
  for (const row of plan.allocatedItems) {
    const splitTotal = plan.boxes.flatMap(box => box.allocatedItems).filter(pick => pick.item.id === row.item.id).reduce((n, pick) => n + pick.countToGrab, 0);
    assert.equal(splitTotal, row.countToGrab);
    assert.ok(splitTotal <= row.item.count);
  }
});

test('an empty recipe produces no boxes', () => {
  const plan = planFor(supply(100), [4, 6], {}, Object.fromEntries(Object.keys(rules).map(cat => [cat, 0])));
  assert.equal(plan.achievableBoxes, 0);
  assert.equal(plan.boxes.length, 0);
});

test('ready-box metadata keeps the family size, box number, and named contents after reload', () => {
  const contents = normalisePackedContents({ ...rules, familySize: 7, boxNumber: 12, items: [{ name: 'Tuna', category: 'protein', count: 2 }] });
  assert.equal(contents.familySize, 7);
  assert.equal(contents.boxNumber, 12);
  assert.equal(contents.items[0].name, 'Tuna');
  assert.equal(normalisePackedContents(rules).familySize, undefined);
  const large = normalisePackedContents({ ...rules, grain: 150, familySize: 99, items: [{ name: 'Rice', category: 'grain', count: 150 }] });
  assert.equal(large.grain, 150);
  assert.equal(large.items[0].count, 150);
});

test('retrying a partially saved batch uses the same IDs and cannot deduct stock twice', async () => {
  const packs = ['box-1', 'box-2', 'box-3'].map(runId => ({ runId, boxCount: 1, lines: [] }));
  const saved = new Set();
  let fail = true, deductions = 0, refreshes = 0;
  const submit = async pack => {
    if (pack.runId === 'box-2' && fail) throw new Error('offline');
    const replayed = saved.has(pack.runId);
    if (!replayed) { saved.add(pack.runId); deductions++; }
    return { units_taken: 3, shortfalls: [], replayed };
  };
  const refresh = async () => { refreshes++; };
  await assert.rejects(persistPackBatch(packs, submit, refresh), /offline/);
  assert.equal(saved.size, 1);
  fail = false;
  await persistPackBatch(packs, submit, refresh);
  assert.equal(saved.size, 3);
  assert.equal(deductions, 3);
  assert.equal(refreshes, 2);
});
