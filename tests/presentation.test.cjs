const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const palette = require('../constants/palette');

let scheme = 'light';
const exportsObject = {};
const compiled = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../constants/theme.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;
vm.runInNewContext(compiled, {
  exports: exportsObject,
  require(name) {
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === '../lib/appearance') return { useAppAppearance: { getState: () => ({ scheme }) } };
    throw new Error(`Unexpected import: ${name}`);
  },
});
const { LIGHT_COLORS, DARK_COLORS, COLORS, FONTS } = exportsObject;

function luminance(hex) {
  const values = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('orange primary buttons keep readable dark text in both appearances', () => {
  for (const colors of [LIGHT_COLORS, DARK_COLORS]) {
    assert.ok(contrast(colors.primary, colors.textOnAccent) >= 4.5);
  }
});

test('body, secondary and action text retain contrast on the page and cards', () => {
  for (const colors of [LIGHT_COLORS, DARK_COLORS]) {
    for (const background of [colors.background, colors.cardSurface]) {
      for (const foreground of [colors.textPrimary, colors.textSecondary, colors.primaryDark]) {
        assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
      }
    }
  }
});

test('appearance switches existing color references without changing font family', () => {
  scheme = 'light';
  assert.equal(COLORS.primary, LIGHT_COLORS.primary);
  scheme = 'dark';
  assert.equal(COLORS.primary, DARK_COLORS.primary);
  assert.equal(COLORS.background, DARK_COLORS.background);
  assert.equal(FONTS.serif, 'System');
  scheme = 'light';
});

test('build-time category colors match the runtime palette', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(LIGHT_COLORS.categories)), palette.COLORS.categories);
});
