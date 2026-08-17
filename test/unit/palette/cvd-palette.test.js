/**
 * Unit: the accessibility (CVD) palettes' status trio survives its target
 * deficiency. The categorical cycle CANNOT be separated by colour under CVD
 * (~1-2 distinct — that's what the texture patterns carry); what colour DOES
 * carry is pass/warn/fail, so this gate asserts exactly that.
 *
 * The a11y themes are mode-invariant at the DECK level — a `:root:root` scheme
 * pin makes the light/dark toggle inert — but that pin cannot reach a per-slide
 * `_class: dark`, which sets color-scheme on the SECTION (#1323). So the status
 * trio is the one paired family here, and BOTH arms have to survive the
 * deficiency: a dark slide that falls back to a non-CVD-safe trio is the same
 * defect this file exists to catch, just on a canvas it used to not look at.
 * Regression guard for engineering/decisions/2026-06-16-cvd-redundant-encoding.md
 * and engineering/decisions/2026-08-16-flat-palette-dark-companions.md.
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

/**
 * Pull one arm of the --pass/--warn/--fail trio. The a11y palettes declare the
 * trio as `light-dark(<light>, <dark>)` of two fixed hexes — no var() and no
 * color-mix(), so the arms are readable straight off the source and both are
 * asserted below.
 */
function statusTrio(palette, arm = 'light') {
  const css = fs.readFileSync(path.join(THEMES, `${palette}.css`), 'utf8');
  const trio = [];
  for (const tok of ['pass', 'warn', 'fail']) {
    const m = css.match(
      new RegExp(`--${tok}:\\s*light-dark\\(\\s*(#[0-9a-f]{3,6})\\s*,\\s*(#[0-9a-f]{3,6})\\s*\\)\\s*;`, 'i'),
    );
    assert.ok(
      m,
      `${palette} must define --${tok} as light-dark(<light hex>, <dark hex>) — the deck-level ` +
      'scheme pin does not reach a per-slide `_class: dark` section (#1323), so both arms ship',
    );
    trio.push(normalizeHex(arm === 'dark' ? m[2] : m[1]));
  }
  return trio;
}

const ARMS = ['light', 'dark'];

function minPairwiseUnder(hexes, type) {
  let m = Infinity;
  for (let i = 0; i < hexes.length; i++)
    for (let j = i + 1; j < hexes.length; j++)
      m = Math.min(m, oklabDistance(simulate(hexes[i], type), simulate(hexes[j], type)));
  return m;
}

describe('cvd-palette status distinctness', () => {
  for (const [palette, type] of CASES) {
    for (const arm of ARMS) {
      test(`${palette}: pass/warn/fail stay distinct under ${type} (${arm} arm)`, () => {
        const trio = statusTrio(palette, arm);
        const d = minPairwiseUnder(trio, type);
        assert.ok(d >= FLOOR, `min ΔE ${d.toFixed(3)} < ${FLOOR}`);
      });
    }
  }

  for (const arm of ARMS) {
    test(`achromatopsia status trio is luminance-separated greys (${arm} arm)`, () => {
      const trio = statusTrio('a11y-achromatopsia', arm);
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
  }
});
