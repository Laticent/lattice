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
 * WHAT THIS TEST CATCHES — and it is NARROWER than an earlier draft of this
 * paragraph claimed, in two ways worth stating exactly, because the whole point
 * of the file is not to overstate its own cover (HARD RULE #23).
 *
 * It catches an edit to `GLYPH_UPPER` or to `upperAdvance` — the estimator
 * drifting from these recorded numbers. That is all.
 *
 * It does NOT see a change to the shipped faces, and never will: both the table
 * and these "measurements" are frozen literals in the repo, so bumping
 * `assets/fonts/outfit-700.woff2` moves the painted width while both sides of
 * THIS comparison sit still.
 *
 * It also does NOT see a change to the labels' CSS, which the earlier draft said
 * it did. Nothing here reads a stylesheet: `TRACK` below is a hardcoded 0.04 and
 * `upperAdvance` is called directly. Verified, not assumed — re-tuning
 * `.quadrant-label` to `font-weight: 400; letter-spacing: 0.12em` leaves this
 * file passing 39/39.
 *
 * So, precisely, the three arms and what each one actually covers:
 *   · estimator-vs-record — HERE.
 *   · did-the-fonts-move — `checkFontMetricsPin` (tools/check-ownership.js, via
 *     `npm run build:check`, every PR). `GLYPH_UPPER_FONTS` beside the table
 *     records the sha256 of every hand-maintained supply of each face, and the
 *     gate fails the build the moment one moves. It does not re-derive anything;
 *     it makes a silent font swap impossible, which is what the hole was.
 *   · record-vs-reality — `npm run fonts:measure`, run by a human in real
 *     Chromium against the shipped faces at the labels' own CSS. Its `--strings`
 *     output regenerates the MEASURED rows below.
 * The labels' CSS and the `--font-body` theme-override seam are covered by NONE
 * of the three; that gap is written down on `GLYPH_UPPER_FONTS` rather than
 * papered over here.
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
// The greedy line-breaker the emitter uses, so the "untightened wrap" below is
// the real one rather than a re-implementation that could disagree.
const { wrapLabelToLines } = require('../../../lib/components/chart/_chart-family/svg-legend');

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
// room for a face update to move a glyph one step.
//
// The worst on THIS set is under 8%, but do not read that as a property of the
// estimator: an independent 49-string vocabulary reached 1.098 on fully-mapped
// text (`1.1%`) and 1.114 with an unmapped script. The bound that holds across
// vocabularies is the lower one — it never under-counts. If this has to be
// RAISED, check first whether the table has drifted from the faces; a looser
// bound is the wrong fix for that.
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

  test('the unmapped fallback clears the widest UNMAPPED thing measured', () => {
    // An earlier cut asserted the fallback equalled the widest entry in the
    // TABLE, which sounded safe and was not: the table's widest glyph is only
    // the widest we happened to measure, and it left CJK — at exactly 1.00em —
    // with zero margin while a three-em dash (3.00em) under-counted by 3×. The
    // dashes are mapped now; the fallback covers what is left, and the thing it
    // has to clear is the 1.00em CJK/fullwidth cluster, not the table's max.
    for (const hand of [false, true]) {
      const face = hand ? 'hand' : 'clean';
      assert.ok(GLYPH_UPPER_MAX[face] > 1.00,
        `${face}: the fallback must clear the 1.00em CJK/fullwidth cluster`);
      // CJK is unmapped and must therefore bill the fallback, with margin.
      assert.equal(upperAdvance('日本語', { hand, tracking: 0 }), GLYPH_UPPER_MAX[face]);
      // An ASTRAL code point is ONE glyph over TWO UTF-16 units, and the
      // consumers count units — so it has to bill per unit or it halves.
      assert.equal(upperAdvance('🙂', { hand, tracking: 0 }), GLYPH_UPPER_MAX[face]);
      // An empty label cannot return NaN or 0 (a 0 advance makes the
      // line-breaker's budget infinite).
      assert.ok(upperAdvance('', { hand, tracking: 0 }) > 0);
    }
  });

  test('the em-quad dashes are MAPPED, because no fallback could cover them', () => {
    // `⸻` paints a flat 3.00em in both faces — three times the widest letter.
    // While it rode the fallback, a label of them was estimated at 0.34× its
    // painted width, which is the clipping direction.
    for (const hand of [false, true]) {
      const face = hand ? 'hand' : 'clean';
      assert.ok(GLYPH_UPPER[face]['⸻'] >= 3.0, `${face}: three-em dash must be mapped at >= 3em`);
      assert.ok(GLYPH_UPPER[face]['⸺'] >= 2.0, `${face}: two-em dash must be mapped at >= 2em`);
      assert.ok(upperAdvance('⸻', { hand, tracking: 0 }) > GLYPH_UPPER_MAX[face] * 2,
        `${face}: a three-em dash must not bill as an ordinary unmapped character`);
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
  //
  // BOTH TESTS BELOW ONCE PASSED WITH THE LOOP DISABLED, including the one
  // named for it — the fixture `Il Ili Workflow` fits on ONE line at this width,
  // so nothing was ever re-wrapped, and the second test asserted a hypothetical
  // (what a budget WOULD buy) rather than what the code emits. An independent
  // verifier caught it by reverting the loop and watching the suite stay green.
  // The fixture now actually wraps, and both assertions read the real output.
  const text = 'Il Ili Ili Il Workflow Workflow';
  const fontSize = 12;
  const width = 140;
  const advOf = (s) => upperAdvance(s, { tracking: TRACK });
  const painted = (line) => line.length * fontSize * advOf(line);

  test('the fixture really does wrap — otherwise nothing below is exercised', () => {
    const m = measureLabel(text, { width, fontSize, advance: advOf });
    assert.ok(m.lines.length > 1,
      `fixture emitted one line (${JSON.stringify(m.lines)}) — it cannot exercise the loop`);
  });

  test('every emitted line fits the width it was wrapped to', () => {
    const m = measureLabel(text, { width, fontSize, advance: advOf });
    for (const line of m.lines) {
      assert.ok(painted(line) <= width + 0.01,
        `line ${JSON.stringify(line)} paints ${painted(line).toFixed(1)}u into ${width}u`);
    }
  });

  test('the string average alone would NOT have fit — the loop is load-bearing', () => {
    // Assert against the WRAP THE STRING AVERAGE ACTUALLY PRODUCES, not against
    // a budget arithmetic. Disabling the loop must make a real emitted line
    // overrun, or this test is decoration.
    const avg = upperAdvance(text, { tracking: TRACK });
    const naive = wrapLabelToLines(text, charBudget(width, fontSize, avg));
    assert.ok(naive.some((l) => painted(l) > width + 0.01),
      `the untightened wrap ${JSON.stringify(naive)} already fits — this fixture no longer `
      + 'exercises the hazard; pick a wider/narrower pair');
  });
});

describe('the ELLIPSIZED line fits too — it is a new string the budget never saw', () => {
  // The truncation runs after the tighten loop and REPLACES the last line's
  // content, and `…` is not among the characters the budget was derived over —
  // so a line at exactly `budget` characters can paint past `width` once the
  // ellipsis is swapped in. Found by an adversarial sweep, not by the corpus:
  // an Arabic label (every glyph unmapped, so billed at the widest) came out at
  // 140.8u in a 140u box.
  const width = 140;
  const fontSize = 12;
  const CASES = [
    ['مرحبا '.repeat(100), 'RTL — every glyph unmapped'],
    ['日本語'.repeat(200), 'CJK'],
    ['ﬄ'.repeat(200), 'ligatures that expand under uppercase'],
    ['W'.repeat(4000), 'one unbreakable 4000-glyph token'],
    [`${'Il '.repeat(300)}Workflow`, 'narrow run then a wide word'],
    ['Workflow Warehouse Wellbeing Maximum', 'ordinary wide author text'],
  ];
  for (const hand of [false, true]) {
    for (const [text, name] of CASES) {
      test(`${hand ? 'hand' : 'clean'}: ${name}`, () => {
        const advOf = (s) => upperAdvance(s, { hand, tracking: TRACK });
        const m = measureLabel(text, { width, fontSize, maxLines: 2, advance: advOf });
        for (const line of m.lines) {
          assert.ok(line.length * fontSize * advOf(line) <= width + 0.01,
            `${JSON.stringify(line)} paints ${(line.length * fontSize * advOf(line)).toFixed(1)}u into ${width}u`);
        }
      });
    }
  }

  test('the shrink terminates and always leaves an ellipsis', () => {
    // The floor is one character plus `…`; past that the caller has asked for a
    // box too narrow for any label, and looping forever would be worse than
    // overflowing.
    const m = measureLabel('Workflow Warehouse', {
      width: 6, fontSize: 12, maxLines: 1, advance: (s) => upperAdvance(s, { tracking: TRACK }),
    });
    assert.equal(m.lines.length, 1);
    assert.match(m.lines[0], /…$/);
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
