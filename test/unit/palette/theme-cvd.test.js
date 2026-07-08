/**
 * Unit: lib/theme/cvd.js — the Machado-2009 colour-vision-deficiency simulation
 * the accessibility audit is built on. Asserts the algorithm's load-bearing
 * properties (achromatic preservation, valid-hex output, type aliasing) and the
 * physiological behaviour the whole feature relies on: that the confusion axes
 * actually collapse (red↔green under protan/deutan, blue↔yellow under tritan).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { simulate, distanceUnder, canonicalType, CVD_TYPES } = require('../../../lib/theme/cvd.js');
const { oklabDistance, normalizeHex } = require('../../../lib/theme/color.js');

const isHex = v => /^#[0-9a-f]{6}$/.test(v);

describe('theme-cvd', () => {
  test('CVD_TYPES is the three dichromacies', () => {
    assert.deepEqual([...CVD_TYPES].sort(), ['deuteranopia', 'protanopia', 'tritanopia']);
  });

  test('canonicalType maps clinical names, short aliases, and normal', () => {
    assert.equal(canonicalType('deuteranopia'), 'deuteranopia');
    assert.equal(canonicalType('Deutan'), 'deuteranopia');
    assert.equal(canonicalType('protanope'), 'protanopia');
    assert.equal(canonicalType('TRITAN'), 'tritanopia');
    assert.equal(canonicalType('normal'), 'normal');
    assert.equal(canonicalType('none'), 'normal');
    assert.throws(() => canonicalType('quadranopia'));
  });

  test('achromatic colours are preserved exactly under every deficiency', () => {
    // The Machado matrices' rows sum to 1, so R=G=B in → R=G=B out.
    for (const type of CVD_TYPES) {
      for (const gray of ['#000000', '#808080', '#bfbfbf', '#ffffff']) {
        assert.equal(simulate(gray, type), gray, `${gray} under ${type}`);
      }
    }
  });

  test("normal is the identity (normalized)", () => {
    assert.equal(simulate('#1971C2', 'normal'), normalizeHex('#1971C2'));
    assert.equal(simulate('#abc', 'normal'), '#aabbcc');
  });

  test('every simulation yields a valid #rrggbb (out-of-gamut clamps)', () => {
    const samples = ['#d12f2f', '#2f9e44', '#1971c2', '#f6c700', '#e64980', '#0c8599'];
    for (const type of CVD_TYPES) {
      for (const hex of samples) assert.ok(isHex(simulate(hex, type)), `${hex} under ${type}`);
    }
  });

  test('red↔green collapses under the red-green deficiencies', () => {
    const red = '#d12f2f';
    const green = '#2f9e44';
    const normal = oklabDistance(red, green);
    // Both protan and deutan must bring red/green much closer than normal vision.
    for (const type of ['protanopia', 'deuteranopia']) {
      const under = distanceUnder(red, green, type);
      assert.ok(under < normal * 0.7, `${type}: ${under.toFixed(3)} not << normal ${normal.toFixed(3)}`);
    }
    // Deuteranopia is the canonical red-green collapse: essentially indistinct.
    assert.ok(distanceUnder(red, green, 'deuteranopia') < 0.15);
  });

  test('blue↔yellow degrades under tritanopia (but red↔green survives it)', () => {
    const blue = '#1971c2';
    const yellow = '#f6c700';
    // Pin a magnitude, not just "any reduction": tritanopia must close the
    // blue-yellow gap by a real margin (≥20%), or the simulation isn't biting.
    assert.ok(distanceUnder(blue, yellow, 'tritanopia') < oklabDistance(blue, yellow) * 0.8);
    // Tritanopia spares the red-green axis — that pair stays distinct.
    assert.ok(distanceUnder('#d12f2f', '#2f9e44', 'tritanopia') > 0.15);
  });

  // NOTE: no `distanceUnder === oklabDistance(simulate(a), simulate(b))` test —
  // that only restates the function's own definition (green by construction).
  // distanceUnder's real behavior is exercised above against INDEPENDENT
  // physiological oracles: red↔green must collapse under deuteranopia (< 0.15)
  // and blue↔yellow under tritanopia (≥ 20% closer), which a broken composition
  // would fail.
});
