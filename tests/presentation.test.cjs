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

test('the Needs priority card keeps readable text in light and dark mode', () => {
  const filename = path.join(__dirname, '../app/(tabs)/needs.tsx');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let label;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Text' &&
        node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(source).includes('"Runs out first"'))) label = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(label, 'priority label must be present');
  let card = label.parent;
  while (card && !(ts.isJsxElement(card) && card.openingElement.tagName.getText(source) === 'Card')) card = card.parent;
  assert.ok(card, 'priority label must be inside its card');
  const resolveStyle = (element, appearance, colors) => {
    const style = element.openingElement.attributes.properties.find(attribute => attribute.name?.getText(source) === 'style');
    return vm.runInNewContext(`(${style.initializer.expression.getText(source)})`, {
      limiting: true, scheme: appearance, COLORS: colors,
    });
  };
  for (const [appearance, colors] of [['light', LIGHT_COLORS], ['dark', DARK_COLORS]]) {
    const foreground = resolveStyle(label, appearance, colors).color;
    const background = resolveStyle(card, appearance, colors).backgroundColor;
    assert.ok(contrast(foreground, background) >= 4.5,
      `${appearance} priority text ${foreground} must contrast with ${background}`);
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

// Design rule: a white surface on the cream page always has a visible edge.
// White (#FFF) on cream (#FBF6EE) is barely 1.05:1, so an unedged white box
// just floats. Any element painted `bg-card` must also carry a border, a
// shadow ring, or a divider rule in the same tag. Full-bleed bars that sit
// against a rule (RULE_ABOVE / RULE_BELOW) count as edged.
test('every bg-card surface has a visible edge', () => {
  const root = path.join(__dirname, '..');
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && entry.name !== 'ui-mockup.tsx') files.push(full);
    }
  };
  walk(path.join(root, 'app'));
  walk(path.join(root, 'components'));

  const EDGE = /\bborder\b|border-|borderWidth|boxShadow|cardSurface|cardShadow|cardEdge|RULE_|rowEdge|Edge\b|shadow-/;
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let at = src.indexOf('bg-card');
    while (at !== -1) {
      // The JSX opening tag around this class: back to '<', forward to the
      // tag's closing '>' (skipping arrow-function '=>' inside props).
      const start = src.lastIndexOf('<', at);
      let end = at;
      let depth = 0;
      for (; end < src.length; end++) {
        const c = src[end];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth <= 0 && src[end - 1] !== '=') break;
      }
      const tag = src.slice(start, end);
      // The line itself too: a class list (cva variants) is not a JSX tag.
      const lineText = src.slice(src.lastIndexOf('\n', at) + 1, src.indexOf('\n', at));
      if (!EDGE.test(tag) && !EDGE.test(lineText) && !/surface-edge-ok/.test(tag)) {
        const line = src.slice(0, at).split('\n').length;
        offenders.push(`${path.relative(root, file)}:${line}`);
      }
      at = src.indexOf('bg-card', at + 7);
    }
  }
  assert.deepEqual(offenders, [], `bg-card without an edge:\n${offenders.join('\n')}`);
});
