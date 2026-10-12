const test = require('node:test');
const assert = require('node:assert/strict');

const DIET_TAGS = [
  'contains-wheat',
  'contains-milk',
  'contains-eggs',
  'contains-peanuts',
  'contains-tree-nuts',
  'contains-soy',
  'contains-fish',
  'contains-shellfish',
  'contains-sesame',
  'vegan',
  'vegetarian',
  'no-cook',
  'easy-open',
];

function normaliseDietTags(raw) {
  if (!Array.isArray(raw)) return [];
  const known = new Set(DIET_TAGS);
  const seen = new Set();
  for (const value of raw) {
    const tag = String(value ?? '').trim().toLowerCase();
    if (known.has(tag)) seen.add(tag);
  }
  return DIET_TAGS.filter(tag => seen.has(tag));
}

function allowedInBox(tags, excludes = [], requires = []) {
  const has = new Set(tags ?? []);
  for (const tag of excludes) if (has.has(tag)) return false;
  for (const tag of requires) if (!has.has(tag)) return false;
  return true;
}

test('normaliseDietTags preserves valid tags in canonical order and filters invalid tags', () => {
  const raw = ['vegetarian', 'contains-peanuts', 'invalid-tag', '  VEGAN  '];
  const res = normaliseDietTags(raw);
  assert.deepEqual(res, ['contains-peanuts', 'vegan', 'vegetarian']);
});

test('allowedInBox excludes items containing forbidden allergens', () => {
  const peanutButter = ['contains-peanuts', 'vegetarian'];
  assert.equal(allowedInBox(peanutButter, ['contains-peanuts'], []), false);
  assert.equal(allowedInBox(peanutButter, ['contains-wheat'], []), true);
});

test('allowedInBox requires all required tags strictly', () => {
  const cannedBeans = ['vegan', 'vegetarian', 'easy-open', 'no-cook'];
  assert.equal(allowedInBox(cannedBeans, [], ['no-cook']), true);
  assert.equal(allowedInBox(cannedBeans, [], ['no-cook', 'easy-open']), true);

  const dryBeans = ['vegan', 'vegetarian']; // Needs stove/cooking
  assert.equal(allowedInBox(dryBeans, [], ['no-cook']), false);
});

test('allowedInBox handles empty tags correctly (asymmetry safety rule)', () => {
  const untaggedItem = [];
  // Should pass exclusion (we don't know it contains peanuts)
  assert.equal(allowedInBox(untaggedItem, ['contains-peanuts'], []), true);
  // But should FAIL requirement (we can't promise it is no-cook)
  assert.equal(allowedInBox(untaggedItem, [], ['no-cook']), false);
});
