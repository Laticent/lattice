/**
 * Unit: the UPPERCASE label estimate in
 * lib/components/chart/_chart-family/svg-label.js (`upperAdvance`).
 *
 * WHY THIS TEST EXISTS. The estimate it pins is a claim about the real world —
 * how wide a string paints in a real browser, in a real face — and the whole
 * defect class here is that claim going quietly stale. The flat 0.68 it
 * replaced was calibrated on four short gallery strings and stayed correct for
 * exactly those four; author text (`WORKFLOW`) broke it by 39% and nothing
 * caught that, because a chart whose label overruns its box still renders.
 *
 * So the numbers below are BROWSER MEASUREMENTS, not expectations derived from
 * the code. Each is `getComputedTextLength() / (chars × fontSize)` for that
 * string at `.quadrant-label`'s real CSS (Outfit / Shantell Sans, weight 700,
 * `text-transform: uppercase`, `letter-spacing: 0.04em`) against the shipped
 * woff2s in headless Chromium.
 *
 * WHAT THIS TEST DOES NOT CATCH, stated plainly because an earlier draft of this
 * comment claimed otherwise: **it cannot see a change to the shipped faces.**
 * Both the table and these "measurements" are frozen literals in the repo, so
 * bumping `assets/fonts/outfit-700.woff2` moves the painted width while both
 * sides of this comparison sit still, and the suite stays green. What the test
 * DOES catch is the table drifting from these recorded measurements — an edit to
 * `GLYPH_UPPER`, to `upperAdvance`, or to the rules' size/tracking.
 *
 * Closing the font-drift channel needs a gate that re-derives from the woff2
 * (the `tools/derive-*` / `calibrate-*` precedent) or pins the font files' hashes
 * beside the table. Tracked as a follow-up rather than done here, and called out
 * so nobody reads this file as protection it does not provide (HARD RULE #23).
 *
 * THE ASSERTION IS TWO-SIDED, because both directions are defects and they are
 * different defects — see the derivation comment in svg-label.js. Short and the
 * label overruns its box AND the de-collision pass guards a box narrower than
 * the painted glyphs. Long and de-collision inflates, wrapping text that fits
 * and shoving neighbors until `placeLabels` drops a name outright.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  upperAdvance, measureLabel, wrapSvgLabel, charBudget,
  GLYPH_UPPER, GLYPH_UPPER_MAX, ADVANCE,
} = require('../../../lib/components/chart/_chart-family/svg-label');

// [string, clean, hand] — measured, as described above. Deliberately spans the
// whole reachable range rather than sampling the pretty middle: the four
// strings #1672 was filed with, ordinary author words that broke the old
// constant, the narrow end (`IL ILI`) where an over-estimate does its damage,
// and the pathological wide runs that bound the table.
const MEASURED = [
  ['Wide moat', 0.679, 0.745],
  ['Emerging challengers', 0.677, 0.723],
  ['Operational maturity', 0.655, 0.706],
  ['Quick Wins', 0.637, 0.692],
  ['Workflow', 0.790, 0.782],
  ['Maximum', 0.749, 0.864],
  ['Commitment', 0.737, 0.801],
  ['Strategic Bets', 0.617, 0.649],
  ['Time Sinks', 0.586, 0.677],
  ['Illinois filling', 0.548, 0.633],
  ['Il Ili', 0.404, 0.555],
  ['MMMMMMMMMM', 0.898, 1.068],
  ['WWWWWWWWWW', 1.017, 1.042],
];

const TRACK = 0.04;
// How far over the painted width the estimate may sit. The table rounds each
// glyph UP to the nearest 0.05, which is what buys "never short"; 12% is the
// slack that rounding can accumulate on a short string of narrow glyphs, with
// room for a face update to move a glyph one step. Measured worst on this set
// is under 8% — if this has to be RAISED, the table has drifted from the faces
// and wants re-measuring, not a looser bound.
const MAX_OVER = 1.12;

describe('upperAdvance — the estimate tracks the painted width, in both faces', () => {
  for (const [text, clean, hand] of MEASURED) {
    test(`${JSON.stringify(text)} is bounded above and not wasteful`, () => {
      for (const [face, painted] of [['clean', clean], ['hand', hand]]) {
        const est = upperAdvance(text, { hand: face === 'hand', tracking: TRACK });
        assert.ok(est >= painted,
          `${face}: estimate ${est.toFixed(3)} is UNDER the painted ${painted} — ` +
          'the label overruns its box and de-collision guards a box too narrow');
        assert.ok(est <= painted * MAX_OVER,
          `${face}: estimate ${est.toFixed(3)} exceeds painted ${painted} by ` +
          `${((est / painted - 1) * 100).toFixed(1)}% — inflated boxes drop labels`);
      }
    });
  }

  test('the old flat constant really did fail this bound — the test can fail', () => {
    // The guard on the guard. A bound every plausible value satisfies proves
    // nothing, so pin that 0.68 — the value this replaced — is genuinely short
    // on ordinary author text, in the CLEAN face as well as the hand one.
    const short = MEASURED.filter(([, clean]) => 0.68 < clean);
    assert.ok(short.length >= 4,
      `expected the flat 0.68 to under-count several clean-face strings, got ${short.length}`);
    assert.ok(short.some(([t]) => t === 'Workflow'),
      'WORKFLOW is the canonical clean-face counter-example and must be in the set');
  });
});

describe('upperAdvance — mechanics', () => {
  test('the hand face is not simply the clean face scaled', () => {
    // If one constant times a ratio could describe both faces, a per-face
    // CONSTANT would have been the right fix and this table is over-built. It
    // cannot: the two faces disagree about which strings are wide. `WORKFLOW`
    // is wider in the clean face, `MAXIMUM` in the hand one.
    const r = (t) => upperAdvance(t, { hand: true, tracking: TRACK })
      / upperAdvance(t, { hand: false, tracking: TRACK });
    assert.ok(r('Workflow') < 1, 'WORKFLOW paints narrower in the hand face');
    assert.ok(r('Maximum') > 1, 'MAXIMUM paints wider in the hand face');
  });

  test('tracking is additive per character, so one table serves every tracked rule', () => {
    const base = upperAdvance('Quick Wins', { tracking: 0 });
    for (const t of [0.04, 0.06, 0.08]) {
      assert.ok(Math.abs(upperAdvance('Quick Wins', { tracking: t }) - (base + t)) < 1e-9,
        `tracking ${t} must add exactly ${t} per character`);
    }
  });

  test('an unmapped character bills at the face\'s widest glyph', () => {
    // Wrong in the generous direction by construction — the only direction that
    // cannot clip. A label in a script the table does not cover wraps early
    // rather than overrunning, which is what makes measuring those scripts a
    // safe change to defer.
    for (const hand of [false, true]) {
      const face = hand ? 'hand' : 'clean';
      const widest = Math.max(...Object.values(GLYPH_UPPER[face]));
      assert.equal(GLYPH_UPPER_MAX[face], widest,
        `${face}: the fallback must BE the widest entry, not a number beside it`);
      assert.equal(upperAdvance('日本語', { hand, tracking: 0 }), widest);
      // …and an empty label cannot return NaN or 0 (a 0 advance makes the
      // line-breaker's budget infinite).
      assert.ok(upperAdvance('', { hand, tracking: 0 }) > 0);
    }
  });

  test('the estimate reads the transformed glyphs, as `text-transform: uppercase` paints them', () => {
    assert.equal(upperAdvance('workflow', { tracking: 0 }), upperAdvance('WORKFLOW', { tracking: 0 }));
  });

  test('an uppercase EXPANSION is billed against the source length', () => {
    // The return value is per-character and both consumers multiply it back by a
    // count of the SOURCE string — `charBudget` feeds a character budget to the
    // line-breaker, `widestOf` does `line.length × advance`. `toUpperCase()` can
    // expand (`ß`→`SS`; the ligatures a paste out of a PDF carries, `ﬄ`→`FFL`,
    // 1→3), and CSS `text-transform: uppercase` performs the same mapping — so
    // the paint expands while the count does not. Dividing by the expanded
    // length diluted the advance by exactly the expansion factor, an UNDER-count
    // and therefore the clipping direction: measured on a real render, 16 `ﬄ`
    // painted 356.97u into a 140u box and ran off the viewBox.
    const total = (s) => s.length * upperAdvance(s, { tracking: 0.04 });
    assert.ok(Math.abs(total('Straße') - total('Strasse')) < 1e-9,
      'STRASSE and STRAßE paint the same glyphs and must estimate the same total');
    // And the pathological expansion is billed rather than diluted: three glyphs
    // of ink per source character has to cost about three glyphs.
    assert.ok(total('ﬄﬄﬄﬄ') > 3 * total('FFL'.slice(0, 1)) * 3,
      'a 1→3 ligature expansion must not read as one character of ink');
    assert.ok(upperAdvance('ﬄ', { tracking: 0 }) > upperAdvance('F', { tracking: 0 }) * 2.5,
      'one ligature paints roughly three glyphs and must be billed that way');
  });

  test('an explicit null options object does not throw', () => {
    // `= {}` only defaults `undefined`. Unreachable from today's call sites; a
    // footgun for the next one.
    assert.doesNotThrow(() => upperAdvance('X', null));
  });
});

describe('measureLabel — a wide LINE cannot ride a narrow string average', () => {
  // The hazard a per-string average introduces, and the reason for the tighten
  // loop: `IL ILI` is roughly half the per-character width of `WORKFLOW`, so
  // averaged over the whole label it buys the `WORKFLOW` line a budget that
  // line does not deserve — and it is the LINE that has to fit the box.
  const text = 'Il Ili Workflow';
  const fontSize = 12;
  const width = 140;

  test('every emitted line fits the width it was wrapped to', () => {
    const m = measureLabel(text, {
      width, fontSize, advance: (s) => upperAdvance(s, { tracking: TRACK }),
    });
    for (const line of m.lines) {
      const painted = line.length * fontSize * upperAdvance(line, { tracking: TRACK });
      assert.ok(painted <= width + 0.01,
        `line ${JSON.stringify(line)} paints ${painted.toFixed(1)}u into ${width}u`);
    }
  });

  test('the string average alone would NOT have fit — the loop is load-bearing', () => {
    const avg = upperAdvance(text, { tracking: TRACK });
    const naive = charBudget(width, fontSize, avg);
    // The budget the average buys, spent entirely on the widest word.
    const worst = 'WORKFLOW';
    const perChar = upperAdvance(worst, { tracking: TRACK });
    assert.ok(naive * fontSize * perChar > width,
      'this fixture no longer exercises the hazard — pick a wider/narrower pair');
  });
});

describe('a numeric advance is untouched — every existing caller is byte-identical', () => {
  // The change made `advance` accept a function. Callers that pass a number
  // (the legend, the gantt axis, the funnel, every default) must go through the
  // new code paths with the exact geometry they had, or this refactor is a
  // silent re-layout of the whole chart family.
  const text = 'Enterprise data platform modernization';
  test('measureLabel', () => {
    const a = measureLabel(text, { width: 120, fontSize: 9.5, advance: ADVANCE });
    const b = measureLabel(text, { width: 120, fontSize: 9.5, advance: () => ADVANCE });
    assert.deepEqual(a.lines, b.lines);
    assert.equal(a.height, b.height);
  });
  test('wrapSvgLabel emits identical svg and identical box', () => {
    const spec = { x: 40, y: 60, width: 120, fontSize: 9.5, anchor: 'middle', maxLines: 3 };
    const a = wrapSvgLabel(text, { ...spec, advance: ADVANCE });
    const b = wrapSvgLabel(text, { ...spec, advance: () => ADVANCE });
    assert.equal(a.svg, b.svg);
    assert.deepEqual(
      [a.left, a.right, a.top, a.bottom],
      [b.left, b.right, b.top, b.bottom],
    );
  });
});
