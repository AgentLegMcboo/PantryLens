const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { canCombineIntake, parsePrintedDate, parseQuickAdd, splitInspection } = require('../lib/intake.ts');
const { mergeDuplicates } = require('../lib/scan-normalize.ts');
const { partnerReportCsv, reportingMonth } = require('../lib/partner-report.ts');
const reading = (count, imageIndex, extra = {}) => ({ name: 'Beans 15 oz', category: 'protein', count, imageIndex, expiration: null, condition: 'ok', confidence: 0.8, box: null, ...extra });

test('separate capture groups never erase separate physical stock', () => {
  const input = [reading(6, 0), reading(8, 1), reading(4, 2)];
  const rows = mergeDuplicates(input, [0, 0, 1]);
  assert.deepEqual(rows.map(r => r.count), [8, 4]);
  assert.equal(rows[0].sourceDetections.length, 2);
  assert.deepEqual(rows[0].sourceDetections.map(r => r.imageIndex), [0, 1]);
});
test('within-photo stacks add, across-angle counts use max, totals exceed 99', () => {
  const rows = mergeDuplicates([reading(70, 0), reading(60, 0), reading(80, 1)]);
  assert.equal(rows[0].count, 130);
  assert.equal(rows[0].sourceDetections.length, 3);
});
test('dates, sizes and conditions keep distinct batches separate', () => {
  assert.equal(mergeDuplicates([reading(2, 0), reading(3, 1, { expiration: '2027-01-01' }), reading(2, 2, { condition: 'dented' }), reading(4, 3, { name: 'Beans 28 oz' })]).length, 4);
  assert.equal(mergeDuplicates([reading(2, 0, { name: 'Beans 1.5 oz' }), reading(2, 1, { name: 'Beans 15 oz' })]).length, 2);
  assert.equal(canCombineIntake(reading(2, 0), reading(2, 1)), true);
  assert.equal(canCombineIntake(reading(2, 0), reading(2, 1, { name: 'Beans 28 oz' })), false);
  assert.equal(canCombineIntake(reading(2, 0), reading(2, 1, { condition: 'dented' })), false);
});
test('original readings can be restored without losing counts or boxes', () => {
  const input = [reading(3, 0), reading(7, 1)];
  const merged = mergeDuplicates(input)[0];
  assert.equal(merged.count, 7);
  assert.equal(merged.sourceDetections.reduce((n, row) => n + row.count, 0), 10);
});
test('arbitrary Quick Adds accept quantities beyond all preset sizes', () => {
  assert.equal(parseQuickAdd('157 cans of chickpeas').count, 157);
  assert.equal(parseQuickAdd('12 cans black beans').name, 'black beans');
  assert.equal(parseQuickAdd('dragon fruit').name, 'dragon fruit');
  assert.equal(parseQuickAdd('0 cans beans'), null);
});
test('cases and packs require an explicit pack size', () => {
  assert.equal(parseQuickAdd('2 cases of beans').needsPackSize, true);
  assert.equal(parseQuickAdd('2 cases of beans', 24).count, 48);
  assert.equal(parseQuickAdd('2 packs pasta', 8).count, 16);
  assert.equal(parseQuickAdd('2 cases beans', 0).needsPackSize, true);
});
test('printed dates reject impossible days and preserve unknown', () => {
  assert.equal(parsePrintedDate('2027-02-30'), null);
  assert.equal(parsePrintedDate('2028-02-29'), '2028-02-29');
  assert.equal(parsePrintedDate('09/2027'), '2027-09-01');
  assert.equal(parsePrintedDate('2027-09'), '2027-09-01');
  assert.equal(parsePrintedDate(''), null);
  assert.equal(parsePrintedDate('01/02/27'), null);
});
test('damage splitting conserves units and quarantines only affected units', () => {
  const rows = splitInspection({ count: 12, condition: 'dented', expiration: '2027-01-01' }, 2);
  assert.deepEqual(rows.map(row => [row.count, row.condition]), [[10, 'ok'], [2, 'dented']]);
  assert.equal(rows.reduce((n, row) => n + row.count, 0), 12);
  assert.throws(() => splitInspection({ count: 3, condition: 'ok' }, 1));
  assert.throws(() => splitInspection({ count: 3, condition: 'dented' }, 4));
});
test('monthly export separates corrections and missing measurements', () => {
  const window = reportingMonth('2026-10');
  assert.ok(window); assert.equal(reportingMonth('2026-13'), null);
  const rows = ['given_out', 'discarded', 'correction'].map((reason, index) => ({ id: String(index), category: 'protein', count: index + 1, reason, occurred_at: window.start }));
  rows.push({ category: 'protein', count: 999, reason: 'given_out', occurred_at: window.end });
  const csv = partnerReportCsv('=danger', '2026-10', rows, [], '2026-11-01');
  assert.ok(csv.includes('"1","2","3","","",""'));
  assert.ok(!csv.includes('999')); assert.ok(csv.includes("'=danger"));
  assert.ok(csv.includes('not month-end stock'));
});
