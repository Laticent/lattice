/**
 * Unit: lib/theme/cat-ink.js — the shared `--cat-N-ink` solve.
 *
 * The recipe used to live inside `tools/derive-cat-ink.js` with one caller. #1457
 * gave it a second — `lib/theme/derive.js`, which runs in a browser — and the two
 * want OPPOSITE answers to the same failure. That split is the thing worth pinning:
 *
 *   strict: true   writes tracked source, so an unsolvable palette must THROW and
 *                  name the theme, the slot and the two surfaces.
 *   strict: false  runs on a color a user just picked, so it degrades to the most
 *                  legible shade available and reports what it did.
 *
 * A test that only asserts "the shipped palettes are fine" cannot see either path.
 * These construct the failures.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  solveInk, solveInkArm, bestEffortInk, feasibleRange, armCollapsed, separationTarget,
} = require('../../../lib/theme/cat-ink.js');
const { contrastRatio, hexToOklch, oklabDistance } = require('../../../lib/theme/color.js');

// A cycle of twelve distinguishable hues, in the shape a real palette ships.
const HUES = ['#2E608A', '#8A2E60', '#608A2E', '#333333', '#AAAAAA', '#4444AA',
  '#AA4444', '#44AA44', '#884400', '#008844', '#440088', '#888800'];
// A canvas pair that STRADDLES: one surface wants a dark ink, the other a light
// one, so no shade of any hue clears 4.5:1 against both. This is the exact
// condition `solveInk` answers `null` to.
const STRADDLE = { bg: '#FFFFFF', bgAlt: '#111111' };

describe('cat-ink', () => {
  test('solveInk returns the mark UNCHANGED when it already clears', () => {
    assert.equal(solveInk('#2E608A', '#F2F5FA', '#FFFFFF'), '#2E608A');
  });

  test('solveInk moves lightness only — the hue is what makes the ink on brand', () => {
    const mark = '#478400'; // atelier cat-4, the worst measured slot
    const ink = solveInk(mark, '#f2efe6', '#e5e0d2');
    let drift = Math.abs(hexToOklch(mark).h - hexToOklch(ink).h) % 360;
    if (drift > 180) drift = 360 - drift;
    assert.ok(drift < 2, `ink drifted ${drift.toFixed(1)}deg off the mark hue`);
    assert.ok(Math.min(contrastRatio(ink, '#f2efe6'), contrastRatio(ink, '#e5e0d2')) >= 4.5);
  });

  test('solveInk answers null — not a bad color — when the canvases straddle', () => {
    assert.equal(solveInk('#2E608A', STRADDLE.bg, STRADDLE.bgAlt), null);
    assert.equal(feasibleRange('#2E608A', STRADDLE.bg, STRADDLE.bgAlt), null);
  });

  describe('failure policy', () => {
    test('strict THROWS on a straddling canvas pair, naming the theme and the slot', () => {
      assert.throws(
        () => solveInkArm({ marks: HUES, ...STRADDLE, strict: true, label: 'probe', arm: 'light' }),
        /probe: no legible --cat-1-ink exists on the light canvas/,
      );
    });

    test('non-strict degrades every unsolvable slot and REPORTS each one', () => {
      const { inks, degraded } = solveInkArm({ marks: HUES, ...STRADDLE, label: 'probe', arm: 'light' });
      assert.equal(degraded.length, 12, 'every slot is unsolvable here, and every one must be reported');
      assert.equal(inks.length, 12);
      for (const ink of inks) assert.match(ink, /^#[0-9a-f]{6}$/i, 'a degraded slot still yields a usable color');
    });

    test('a degraded ink is never WORSE than the mark it replaces', () => {
      // That is the whole guarantee, and it is deliberately modest. On a straddling
      // pair there is no good answer — every candidate fails one surface — so the
      // solver picks whichever maximizes the WORSE of the two ratios and says so in
      // `degraded`. Sometimes that is the mark itself (a mid-tone is genuinely the
      // best compromise between a white and a near-black surface); the property
      // that must always hold is that it never trades down.
      const worst = (hex) => Math.min(contrastRatio(hex, STRADDLE.bg), contrastRatio(hex, STRADDLE.bgAlt));
      for (const mark of [...HUES, '#808080', '#F0F0F0', '#050505']) {
        const chosen = bestEffortInk(mark, STRADDLE.bg, STRADDLE.bgAlt);
        assert.ok(worst(chosen) >= worst(mark) - 1e-9, `${mark} degraded DOWN to ${chosen}`);
      }
    });
  });

  describe('anti-collapse', () => {
    // A single-hue lightness ramp — the shape `brand-mono` and the a11y grayscale
    // cycle both produce — is the case where every slot solves onto ONE lightness.
    const RAMP = Array.from({ length: 12 }, (_, i) => {
      const v = Math.round(120 + i * 4).toString(16).padStart(2, '0');
      return `#${v}${v}${v}`;
    });

    test('BITES: the raw solve collapses a lightness ramp, and the guard separates it', () => {
      const bg = '#FFFFFF';
      const bgAlt = '#F2F2F2';
      const naive = RAMP.map(m => solveInk(m, bg, bgAlt));
      assert.ok(armCollapsed(naive, RAMP), 'the unguarded solve must actually collapse, or this proves nothing');
      const { inks, collapsed } = solveInkArm({ marks: RAMP, bg, bgAlt, label: 'ramp', arm: 'light' });
      assert.ok(collapsed, 'the guard must report that it fired');
      assert.ok(!armCollapsed(inks, RAMP), 'and the separated arm must read as twelve categories');
    });

    test('separation is never asked for beyond what the MARKS themselves carry', () => {
      // The guard restores separation the SOLVE lost; it does not improve on a
      // designer's deliberately-tight cycle. Two near-identical marks stay near-
      // identical inks.
      const twins = ['#3A6E00', '#3A6E01'];
      assert.ok(separationTarget(...twins) < 0.01);
      const { inks } = solveInkArm({ marks: twins, bg: '#FFFFFF', bgAlt: '#F2F2F2', label: 'twins', arm: 'light' });
      assert.ok(oklabDistance(inks[0], inks[1]) < 0.035, 'the guard must not invent separation the palette never had');
    });

    test('an already-separated arm is left exactly alone', () => {
      const bg = '#FFFFFF';
      const bgAlt = '#F2F5FA';
      const { inks, collapsed } = solveInkArm({ marks: HUES, bg, bgAlt, label: 'hues', arm: 'light' });
      assert.ok(!collapsed);
      assert.deepEqual(inks, HUES.map(m => solveInk(m, bg, bgAlt)));
    });
  });
});
