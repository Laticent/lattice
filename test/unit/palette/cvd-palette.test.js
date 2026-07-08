/**
 * Unit: the accessibility (CVD) palettes' status trio survives its target
 * deficiency. The categorical cycle CANNOT be separated by colour under CVD
 * (~1-2 distinct — that's what the texture patterns carry); what colour DOES
 * carry is pass/warn/fail, so this gate asserts exactly that. The a11y themes
 * are mode-invariant (a single fixed value per token, no light-dark() pair), so
 * there is one canvas to check.
 * Regression guard for engineering/decisions/2026-06-16-cvd-redundant-encoding.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { simulate } = require('../../../lib/theme/cvd.js');
const { oklabDistance, contrastRatio, normalizeHex } = require('../../../lib/theme/color.js');

const THEMES = path.join(__dirname, '../../../themes');
const FLOOR = 0.15; // "just about distinct" — the audit's collapse threshold
// Achromatopsia has no colour axis, so distinctness is pure luminance: every
// pair of status greys must clear this WCAG contrast ratio. Identity greys give
// 1.0, so a trio collapsed to one value fails; the shipped trio gives ~1.61.
const ACHROMAT_FLOOR = 1.25;

// Each dichromacy palette + the deficiency a viewer of it has. Achromatopsia is
// excluded: its trio is luminance-only greys whose distinction rides the glyphs,
// not a colour ΔE the dichromacy simulation measures.
const CASES = [
  ['a11y-deuteranopia', 'deuteranopia'],
  ['a11y-protanopia', 'protanopia'],
  ['a11y-tritanopia', 'tritanopia'],
];

/** Pull the fixed --pass/--warn/--fail values from a mode-invariant palette. */
function statusTrio(palette) {
  const css = fs.readFileSync(path.join(THEMES, `${palette}.css`), 'utf8');
  const trio = [];
  for (const tok of ['pass', 'warn', 'fail']) {
    const m = css.match(new RegExp(`--${tok}:\\s*(#[0-9a-f]{3,6})\\s*;`, 'i'));
    assert.ok(m, `${palette} must define --${tok} as a fixed hex (mode-invariant, no light-dark())`);
    trio.push(normalizeHex(m[1]));
  }
  return trio;
}

function minPairwiseUnder(hexes, type) {
  let m = Infinity;
  for (let i = 0; i < hexes.length; i++)
    for (let j = i + 1; j < hexes.length; j++)
      m = Math.min(m, oklabDistance(simulate(hexes[i], type), simulate(hexes[j], type)));
  return m;
}

describe('cvd-palette status distinctness', () => {
  for (const [palette, type] of CASES) {
    test(`${palette}: pass/warn/fail stay distinct under ${type}`, () => {
      const trio = statusTrio(palette);
      const d = minPairwiseUnder(trio, type);
      assert.ok(d >= FLOOR, `min ΔE ${d.toFixed(3)} < ${FLOOR}`);
    });
  }

  test('achromatopsia status trio is luminance-separated greys', () => {
    const trio = statusTrio('a11y-achromatopsia');
    // (1) All three are achromatic (R=G=B) — colour carries nothing here.
    for (const hex of trio) {
      const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
      assert.equal(r, g, `${hex} should be grey`);
      assert.equal(g, b, `${hex} should be grey`);
    }
    // (2) …and they actually SPAN a luminance range: every pair must clear the
    // contrast floor, so a collapse to three identical greys (ratio 1.0) fails.
    // Achromats read pass/warn/fail off luminance + the ✓/!/✗ glyphs; this keeps
    // luminance a live, redundant channel (2026-06-16-cvd-redundant-encoding.md).
    let minC = Infinity;
    for (let i = 0; i < trio.length; i++)
      for (let j = i + 1; j < trio.length; j++)
        minC = Math.min(minC, contrastRatio(trio[i], trio[j]));
    assert.ok(minC >= ACHROMAT_FLOOR, `min pairwise contrast ${minC.toFixed(3)} < ${ACHROMAT_FLOOR} — greys collapsing`);
  });
});
