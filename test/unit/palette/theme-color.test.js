/**
 * Unit: lib/theme/color.js — the color primitives shared by the Theme Studio
 * and the contrast gate. Pins the WCAG predicate to its anchor values, checks
 * the OKLCH round-trip on real shipped-theme colors, and exercises the
 * contrast-repair helper the derivation depends on.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  contrastRatio,
  relativeLuminance,
  hexToOklch,
  oklchToHex,
  withLightness,
  mix,
  pickInk,
  ensureContrast,
} = require('../../../lib/theme/color.js');

describe('theme-color', () => {
  test('normalizeHex accepts 3- and 6-digit, with/without #', () => {
    assert.equal(normalizeHex('#ABC'), '#aabbcc');
    assert.equal(normalizeHex('abc'), '#aabbcc');
    assert.equal(normalizeHex('#7A5A10'), '#7a5a10');
    assert.throws(() => normalizeHex('not-a-color'));
    assert.throws(() => normalizeHex('#12345'));
  });

  test('hex ↔ rgb round-trips', () => {
    assert.deepEqual(hexToRgb('#7a5a10'), [122, 90, 16]);
    assert.equal(rgbToHex([122, 90, 16]), '#7a5a10');
    assert.equal(rgbToHex([300, -5, 16]), '#ff0010'); // clamps
  });

  test('WCAG contrast hits its anchors', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff') * 100) / 100, 21);
    assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
    assert.ok(contrastRatio('#000', '#fff') === contrastRatio('#fff', '#000')); // symmetric
  });

  test('WCAG matches the shipped contrast doc (cuoio accent on bg ≈ 5.96)', () => {
    const ratio = contrastRatio('#7A5A10', '#FAF7F2');
    assert.ok(Math.abs(ratio - 5.96) < 0.05, `got ${ratio.toFixed(2)}`);
  });

  test('relativeLuminance is monotonic with lightness', () => {
    const dark = relativeLuminance(hexToRgb(withLightness('#327c86', 0.32)));
    const pale = relativeLuminance(hexToRgb(withLightness('#327c86', 0.87)));
    assert.ok(dark < pale);
  });

  test('OKLCH round-trips on real theme colors', () => {
    for (const hex of ['#7a5a10', '#faf7f2', '#1e1a15', '#327c86', '#c8a040', '#2d4ed8']) {
      assert.equal(oklchToHex(hexToOklch(hex)), normalizeHex(hex), hex);
    }
  });

  test('mix midpoint sits between the endpoints', () => {
    const m = mix('#000000', '#ffffff', 0.5);
    const lum = relativeLuminance(hexToRgb(m));
    assert.ok(lum > 0 && lum < 1);
    assert.equal(mix('#123456', '#abcdef', 0), normalizeHex('#123456'));
    assert.equal(mix('#123456', '#abcdef', 1), normalizeHex('#abcdef'));
  });

  test('pickInk chooses the readable ink for a fill', () => {
    assert.equal(pickInk('#111111'), '#ffffff'); // dark fill → white ink
    assert.equal(pickInk('#eeeeee'), '#111111'); // light fill → dark ink
  });

  test('ensureContrast lifts a failing pair to AA, both directions', () => {
    const onWhite = ensureContrast('#999999', '#ffffff', 4.5, 'darken');
    assert.ok(contrastRatio(onWhite, '#ffffff') >= 4.5);
    const onBlack = ensureContrast('#555555', '#000000', 4.5, 'lighten');
    assert.ok(contrastRatio(onBlack, '#000000') >= 4.5);
  });

  test('ensureContrast is a no-op when already passing', () => {
    assert.equal(ensureContrast('#000000', '#ffffff', 4.5), '#000000');
  });
});
