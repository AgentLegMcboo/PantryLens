const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real implementation rather than a copied typography function.
const compiled = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../lib/accessibility.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, {
  exports: moduleExports,
  require(name) {
    if (name === '@react-native-async-storage/async-storage') return { getItem: async () => null };
    if (name === '../constants/theme') return { fw: weight => weight };
    if (name === 'zustand') return { create: () => ({ setState() {} }) };
    throw new Error(`Unexpected import: ${name}`);
  },
});
const { getSeniorTextStyle } = moduleExports;

test('senior text scaling enlarges micro copy from 12px to accessible 15px', () => {
  const microStyle = getSeniorTextStyle('micro', 'soft');
  assert.equal(microStyle.fontSize, 15);
  assert.equal(microStyle.lineHeight, 21);
  assert.equal(microStyle.fontWeight, '500');
  // High contrast charcoal rather than soft grey
  assert.equal(microStyle.color, '#2B2420');
});

test('large text keeps the mockup weight hierarchy without bolding every label', () => {
  const labelStyle = getSeniorTextStyle('label', 'default');
  assert.equal(labelStyle.fontSize, 17);
  assert.equal(labelStyle.fontWeight, '500');
  assert.equal(labelStyle.color, undefined);

  const headingStyle = getSeniorTextStyle('heading', 'default');
  assert.equal(headingStyle.fontSize, 22);
  assert.equal(headingStyle.fontWeight, '600');
});

test('senior body text scales to 19px with generous line height to prevent fatigue', () => {
  const bodyStyle = getSeniorTextStyle('body', 'default');
  assert.equal(bodyStyle.fontSize, 19);
  assert.equal(bodyStyle.lineHeight, 26);
  assert.equal(bodyStyle.fontWeight, '400');
});

test('large titles use bold rather than extra-bold and on-brand text keeps its color', () => {
  assert.equal(getSeniorTextStyle('title').fontWeight, '700');
  assert.equal(getSeniorTextStyle('headline', 'on').color, undefined);
});
