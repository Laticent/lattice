/**
 * svg-label.js — the shared wrapping `<text>` emitter for IN-DIAGRAM chart
 * labels (funnel stages, radar rim axes, quadrant dots/corners, gantt lanes,
 * state-chart nodes + edges).
 *
 * WHY THIS EXISTS. Native SVG `<text>` does not wrap. Every diagram label used
 * to be a single-line `<text x y>`, so a long label ran straight off the
 * viewBox (the funnel clipped "…Procurement Qualification Review" at the left
 * edge) or straight through its neighbor (quadrant dot labels overprinted each
 * other). The SVG-native legend already solved the same problem for KEY rows —
 * `svg-legend.js` wraps a label to a character budget and emits one `<tspan>`
 * per line. This module lifts that solved mechanism out to the diagram side
 * rather than growing a second wrapper (HARD RULE #15): the greedy line-breaker
 * `wrapLabelToLines` is IMPORTED from svg-legend, not reimplemented here.
 *
 * WHY NOT `<foreignObject>` + CSS flex. It wraps natively, but it loses on all
 * three axes that matter here: it is not "fully SVG", it is unreliable in the
 * Chromium→PDF export path, and — decisively — a `foreignObject` label is an
 * HTML `<div>`, so `chartToScene` (docs/src/lib/chart-anima.ts) would never see
 * it as a `<text>` node and would never animate it. `<tspan>` lines stay inside
 * one `<text>`, which keeps the label a single addressable motion target and a
 * single `[data-mark]` popover target. See
 * engineering/decisions/2026-07-26-svg-chart-labels-motion.md §2.
 *
 * EVERYTHING IS VIEWBOX USER UNITS. Widths, font sizes and line heights are all
 * expressed in the chart's own coordinate space, never device px. That is what
 * makes the result resolution-independent: the same vector drawn at 1280×720
 * and at 8K is the same shape scaled, so a label keeps its proportion to the
 * geometry and stays crisp at any output size. Sizing in px would pin the text
 * to one output resolution and break the moment the SVG scaled.
 *
 * WHO OWNS THE FONT SIZE. The caller does, and it must match what CSS renders,
 * because the line-breaker measures in units of the font size. This follows the
 * legend's precedent exactly: `chart-family.css` deliberately sets NO
 * `font-size` on `.chart-key-label` — the kernel emits it as an attribute, so
 * the wrap math and the painted glyphs can never desync. A chart that wraps a
 * label therefore owns that label's nominal size too.
 *
 * NO LIVE MEASUREMENT. A pure kernel has no DOM, so it cannot ask the browser
 * how wide a string paints; width is ESTIMATED, and every estimate here is
 * deliberately CONSERVATIVE. The budget breaks EARLY rather than late: a label
 * may wrap one word sooner than a perfect measurer would, but it never overruns
 * its box. Erring the other way would put us back to clipping, which is the
 * defect this module exists to remove.
 *
 * Two estimators, and the difference is about the VOCABULARY, not the ambition:
 *   · a flat average advance (`ADVANCE`, the legend's tuned 0.6, and the two
 *     tracked constants) where the strings are closed or the headroom is large;
 *   · a per-glyph SUM (`GLYPH_UPPER` / `upperAdvance`) for uppercase tracked
 *     labels, which are open AUTHOR text — there, one average cannot describe
 *     both `IL ILI` and `WORKFLOW`, and measurement showed a flat constant
 *     missing by −39%/+104%. See §"The UPPERCASE label estimate".
 *
 * So this module DOES carry font metrics now, for that one case. They are
 * static numbers about specific woff2 files, which makes them a drift risk the
 * flat constants did not have — the honest statement of that, and what does and
 * does not protect it, is on the table itself and on `GLYPH_UPPER_FONTS`.
 *
 * Pure string-in/string-out — no fs, no DOM — so it runs identically on both
 * render paths (HARD RULE #1) and is safe in every browser bundle.
 */

const { wrapLabelToLines, xmlEsc } = require('./svg-legend');

// Average glyph advance as a fraction of the font size. Shared with the legend
// (svg-legend.js AVG_ADVANCE_R) so a diagram label and a key label break at the
// same visual width — the family reads as one system.
const ADVANCE = 0.6;
const ADVANCE_MONO_TRACKED = 0.75;
// The same tracked-label budget for the HAND face (`--font-label` under
// `mode: sketch` = Shantell Sans). A static advance cannot describe two faces —
// mono paints 0.720 per character no matter what the string says, while a
// proportional hand runs 0.561 ('Jul '11') to 0.889 ('May') on the very same
// label set — so the sketch path needs its own constant rather than a shared
// fudge. Pass this INSTEAD of ADVANCE_MONO_TRACKED when the label's CSS resolves
// to the hand (see chart-family.js §gantt axis, which selects on the slide's
// `sketch` class so the math and the painted face can never desync).
//
// MEASURED against Shantell Sans in a real browser at the tick's own CSS
// (weight 600, 0.12em tracking), over the tick vocabulary `buildGanttTicks` can
// emit: `Q1`…`Q4` and `Jan`…`Dec`, each optionally carrying a year tag. That set
// is CLOSED — no author text reaches this label — which is what makes a measured
// maximum a real bound rather than a sample. The longest form is 7 characters
// (`Jan '26`); the widest per character is a bare 3-letter month.
//
//   worst   0.889  'May'      ← the calibration point
//   typical 0.686  'Jan '26'
//   best    0.561  'Jul '11'
//
// Deliberately NOT stated as a string count: the tag is `String(year).slice(2)`,
// so a 3-digit year yields a ONE-character tag (`Q1 '0`), and the accepted year
// range is whatever `parseTimePoint` round-trips. Enumerating exactly is brittle
// and beside the point — the bound is set by the widest per-character form, and
// no reachable label is longer than 7.
//
// 0.90 is pinned inside a NARROW window, and both walls matter:
//   ≥ 0.889 — the measured worst case. Below it the COLLISION CULL under-counts
//             (chart-family.js §gantt axis computes each tick's half-width from
//             this number) and adjacent ticks overprint. Note it is the cull, not
//             the wrapper, that this wall protects: the widest label paints under
//             44 units into a 56-unit box, so no advance in this range can make a
//             tick overrun the box it wraps to.
//   ≤ 0.941 — tickBoxW / (7 chars × fsTick), i.e. 56 / (7 × 8.5). Above that the
//             one-line budget falls to 6 characters and `maxLines: 1` ELLIPSIZES
//             the ordinary 7-character tick ('Jan '26' → 'Jan …'). Here "break
//             early" means lose text, so the usual generous safety margin is
//             itself the bug — which is why this is calibrated to the vocabulary
//             instead of rounded up to a comfortable number.
//
// Both walls hold on either metric: re-measured on the REAL rendered ticks,
// `getBBox().width` exceeds `getComputedTextLength()` by at most 0.016 per
// character here, and the worst tick is 0.8885 on both.
const ADVANCE_HAND_TRACKED = 0.90;
// Default line height as a ratio of the font size — the legend's LH_R. Diagram
// labels sit against geometry, so lines stay tight.
const LINE_HEIGHT = 1.16;

/**
 * ── The UPPERCASE label estimate: a glyph table, not a constant ──────────
 *
 * WHY THIS IS NOT A CONSTANT. The two constants above bound CLOSED
 * vocabularies — the gantt tick emits only `Q1`…`Q4` / `Jan`…`Dec`, so a
 * measured maximum is a real bound. The quadrant's corner + cohort names and
 * the radar's sector names are AUTHOR TEXT. There is no worst-case string to
 * measure, and one average cannot describe both `IL ILI` and `WORKFLOW`.
 *
 * The flat 0.68 this replaces was calibrated on four short gallery strings, and
 * measuring the real rules against a 42-string vocabulary in a real Chromium
 * showed how far that generalizes — predicted width ÷ actually-painted width:
 *
 *   flat 0.68        0.61 … 2.04   over the vocabulary as a whole
 *   this table       1.02 … 1.11   never under-counts
 *
 * Read those endpoints as properties of the VOCABULARY, not of any one string —
 * an earlier draft attached them to `WORKFLOW` and `IL ILI`, which the file's own
 * recorded measurements contradict: 0.68 / 0.790 is 13.9% short on `WORKFLOW`,
 * and 0.68 / 0.404 is 68.3% over on `IL ILI`. The −39% / +104% ends belong to
 * other strings in the set. An independent re-measurement on a different
 * 49-string vocabulary put the table's own upper end at 1.098 on fully-mapped
 * text and 1.114 with an unmapped script, so "at most 8% generous" was a
 * property of the first vocabulary too. What holds across BOTH sets, and is the
 * claim worth making, is the lower wall: it never under-counts.
 *
 * BOTH ends of that range are defects, and they are different defects. An
 * under-count breaks the box: the line is allowed past the width it was
 * measured against, and — because `left`/`right` below feed `placeLabels` /
 * `deCollideLabels` — the de-collision pass guards a box narrower than the
 * painted glyphs, so an item label is routed straight through a corner name. An
 * over-count is not the safe direction either: an inflated box wraps text that
 * would have fit and shoves neighbors out of positions that were clear, which on
 * a crowded plot ends in `placeLabels`' hide-overlap drop — a name deleted from
 * the artifact. So the goal is not a generous bound, it is a TIGHT one that is
 * never short.
 *
 * AND IT IS NOT A SKETCH-ONLY DEFECT. `mode: sketch` re-points `--font-body` at
 * the hand sans and widens these labels (`WIDE MOAT` 0.679 → 0.745), which is
 * how this surfaced — but the clean face already broke 0.68 on ordinary author
 * text (`WORKFLOW` 0.790, `AUTOMATE` 0.737, `COST` 0.702, `DEFER` 0.685). A
 * second per-face CONSTANT would have carried the same class of error into both
 * faces; a table per face removes it from both.
 *
 * MEASURED against the shipped woff2s in headless Chromium at each rule's real
 * CSS (weight 700 — `.quadrant-label` and friends say 700, not the 600 an early
 * draft assumed), `letter-spacing` held at 0 so TRACKING IS ADDED BY THE CALLER
 * and one table serves all four tracked rules (0.04em / 0.06em / 0.08em).
 * Each entry is `getComputedTextLength()` of a 20-glyph run ÷ 20 ÷ font-size,
 * then ROUNDED UP to the nearest 0.05 — which is what buys the "never short"
 * property, and keeps the table readable at a glance.
 */
const GLYPH_UPPER = {
  clean: {
    A: 0.70, B: 0.65, C: 0.70, D: 0.80, E: 0.65, F: 0.60, G: 0.80, H: 0.75, I: 0.30,
    J: 0.50, K: 0.70, L: 0.60, M: 0.90, N: 0.75, O: 0.85, P: 0.65, Q: 0.85, R: 0.65,
    S: 0.60, T: 0.65, U: 0.75, V: 0.70, W: 1.00, X: 0.70, Y: 0.65, Z: 0.60,
    0: 0.70, 1: 0.40, 2: 0.60, 3: 0.60, 4: 0.65, 5: 0.60, 6: 0.60, 7: 0.55, 8: 0.60, 9: 0.60,
    ' ': 0.25, '.': 0.35, ',': 0.30, '-': 0.50, "'": 0.30, '&': 0.70, '/': 0.40,
    '(': 0.35, ')': 0.35, '·': 0.20, ':': 0.30, '!': 0.30, '?': 0.50, '%': 0.70, '+': 0.60,
    // The WIDE punctuation. The em-quad dashes are exactly what their names say
    // — a flat 2em and 3em — and THAT is what cannot ride the fallback below,
    // which bills 1.10.
    //
    // TWO OF THESE ARE NOT IN EITHER WOFF2: `⸺` `⸻`. The HOST paints them, so
    // their numbers are readings of the host's fonts and no digest in
    // GLYPH_UPPER_FONTS pins them — `npm run fonts:measure` labels them
    // `unpinned` for exactly this reason, and holds them at their committed
    // values rather than overwriting them with one machine's reading.
    //
    // They measure identically under system-ui, `sans-serif` and a family that
    // cannot exist, so 2.00 / 3.00em is the LAST-RESORT notdef box, not a
    // measurement of any face that has the glyph. That still makes 2.05 / 3.05 a
    // real bound (a font that HAS them draws them at a definitional 2em and 3em,
    // and a font that lacks them draws the same box we measured), which is why
    // these two stay mapped: no single fallback value could bound them.
    //
    // THREE MORE USED TO SIT HERE — `―` (1.05), `→` (0.90) and `　` (1.05) — and
    // were DROPPED (2026-08-17) so they bill GLYPH_UPPER_MAX. They were unpinned
    // too, and every one was mapped BELOW the fallback: a narrower bound than
    // the fallback already gave, so on a host whose fonts paint them wider the
    // MAPPING was the thing under-counting. `fonts:measure` has been printing
    // "consider dropping the entry" for all three on every run.
    //
    // Dropping them was held back by one question — a wider advance breaks lines
    // earlier, which can change wrapping and push `placeLabels` into dropping a
    // name — and that question is now measured rather than assumed. Across the
    // 24 shipped decks carrying a quadrant or radar slide the rendered HTML is
    // BYTE-IDENTICAL (the three characters never reach this table at all: 66
    // billed label strings, 37 distinct characters, none non-ASCII), and so is a
    // purpose-built fixture whose labels DO carry them — 55 billed strings over
    // both faces and all three tracked rules. The advance is a per-character
    // average over the whole string, so re-billing one character of a 16-33
    // character label moves it +0.20% to +3.79%, never enough to flip
    // `charBudget`'s floor. Sensitivity was proven, not assumed: billing the
    // same three at 3.00 re-wraps 19 of the fixture's 24 labels.
    // See engineering/decisions/2026-08-12-sketch-label-voice.md.
    '—': 0.90, '–': 0.60, '⸺': 2.05, '⸻': 3.05,
    '…': 0.85, '•': 0.40, '™': 0.75, '°': 0.40, '×': 0.60,
    '€': 0.75, '£': 0.65,
  },
  hand: {
    A: 0.80, B: 0.65, C: 0.60, D: 0.75, E: 0.70, F: 0.60, G: 0.85, H: 0.75, I: 0.60,
    J: 0.65, K: 0.70, L: 0.55, M: 1.05, N: 0.80, O: 0.75, P: 0.65, Q: 0.80, R: 0.75,
    S: 0.60, T: 0.65, U: 0.70, V: 0.75, W: 1.05, X: 0.70, Y: 0.65, Z: 0.70,
    0: 0.70, 1: 0.45, 2: 0.70, 3: 0.70, 4: 0.70, 5: 0.65, 6: 0.75, 7: 0.70, 8: 0.75, 9: 0.70,
    ' ': 0.35, '.': 0.30, ',': 0.35, '-': 0.55, "'": 0.30, '&': 0.70, '/': 0.40,
    '(': 0.50, ')': 0.45, '·': 0.35, ':': 0.35, '!': 0.30, '?': 0.55, '%': 1.00, '+': 0.75,
    // See the clean table — including why `―` `→` `　` are no longer here.
    '—': 1.10, '–': 0.75, '⸺': 2.05, '⸻': 3.05,
    '…': 0.90, '•': 0.55, '™': 1.20, '°': 0.65, '×': 0.75,
    '€': 0.75, '£': 0.75,
  },
};

/**
 * What an UNMAPPED character bills, per UTF-16 unit.
 *
 * NOT "the widest glyph in the table", which is what an earlier cut said and
 * what the code did. That framing sounds safe and is not: the fallback would
 * then be the widest glyph we happened to MEASURE, while the set of characters
 * an author can type is unbounded. Measured against the shipped faces, a
 * three-em dash paints 3.00em — three times the widest letter — so a label of
 * them was estimated at 0.34x its painted width, an under-count and therefore
 * the clipping direction. The em-quad dashes are mapped above for that reason;
 * this constant covers what is left.
 *
 * 1.10 is chosen against the widest UNMAPPED thing measured: CJK, fullwidth
 * Latin and the ideographic space all sit at exactly 1.00em, Greek at 0.85,
 * arrows at 0.84, currency at <= 0.75. 1.10 clears the 1.00 cluster by 10%,
 * where the old `= widest mapped` gave CJK exactly ZERO margin.
 *
 * THE RESIDUAL, stated rather than implied away: a character that is neither in
 * the table nor narrower than 1.10em still under-counts. Nothing this repo can
 * enumerate is left in that gap, but a per-character table cannot promise a
 * universal bound — only real measurement could, and the module has no DOM. If
 * a label ever clips on an exotic script, this is the line to revisit.
 */
const GLYPH_UPPER_MAX = { clean: 1.10, hand: 1.10 };

/**
 * ── The FONT PIN: which bytes the table above is a claim about ────────────
 *
 * THE HOLE THIS CLOSES. `GLYPH_UPPER` is a measurement of two specific woff2
 * files, frozen as literals. So are the browser measurements the unit suite
 * compares it against (`MEASURED` in test/unit/transformers/svg-label.test.js).
 * Both sides of that comparison sit in the same repo, and NEITHER is derived
 * from the font. Bump `assets/fonts/outfit-700.woff2` and the painted width
 * moves while the table and the "measurements" hold still: the suite stays
 * green, `build:check` stays green, and quadrant + radar labels start
 * overrunning their boxes silently — which also hands `deCollideLabels` a box
 * narrower than the painted glyphs, so a name is routed straight through a
 * corner label. A green gate that cannot see the thing it is guarding is worse
 * than no gate, because it manufactures confidence.
 *
 * So the table names the bytes it was measured against, and
 * `checkFontMetricsPin` (tools/check-ownership.js, via `build:check`) fails the
 * build the moment a pinned face's digest moves. That does not re-derive the
 * table — it makes the font swap IMPOSSIBLE TO LAND SILENTLY, which is the
 * actual defect. The remediation is a command, not archaeology:
 * `npm run fonts:measure` re-measures every entry in real Chromium against the
 * new bytes and prints the corrected rows.
 *
 * KEYED BY FACE, and the gate holds the two key sets equal in both directions:
 * a face with a table but no pin fails, and a pin naming a face the table
 * dropped fails as stale. A third face therefore cannot be added un-pinned.
 *
 * EVERY HAND-MAINTAINED SUPPLY IS PINNED, not just the first one. Each face
 * ships TWICE from source: `assets/fonts/` is what the engine and the export
 * embed, and `docs/src/playground/fonts/` is a separate vendored copy (carrying
 * a wider latin subset — see assets/fonts/README.md) that `font-embed.js`
 * inlines into the Studio's live preview. That preview paints these very labels
 * through this very kernel, so pinning only `assets/` would have left the
 * Studio's supply free to move with every check green — the same hole one level
 * over. The two copies are metrically equivalent today: measured glyph by glyph
 * in Chromium at weight 700, they agree within 0.0004em across the whole table,
 * far inside the 0.05 quantization, so one table legitimately serves both.
 * `dist/fonts/` and `dist/marp-kit/fonts/` are deliberately NOT listed — they
 * are generated from `assets/` (HARD RULE #2) and `build:check` already
 * byte-diffs them.
 *
 * WHAT THE PIN DOES NOT CATCH, stated rather than implied away — and stated
 * accurately, because an earlier draft of this paragraph claimed cover that does
 * not exist. It watches FONT BYTES, and nothing else:
 *
 *   · THE LABELS' OWN CSS IS UNGUARDED. Re-tune `.quadrant-label` to
 *     `font-weight: 400` / `letter-spacing: 0.12em` and every gate stays green —
 *     verified, the unit suite passes 39/39 through exactly that edit. Nothing
 *     in test/unit/transformers/svg-label.test.js reads a stylesheet: it drives
 *     `upperAdvance` against frozen numbers with `TRACK` hardcoded. The same is
 *     true of the `tracking:` values the transforms pass. What that suite
 *     actually catches is an edit to `GLYPH_UPPER` or to `upperAdvance` itself.
 *   · THE THEME OVERRIDE SEAM IS UNGUARDED. `--font-body` / `--sketch-font-body`
 *     are documented as swappable (lib/base/base.docs.md), and a theme that
 *     re-points either paints a face this table never measured. `upperAdvance`'s
 *     unknown-face fallback does NOT cover that: `face` is computed as
 *     `hand ? 'hand' : 'clean'`, so both keys always exist and the `||` branch is
 *     unreachable — as its own comment says.
 *   · A CHROMIUM SHAPING CHANGE is caught by nothing here, and would surface as
 *     a `npm run fonts:measure` diff whenever someone runs it.
 */
const GLYPH_UPPER_FONTS = {
  clean: {
    family: 'Outfit',
    sources: [
      {
        file: 'assets/fonts/outfit-700.woff2',
        sha256: '5d5e3734089a74707292ce8a3e186def34cd63e33879f9ac3689a8d8da9d0706',
      },
      {
        file: 'docs/src/playground/fonts/outfit-700.woff2',
        sha256: '6c18d579fd87c3776be068b762cbc83fde3acb543d49eabd3ade842eb987e887',
      },
    ],
  },
  hand: {
    family: 'Shantell Sans',
    sources: [
      {
        file: 'assets/fonts/shantell-700.woff2',
        sha256: 'f7e25716f7da1d461996fa14050e92b6b7b9f271e7ef3d0d8b67872fc7aa7112',
      },
      {
        file: 'docs/src/playground/fonts/shantell-sans-700.woff2',
        sha256: 'f15631aba9746668ad895821c72db5825759fe0bddaa4da1e7ea33d0dc2d5477',
      },
    ],
  },
};

/**
 * The per-character advance of ONE uppercase, tracked string — the value to
 * pass as `advance`. Returns a per-character average deliberately: it drops
 * into the existing `advance` plumbing unchanged, and `measureLabel` re-asks
 * PER LINE (see the tighten loop there), so a narrow word averaged in with a
 * wide one cannot buy the wide one a budget it does not deserve.
 *
 * @param {string} text
 * @param {object} o
 * @param {boolean} [o.hand]     the label's CSS resolves to the hand sans
 *                               (`mode: sketch`), selected from the slide's
 *                               class exactly as the gantt axis selects its
 *                               tick advance — so the math and the painted face
 *                               can never desync.
 * @param {number} [o.tracking]  the rule's `letter-spacing`, in em. Additive per
 *                               character, which is why the table holds glyphs
 *                               only and every tracked rule shares it.
 */
function upperAdvance(text, opts) {
  // `= {}` only defaults `undefined`, so an explicit null threw. Cheap to accept.
  const { hand = false, tracking = 0 } = opts || {};
  const face = hand ? 'hand' : 'clean';
  // An unknown face bills at the widest glyph across ALL known faces, not at the
  // clean table. Only two faces exist today, so this is unreachable — but the
  // `--sketch-font-body` / `--font-body` tokens are a documented theme override
  // seam (`lib/base/base.docs.md`), and the day a theme uses it the silent
  // failure would be measuring one face while painting another. Unknown → widest
  // keeps that in the direction that cannot clip, matching how an unmapped
  // CHARACTER is billed.
  const tbl = GLYPH_UPPER[face] || GLYPH_UPPER.clean;
  const max = GLYPH_UPPER[face]
    ? GLYPH_UPPER_MAX[face]
    : Math.max(...Object.values(GLYPH_UPPER_MAX));
  const src = String(text == null ? '' : text);
  if (!src.length) return max + tracking;
  // DIVIDE BY THE SOURCE LENGTH, NOT THE UPPERCASED ONE. This returns a
  // PER-CHARACTER number, and both consumers multiply it back by a count of the
  // SOURCE string — `charBudget` feeds a character budget to the line-breaker,
  // and `widestOf` does `line.length × advance`. `toUpperCase()` can EXPAND
  // (`ß`→`SS`, and the ligatures a paste out of a PDF or Word carries: `ﬄ`→`FFL`,
  // 1 character to 3), and CSS `text-transform: uppercase` performs the same
  // mapping — so the paint expands while the count does not. Dividing by the
  // expanded length diluted the advance by exactly the expansion factor, which
  // is an UNDER-count and therefore the clipping direction: measured, a corner
  // name of 16 `ﬄ` painted 356.97u into a 140u box, ran off the left edge of the
  // viewBox and printed through its neighbor. Billing the expansion against the
  // source count keeps the number consistent with what multiplies it.
  const upper = [...src.toUpperCase()];
  let sum = 0;
  for (const ch of upper) {
    // An unmapped ASTRAL code point (emoji, most historic scripts) is ONE glyph
    // spread over TWO UTF-16 units, and `src.length` — what the consumers count
    // — counts the units. Billing it once therefore halves it: `🙂🙂` estimated
    // 0.81x its painted width. Bill per unit so the denominator agrees.
    sum += tbl[ch] === undefined ? max * ch.length : tbl[ch];
  }
  return (sum + upper.length * tracking) / src.length;
}

/** Resolve `advance` — a number, or a per-string function from `upperAdvance`. */
function advanceFor(advance) {
  return typeof advance === 'function' ? advance : () => advance;
}

/**
 * How many characters fit on one line of `width` user units at `fontSize`.
 * Floors at 1 so a pathologically narrow box still makes progress (a 0-char
 * budget would make the line-breaker loop forever on a single long token).
 *
 * `advance` is a NUMBER here — callers holding a per-string function resolve it
 * first (`measureLabel` does). One passed in anyway is billed at its widest
 * reading (`upperAdvance('')` returns the face's widest glyph), so the mistake
 * costs an early break rather than a NaN budget.
 */
function charBudget(width, fontSize, advance = ADVANCE) {
  const per = fontSize * (typeof advance === 'function' ? advance('') : advance);
  if (!(per > 0) || !(width > 0)) return 1;
  return Math.max(1, Math.floor(width / per));
}

/**
 * Break `text` to the given width WITHOUT emitting markup — the measurement
 * half of the emitter, for callers that need a label's box before they can
 * place it (the quadrant's de-collision pass measures every label first, then
 * nudges, then emits).
 *
 * `maxLines` caps the block height where geometry is hard-limited (a funnel
 * band's height, a gantt lane's height). Overflow past the cap ellipsizes the
 * LAST line rather than silently dropping text: a visible "…" is honest about
 * truncation, where a dropped line reads as data that was never there. Callers
 * generally derive maxLines from the space they actually have, so the cap is a
 * backstop, not the common path.
 */
function measureLabel(text, { width, fontSize, maxLines = Infinity, advance = ADVANCE, lineHeight = LINE_HEIGHT }) {
  const advOf = advanceFor(advance);
  const src = String(text == null ? '' : text);
  let budget = charBudget(width, fontSize, advOf(src));
  let lines = wrapLabelToLines(src, budget);
  // TIGHTEN PER LINE. A string-derived advance (`upperAdvance`) is the average
  // over the WHOLE label, so a narrow word can subsidize a wide one: `IL ILI
  // WORKFLOW` averages well under what the line `WORKFLOW` alone paints, and
  // that line would then be allowed past the width it was measured against.
  // Re-ask with the widest LINE's own advance and re-wrap until the budget
  // stops shrinking. Monotonic, so it converges; the guard bounds the
  // pathological case, and a single unbreakable word simply keeps its budget
  // (nothing can wrap one word — that is the same outcome as before).
  //
  // A NUMERIC advance is unaffected: `advOf` returns the same number for every
  // line, so the recomputed budget equals the first one and the loop exits on
  // its first pass. Every existing caller is byte-identical through here.
  for (let guard = 0; guard < 8 && budget > 1; guard++) {
    const worst = lines.reduce((w, l) => Math.max(w, advOf(l)), 0);
    const tighter = charBudget(width, fontSize, worst);
    if (tighter >= budget) break;
    budget = tighter;
    lines = wrapLabelToLines(src, budget);
  }
  if (lines.length > maxLines && maxLines >= 1) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    // Trim to make room for the ellipsis, so the truncated line still fits the
    // budget it was broken to.
    let cut = Math.max(0, budget - 1);
    let ell = `${last.slice(0, cut).trimEnd()}…`;
    // THE ELLIPSIZED LINE IS A NEW STRING, so it needs its own check. This runs
    // AFTER the tighten loop and replaces the last line's content, and `…` is
    // not one of the characters the budget was derived over — so a line at
    // exactly `budget` characters can paint past `width` once the ellipsis is
    // swapped in. Measured: an Arabic label (every glyph unmapped, so billed at
    // the fallback) came out at 140.8u in a 140u box. Shrink until it fits.
    // Bounded by `cut`; one character plus `…` is the floor, past which the
    // caller has asked for a box too narrow for any label.
    while (cut > 1 && ell.length * fontSize * advOf(ell) > width + 0.01) {
      cut -= 1;
      ell = `${last.slice(0, cut).trimEnd()}…`;
    }
    kept[maxLines - 1] = ell;
    lines = kept;
  }
  return {
    lines,
    height: (lines.length - 1) * fontSize * lineHeight + fontSize,
    lineHeight: fontSize * lineHeight,
  };
}

/**
 * Emit one wrapping `<text>` element: a single `<text>` carrying one `<tspan>`
 * per line, each with an explicit `x` + `y` (absolute per-line placement, the
 * legend's convention — more robust than cumulative `dy`, which drifts if a
 * line is ever dropped and re-anchors wrong under `text-anchor`).
 *
 * @param {string} text         the label (tags already stripped by the caller)
 * @param {object} o
 * @param {number} o.x          anchor x, in viewBox user units
 * @param {number} o.y          anchor y — see `vAlign`
 * @param {number} o.width      the width the label may occupy, user units
 * @param {number} o.fontSize   nominal font size, user units (must match CSS)
 * @param {string} [o.anchor]   SVG `text-anchor`: start | middle | end
 * @param {string} [o.vAlign]   where `y` sits on the block:
 *                              'baseline' — y is the FIRST line's baseline (the
 *                                 single-line default; a 1-line label emits at
 *                                 exactly the y it always did);
 *                              'middle'  — the whole block is centered on y, so
 *                                 a label centered against geometry (a funnel
 *                                 band, a quadrant dot) STAYS centered as it
 *                                 grows lines instead of drifting downward;
 *                              'hanging' — y is the block's top edge.
 * @param {number} [o.maxLines] cap; the last line ellipsizes past it
 * @param {string} [o.className] class attribute
 * @param {string} [o.attrs]    extra attributes, pre-escaped by the caller
 *                              (data-mark, data-anima-role, dominant-baseline…)
 * @param {number} [o.lineHeight] line height as a ratio of fontSize
 * @param {boolean} [o.emitFontSize] emit the font-size attribute (default true —
 *                              the kernel owns the size it wrapped to). Pass
 *                              false only where CSS is the sole owner AND the
 *                              caller passed that same size in.
 * @returns {{ svg: string, lines: string[], height: number, top: number, bottom: number }}
 *          `top`/`bottom` are the block's vertical extent in user units — the
 *          caller uses them to grow its geometry or de-collide neighbors.
 */
// Where a `dominant-baseline` puts the GLYPHS relative to the anchor y, as
// multiples of the font size: [above, below]. This is not cosmetic — the
// de-collision pass compares these boxes, so a box computed for the wrong
// baseline guards empty space while the painted text sits somewhere else.
// (Exactly that: corner names are painted `hanging`, whose glyphs sit ENTIRELY
// BELOW y, but were boxed as if they sat above it — so item labels were routed
// around a phantom box and printed straight through "STRATEGIC BETS".)
const BASELINE_EXTENT = {
  auto: [0.78, 0.28],        // alphabetic — glyphs sit above the baseline
  alphabetic: [0.78, 0.28],
  hanging: [0.06, 1.00],     // glyphs hang below y
  middle: [0.53, 0.53],      // centered on y
  central: [0.53, 0.53],
};

function wrapSvgLabel(text, {
  x, y, width, fontSize,
  anchor = 'start',
  baseline = null,
  vAlign = 'baseline',
  maxLines = Infinity,
  className = '',
  attrs = '',
  lineHeight = LINE_HEIGHT,
  advance = ADVANCE,
  emitFontSize = true,
}) {
  const m = measureLabel(text, { width, fontSize, maxLines, advance, lineHeight });
  const LH = m.lineHeight;
  const ext = BASELINE_EXTENT[baseline] || BASELINE_EXTENT.auto;
  const n = m.lines.length;
  // First-line baseline. 'baseline' keeps a single-line label byte-identical to
  // the un-wrapped emitter it replaces; 'middle' lifts the block by half its
  // extra height so growth is symmetric about y; 'hanging' drops a full
  // font-size so y reads as the top edge.
  let firstBaseline = y;
  if (vAlign === 'middle') firstBaseline = y - ((n - 1) * LH) / 2;
  else if (vAlign === 'hanging') firstBaseline = y + fontSize;
  // 'bottom' — y is the LAST line's baseline, so the block grows UPWARD. This is
  // what a label sitting above the thing it names needs: extra lines must climb
  // away from the mark, never descend onto it. (With vAlign 'baseline' a
  // two-line label above a dot would put its second line on the dot.)
  else if (vAlign === 'bottom') firstBaseline = y - (n - 1) * LH;

  const cls = className ? ` class="${className}"` : '';
  const fs = emitFontSize ? ` font-size="${round(fontSize)}"` : '';
  // The emitter OWNS dominant-baseline when the caller declares one, so the box
  // math below and the painted glyphs cannot disagree.
  const db = baseline ? ` dominant-baseline="${baseline}"` : '';
  const tspans = m.lines
    .map((ln, i) => `<tspan x="${round(x)}" y="${round(firstBaseline + i * LH)}">${xmlEsc(ln)}</tspan>`)
    .join('');
  const svg = `<text${cls}${fs} text-anchor="${anchor}"${db}${attrs}>${tspans}</text>`;

  return {
    svg,
    lines: m.lines,
    height: m.height,
    // Optical extent — the box the DE-COLLISION pass compares, so it brackets
    // the painted glyphs, not the baselines: ascent above the first baseline,
    // descent below the last. For the body faces this engine ships a baseline
    // sits ~0.78em below the ascender top and ~0.28em above the descender
    // bottom, which makes this box slightly TALLER than `height` (a pure
    // baseline-to-baseline + one line measure). That surplus is deliberate:
    // two labels whose optical boxes merely touch would still visually crowd,
    // so the pass separates them a hair before they actually overlap.
    top: firstBaseline - fontSize * ext[0],
    bottom: firstBaseline + (n - 1) * LH + fontSize * ext[1],
    // Horizontal extent, derived from the WIDEST line and the anchor. Two
    // labels only collide if they share horizontal space, so the de-collision
    // pass needs this as well as top/bottom — without it, a label on the left
    // of the chart would shove one on the right. Estimated with the same
    // conservative advance the line-breaker used, so it errs WIDE: the pass
    // separates a borderline pair rather than letting it print through.
    left: anchor === 'middle' ? x - widestOf(m.lines, fontSize, advance) / 2
      : anchor === 'end' ? x - widestOf(m.lines, fontSize, advance) : x,
    right: anchor === 'middle' ? x + widestOf(m.lines, fontSize, advance) / 2
      : anchor === 'end' ? x : x + widestOf(m.lines, fontSize, advance),
  };
}

/**
 * The painted width of the widest line, estimated in user units.
 *
 * Widest by PAINTED width, not by character count — with a per-string advance
 * the two disagree, and it is the painted one the de-collision pass compares.
 * (`ILLINOIS` is 8 characters and `WORKFLOW` is 8, and the second paints more
 * than twice the first.) A numeric advance collapses this to the old
 * `longest × fontSize × advance` exactly.
 */
function widestOf(lines, fontSize, advance) {
  const advOf = advanceFor(advance);
  return lines.reduce((w, l) => Math.max(w, l.length * advOf(l)), 0) * fontSize;
}

function round(n) {
  return Number(Number(n).toFixed(2)).toString();
}

/**
 * Push overlapping labels apart — the placement half of the problem.
 *
 * Wrapping fixes a label that is too WIDE for its box. It does nothing for two
 * labels that simply land on top of each other, which is a placement problem:
 * on a scatter chart, two points plotted close together carry two labels that
 * overprint no matter how narrow each one is. (Verified on the quadrant: two
 * dots in the same corner printed their names straight through each other, and
 * through the corner's own quadrant label.) So after wrapping, boxes get nudged.
 *
 * The pass is DETERMINISTIC and runs at build time — same input, same output,
 * every render path, and identical in the exported PDF. A runtime reflow would
 * diverge from the export and fight the anima clone.
 *
 * Greedy in the order given, so pass boxes in PRIORITY order: an earlier box
 * holds its place and later ones move around it. A box marked `fixed` never
 * moves at all — that is how a chart pins its structural labels (the quadrant's
 * corner names, an axis title) and lets only the data labels shift.
 *
 * Each box moves along its OWN `dir` (-1 = up, +1 = down), which is the
 * direction that carries it AWAY from the mark it names — a label sitting above
 * its dot moves further up, never down through the dot.
 *
 * @param {Array<{left:number,right:number,top:number,bottom:number,dir?:number,fixed?:boolean}>} boxes
 * @param {object} [o]
 * @param {number} [o.minGap]   clear space to keep between two boxes, user units
 * @param {number} [o.maxShift] give up past this much travel and leave the box
 *                              where it started: a label dragged half the chart
 *                              away from its own dot is worse than one that
 *                              slightly overlaps, because it now reads as
 *                              labelling something else.
 * @returns {number[]} the dy to apply to each input box, in the same order.
 */
function deCollideLabels(boxes, { minGap = 1.5, maxShift = 24 } = {}) {
  const shifts = new Array(boxes.length).fill(0);
  const placed = [];

  // Slide `b` along `dir` until it clears everything already placed. Re-scans
  // after each nudge, because moving clear of one box can slide it into
  // another. Bounded so a pathological cluster can't spin.
  const settle = (b, dir) => {
    let top = b.top;
    let bottom = b.bottom;
    let shift = 0;
    let guard = 0;
    let moved = true;
    while (moved && guard++ < 64) {
      moved = false;
      for (const q of placed) {
        const hits = b.left < q.right && b.right > q.left && top < q.bottom + minGap && bottom > q.top - minGap;
        if (!hits) continue;
        const delta = dir === 1 ? q.bottom + minGap - top : q.top - minGap - bottom;
        top += delta; bottom += delta; shift += delta;
        moved = true;
      }
    }
    return { top, bottom, shift, clear: !moved };
  };

  boxes.forEach((b, i) => {
    if (b.fixed) { placed.push({ ...b }); return; }
    const dir = b.dir === -1 ? -1 : 1;
    // The PREFERRED direction wins whenever it works. `dir` is not a hint, it
    // is the direction that carries the label away from the mark it names — a
    // label above its dot must climb, because descending would land it ON the
    // dot. Taking merely the SHORTER of the two would do exactly that.
    //
    // The opposite direction is a FALLBACK, used only when the preferred one
    // cannot succeed inside maxShift. That case is real: a dot near the top of
    // the plot wants its label above it, which is precisely where the
    // quadrant's corner name sits, so climbing would have to clear the whole
    // corner label and end up outside the plot. Dropping the label just below
    // its dot still reads as that dot's label; hovering it off in the margin
    // does not.
    const fwd = settle(b, dir);
    let pick = fwd;
    if (Math.abs(fwd.shift) > maxShift) {
      const back = settle(b, -dir);
      if (Math.abs(back.shift) <= maxShift) pick = back;
    }
    if (Math.abs(pick.shift) > maxShift) {
      // Both ways are too far to still read as this mark's label — leave it put
      // and accept the overlap. Recorded as 0 rather than clamped, so the label
      // stays anchored to its own dot instead of hovering at an arbitrary
      // distance from it.
      placed.push({ ...b });
      return;
    }
    shifts[i] = pick.shift;
    placed.push({ ...b, top: pick.top, bottom: pick.bottom });
  });
  return shifts;
}

/**
 * Where a label may sit relative to the mark it names. Eight anchors around the
 * dot, each carrying the anchor/baseline/vAlign that makes the block grow AWAY
 * from the mark — so a second line never descends onto the dot it labels.
 *
 * `cost` is the preference, and VERTICAL WINS. A name centered over or under its
 * point reads as that point's caption at a glance; a name off to one side reads
 * as a row in a list that happens to sit near a dot. So above and below come
 * first, the diagonals next (still mostly vertical), and pure left/right last —
 * and the gap is wide enough that a vertical position on a FURTHER ring beats a
 * horizontal one on the nearest (see RING_COST). A side placement is what you
 * fall back to when the column above and below a point is genuinely full.
 */
const LABEL_ANCHORS = [
  { key: 'above', dx: 0, dy: -1, cost: 0, anchor: 'middle', baseline: 'auto', vAlign: 'bottom' },
  { key: 'below', dx: 0, dy: 1, cost: 1, anchor: 'middle', baseline: 'hanging', vAlign: 'baseline' },
  { key: 'above-right', dx: 1, dy: -1, cost: 6, anchor: 'start', baseline: 'auto', vAlign: 'bottom' },
  { key: 'above-left', dx: -1, dy: -1, cost: 7, anchor: 'end', baseline: 'auto', vAlign: 'bottom' },
  { key: 'below-right', dx: 1, dy: 1, cost: 8, anchor: 'start', baseline: 'hanging', vAlign: 'baseline' },
  { key: 'below-left', dx: -1, dy: 1, cost: 9, anchor: 'end', baseline: 'hanging', vAlign: 'baseline' },
  { key: 'right', dx: 1, dy: 0, cost: 14, anchor: 'start', baseline: 'middle', vAlign: 'middle' },
  { key: 'left', dx: -1, dy: 0, cost: 15, anchor: 'end', baseline: 'middle', vAlign: 'middle' },
];

// What one extra ring of distance costs, in the same units as an anchor's
// `cost`. At 2, `above` on the THIRD ring (0 + 4) still beats `right` on the
// first (14) — which is the intent: a caption a little further above its point
// is read correctly, one beside it is read as a neighbor.
const RING_COST = 2;

function overlapArea(a, b, gap) {
  const w = Math.min(a.right, b.right + gap) - Math.max(a.left, b.left - gap);
  const h = Math.min(a.bottom, b.bottom + gap) - Math.max(a.top, b.top - gap);
  return w > 0 && h > 0 ? w * h : 0;
}

function escapesBounds(box, bounds) {
  if (!bounds) return 0;
  return Math.max(0, bounds.x0 - box.left) + Math.max(0, box.right - bounds.x1)
    + Math.max(0, bounds.y0 - box.top) + Math.max(0, box.bottom - bounds.y1);
}

/**
 * Place a set of scatter labels next to the marks they name.
 *
 * THE PROBLEM THIS REPLACES. Placement used to be one guess plus a slide along
 * one axis: a zone heuristic picked above/below/beside per dot, then
 * `deCollideLabels` pushed the box until it cleared. Two things followed, both
 * visible on a real deck. A label that started in a crowded spot slid a long way
 * from its dot — up to `maxShift`, a fifth of the plot — and read as labelling
 * something else. And every label in a cluster slid the SAME direction, so three
 * names stacked into a column while their three dots stayed where they were.
 *
 * A slide cannot fix that, because the problem is not that the label is in the
 * wrong PLACE; it is that there is only one place on offer. So this pass offers
 * eight (`LABEL_ANCHORS`) and picks per label:
 *
 *   - reject a position that overlaps an already-placed label, any mark, any
 *     fixed obstacle, or that leaves `bounds`;
 *   - among what survives, take the most preferred (above > below > sides >
 *     diagonals);
 *   - if NOTHING survives, take the position with the least overlap and nudge it
 *     a little (bounded by `nudge`, not by half the chart).
 *
 * The property that matters: a label is always ADJACENT to its own mark. The
 * distance is bounded by the mark's radius plus `gap`, never by a travel budget.
 * Two dots close together get different SIDES rather than a stack.
 *
 * Greedy in the order given and fully deterministic — same input, same output,
 * every render path, identical in the exported PDF.
 *
 * @param {Array<{text:string, cx:number, cy:number, r:number, spec:object}>} items
 *        `spec` is the wrap spec minus placement (width, fontSize, maxLines,
 *        className, attrs, advance, emitFontSize).
 * @param {object} [o]
 * @param {Array} [o.obstacles] fixed boxes {left,right,top,bottom} to avoid
 * @param {object} [o.bounds]   {x0,y0,x1,y1} the label must stay inside
 * @param {number} [o.gap]      clear space between a mark and its label
 * @param {number} [o.minGap]   clear space between two labels
 * @param {number} [o.nudge]    max travel for the no-feasible-position fallback
 * @returns {Array<{svg:string, box:object, anchorKey:string}>} in input order
 */
function placeLabels(items, { obstacles = [], bounds = null, gap = 4, minGap = 1.5, nudge = 24 } = {}) {
  // Every mark is an obstacle for every label — including its OWN, which is why
  // each anchor starts a radius away. A label over a data point hides the value
  // it is naming, which is worse than a label over another label.
  const marks = items.map((it) => ({
    left: it.cx - it.r, right: it.cx + it.r, top: it.cy - it.r, bottom: it.cy + it.r,
  }));
  const blocked = obstacles.concat(marks);
  const placed = [];
  const out = [];

  for (const it of items) {
    let best = null;
    let leastOverlap = null;
    // Eight anchors at three distances. One ring is not enough for a real
    // cluster — four dots inside ~15 units leave no clear spot at a single
    // reach, and the whole point of this pass is that the answer to "no room"
    // is another POSITION, not a long slide. A further ring costs a little
    // adjacency, which is why it is scored, but the label is still unmistakably
    // that dot's.
    //
    // Every clear position is scored and the CHEAPEST wins — not the first one
    // found. Taking the first would make the ring loop the outer preference and
    // put a label beside its point rather than one line further above it, which
    // is the weaker read (see LABEL_ANCHORS).
    const step = (it.spec.fontSize || 8.5) * LINE_HEIGHT;
    for (let ring = 0; ring < 3; ring++) {
      const ringCost = ring * RING_COST;
      // Nothing on a further ring can beat what we already have.
      if (best && ringCost >= best.cost) break;
      for (const a of LABEL_ANCHORS) {
        const cost = ringCost + a.cost;
        if (best && cost >= best.cost) continue;
        const reach = it.r + gap + ring * step;
        const cand = wrapSvgLabel(it.text, {
          ...it.spec,
          x: it.cx + a.dx * reach,
          y: it.cy + a.dy * reach,
          anchor: a.anchor, baseline: a.baseline, vAlign: a.vAlign,
        });
        // A label over a MARK hides the value it names, which is strictly worse
        // than a label over another label — so it is weighted far heavier, and
        // leaving the plot heavier still.
        const onMark = blocked.reduce((s, b) => s + overlapArea(cand, b, 0), 0);
        const onLabel = placed.reduce((s, b) => s + overlapArea(cand, b, minGap), 0);
        const score = onMark * 1000 + onLabel + escapesBounds(cand, bounds) * 5000;
        if (score === 0) { best = { cand, a, cost, ring, reach }; continue; }
        // Ring and preference only break ties between equally-bad spots; they
        // must never outweigh an actual collision.
        const ranked = score + cost * 0.01;
        // Carry the REACH: the least-bad candidate may have come from ring 1 or
        // 2, and the fallback below re-emits it. Re-deriving the reach from ring
        // 0 there would move the label to a position that was never scored.
        if (!leastOverlap || ranked < leastOverlap.score) leastOverlap = { cand, a, ring, reach, score: ranked };
      }
    }

    let chosen = best;
    const fellBack = !chosen;
    if (!chosen) {
      // Nothing clears. Keep the least-bad position — still beside its own mark
      // — and nudge it a little along the direction that leads away from the
      // mark. A small nudge is a tidy-up; a long one is the old defect.
      //
      // Re-emitted at the reach it was SCORED at, not at ring 0: the least-bad
      // candidate can come from any ring, and rebuilding it at a different
      // distance would place the label somewhere the pass never evaluated —
      // possibly straight back into an overlap it had just avoided.
      const { cand, a, reach, ring } = leastOverlap;
      const dir = a.dy === 0 ? 1 : a.dy;
      const [dy] = deCollideLabels(
        blocked.concat(placed).map((b) => ({ ...b, fixed: true })).concat([{ ...cand, dir }]),
        { minGap, maxShift: nudge },
      ).slice(-1);
      chosen = dy
        ? {
          a, ring, reach,
          cand: wrapSvgLabel(it.text, {
            ...it.spec,
            x: it.cx + a.dx * reach,
            y: it.cy + a.dy * reach + dy,
            anchor: a.anchor, baseline: a.baseline, vAlign: a.vAlign,
          }),
        }
        : { cand, a, ring, reach };

      // HIDE-OVERLAP. Some sets simply cannot be laid out: five three-line names
      // in one quadrant is ~76% of that quadrant's area in label, and no choice
      // of position fixes an area problem. The old pass answered by painting
      // them on top of each other, which is the worst available outcome — two
      // overprinted names are not one readable name plus one lost, they are two
      // lost, and the reader cannot tell it happened.
      //
      // So a label that STILL collides after every position and the nudge is
      // dropped rather than painted through its neighbor. Nothing is lost from
      // the artifact: the name rides `data-label` on the mark, the mark-detail
      // popover, and the slide's speaker note. This is the same call the
      // decision note already makes about truncation — an honestly missing label
      // beats a confidently wrong one — and it is what every serious charting
      // library does (ECharts calls it `hideOverlap`).
      const residual = blocked.reduce((t, b) => t + overlapArea(chosen.cand, b, 0), 0) * 1000
        + placed.reduce((t, b) => t + overlapArea(chosen.cand, b, 0), 0);
      if (residual > 0) {
        out.push({ svg: '', box: chosen.cand, anchorKey: chosen.a.key, ring: chosen.ring, reach: chosen.reach, fallback: fellBack, hidden: true });
        continue;
      }
    }
    placed.push(chosen.cand);
    out.push({ svg: chosen.cand.svg, box: chosen.cand, anchorKey: chosen.a.key, ring: chosen.ring, reach: chosen.reach, fallback: fellBack });
  }
  return out;
}

module.exports = {
  wrapSvgLabel, measureLabel, charBudget, deCollideLabels, placeLabels,
  LABEL_ANCHORS, upperAdvance, GLYPH_UPPER, GLYPH_UPPER_MAX, GLYPH_UPPER_FONTS,
  ADVANCE, ADVANCE_MONO_TRACKED, ADVANCE_HAND_TRACKED, LINE_HEIGHT, BASELINE_EXTENT,
};
