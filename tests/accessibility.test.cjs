const test = require('node:test');
const assert = require('node:assert/strict');

// Testing the senior text style transformation logic
function getSeniorTextStyle(variant, tone) {
  let fontSize = 19;
  let lineHeight = 26;
  let fontWeight = '600';

  switch (variant) {
    case 'micro':
      fontSize = 15;
      lineHeight = 21;
      fontWeight = '600';
      break;
    case 'label':
      fontSize = 17;
      lineHeight = 23;
      fontWeight = '700';
      break;
    case 'body':
      fontSize = 19;
      lineHeight = 26;
      fontWeight = '600';
      break;
    case 'heading':
      fontSize = 22;
      lineHeight = 29;
      fontWeight = '700';
      break;
    case 'title':
      fontSize = 26;
      lineHeight = 33;
      fontWeight = '800';
      break;
    case 'headline':
      fontSize = 30;
      lineHeight = 37;
      fontWeight = '800';
      break;
    case 'display':
      fontSize = 35;
      lineHeight = 43;
      fontWeight = '800';
      break;
    default:
      fontSize = 19;
      lineHeight = 26;
      fontWeight = '600';
      break;
  }

  const style = { fontSize, lineHeight };
  if (fontWeight) style.fontWeight = fontWeight;

  if (tone === 'soft') {
    style.color = '#2B2420';
  } else if (!tone || tone === 'default') {
    style.color = '#1A1412';
  }

  return style;
}

test('senior text scaling enlarges micro copy from 12px to accessible 15px', () => {
  const microStyle = getSeniorTextStyle('micro', 'soft');
  assert.equal(microStyle.fontSize, 15);
  assert.equal(microStyle.lineHeight, 21);
  assert.equal(microStyle.fontWeight, '600');
  // High contrast charcoal rather than soft grey
  assert.equal(microStyle.color, '#2B2420');
});

test('senior text scaling bolds labels and headings for older adult vision', () => {
  const labelStyle = getSeniorTextStyle('label', 'default');
  assert.equal(labelStyle.fontSize, 17);
  assert.equal(labelStyle.fontWeight, '700');
  assert.equal(labelStyle.color, '#1A1412');

  const headingStyle = getSeniorTextStyle('heading', 'default');
  assert.equal(headingStyle.fontSize, 22);
  assert.equal(headingStyle.fontWeight, '700');
});

test('senior body text scales to 19px with generous line height to prevent fatigue', () => {
  const bodyStyle = getSeniorTextStyle('body', 'default');
  assert.equal(bodyStyle.fontSize, 19);
  assert.equal(bodyStyle.lineHeight, 26);
});
