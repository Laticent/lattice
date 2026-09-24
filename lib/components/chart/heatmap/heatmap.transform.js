/**
 * Heatmap — a numeric matrix read as intensity.
 *
 * THE CLAIM IT MAKES, and why no existing member makes it: *these two
 * dimensions interact, and here is where the value concentrates*. The family
 * already covers the qualitative grid (`matrix-grid`, whose cells are tagged
 * verbs, not numbers) and the geographic one (`map`, a choropleth over regions),
 * but nothing reads a NUMBER at every row x column crossing. Cohort retention,
 * a risk matrix, usage by hour x weekday — the shape a board deck reaches for
 * when the story is "where does this concentrate", not "how do these compare".
 *
 * AUTHORED AS A MARKDOWN TABLE, which is the notation a matrix actually has.
 * The header row names the columns, each body row leads with its label, and a
 * BLANK cell is a crossing nobody measured. This replaced the family's nested
 * list in 2026-09: the list made an author write every column name once PER ROW,
 * and a heatmap's data starts in a spreadsheet, where a table is paste-compatible
 * and a list has to be transcribed by hand. Measured on the 10-by-12 stress
 * matrix: 94 authored lines as a list against 12 as a table. See
 * `engineering/decisions/2026-09-20-heatmap-table-authoring-label-sets.md`.
 *
 *   <!-- _class: heatmap -->
 *
 *   `Retention · 2026 cohorts`
 *   ## Retention decays fastest in month two.
 *
 *   | Cohort   | M0  | M1 | M2 | M3 |
 *   | -------- | --: | -: | -: | -: |
 *   | Jan 2026 | 100 | 62 | 48 | 44 |
 *   | Feb 2026 | 100 | 58 | 44 |    |
 *
 * The table costs the sublist channel the rest of the family hangs its per-mark
 * detail on, so a cell's annotation rides a `` `# prose` `` sigil in the cell —
 * see CELL_NOTE for why a second value pill cannot do that job.
 *
 * COLOR IS `map`'S RAMP, NOT A NEW ONE. A heatmap encodes a continuous value as
 * intensity, which is structurally the choropleth's problem on a regular grid
 * rather than on geography — so it takes the mechanism `map` already proved:
 * one hue mixed into a NEUTRAL anchor by a `--mix` percentage the kernel sets,
 * low reading as a faint tint OVER the empty fill and never below it. That last
 * property is what keeps an authored zero distinguishable from a missing cell,
 * and it is why this does not use the engine-wide `--seq-*` ramp: those are
 * DISCRETE tiers (`word-cloud spectrum` reads five weights off them) and a
 * matrix needs a continuous scale. The kernel emits no color (HARD RULE #3).
 *
 * A MISSING CELL IS NOT A ZERO, and the two must not paint alike. A ragged
 * matrix — a cohort that has not reached month 6 yet — is the normal case, not
 * an authoring error, so an absent crossing paints the empty fill and carries no
 * `--mix` at all. Printing 0 there would state a measurement nobody made.
 */

const cart = require('../_chart-family/cartesian');
const { escHtml, plainText, readsHandBody } = require('../_chart-family/transform-utils');
const { extractFirstTable, spliceFirstTable, parseTable } = require('../../../core/html-tables');
const { resolveLabelSet, unboundKeys } = require('../../../core/label-set');
const { liftLabelSet } = require('../../../core/lift-label-set');
const { buildSvgLegend } = require('../_chart-family/svg-legend');
const markDetail = require('../_chart-family/mark-detail');
const {
  wrapSvgLabel, measureLabel, ADVANCE, ADVANCE_HAND_TRACKED,
} = require('../_chart-family/svg-label');

/**
 * How many columns and rows stay readable.
 *
 * NOT the categorical cap. `parseSeries` defaults to 6 series because past six
 * the categorical palette repeats (Wong 2011) — but a heatmap's columns are AXIS
 * POSITIONS on one hue, not palette slots, so that reasoning does not transfer.
 * What binds here is the COLUMN NAME, not the cell. The shared 320-unit box
 * minus the gutters leaves 264 units of plot, so 12 columns is 20.9 units a
 * cell and the name above it gets `cellW + CELL_GAP` = 22.1 at `FS.col` — five
 * characters of the widest glyph before `measureLabel` ellipsizes, which covers
 * the month and week keys a matrix is actually keyed on (`M0`, `Mar`, `2026`)
 * and stops short of a spelled-out name. Ten columns buys exactly one more
 * character (26.5 units, six), which is not worth two columns of data.
 *
 * THE CELL BINDS TOO, and at twelve columns the two constraints land together:
 * 20.9 units of cell is also about the narrowest a two-digit value sets in at
 * `FS.value`, which is what `cellFitsValue` tests per slide. Below that the
 * number is dropped and the intensity carries the cell alone. Rows are capped
 * lower because each one costs vertical space the box has less of.
 */
const MAX_COLS = 12;
const MAX_ROWS = 10;

// Nominal label sizes in viewBox user units, MIRRORING heatmap.styles.css. CSS
// owns what is painted; the kernel needs the same numbers to size the gutters
// the labels sit in. test/unit/components/svg-label-css-mirror.test.js reads the
// stylesheet and fails when the two drift.
const FS = Object.freeze({
  row: 7.5,    // .cart-cat (chart-family.css) — a row name in the left gutter
  col: 7,      // .heatmap-col-label — a column name along the top
  value: 7,    // .heatmap-value — the number printed in a cell
});

// Gutters, user units. `left` holds the row names, `top` the column names.
// `bottom`/`right` are air, not content — a cell must not touch the viewBox.
// `left` is the DEFAULT only: `rowGutterFor` sizes the real one per matrix.
const GUT = Object.freeze({ left: 52, right: 4, top: 16, bottom: 4 });

/**
 * The row-name gutter's range, user units. The name sits `ROW_NAME_PAD` inside it.
 *
 * A fixed 52 wrapped ordinary row names. It leaves 47 units of text, and at `FS.row`
 * "February 2026" needs 59, "September 2026" 63 — so a plain monthly cohort matrix
 * stacked every long month onto two lines while the short ones sat on one, and the
 * row labels read as a ragged column. The gutter now GROWS to the widest name on ONE
 * line, and shrinks for short names so the grid gets the room back.
 *
 * The ceiling is `bar`'s row-gutter ceiling (ROW_GUTTER_MAX, bar.transform.js), the
 * family's answer to "how much of a 320-unit box may a category name take". Past it a
 * name wraps to two lines as before — a sentence-length row name is the author's to
 * shorten, not the grid's to make room for.
 */
const ROW_GUTTER_MIN = 32;
const ROW_GUTTER_MAX = 96;
const ROW_NAME_PAD = 5;

/**
 * The left gutter this matrix gets: the widest row name on one line, clamped — but
 * NEVER at the cost of a cell's number or a column's name.
 *
 * The gutter comes out of the grid, so a wider one narrows every cell. That is a
 * worse trade than a wrap: a row name that wraps is still read in full, while a cell
 * value that stops fitting is DROPPED whole (cellFitsValue) and a column name is
 * ellipsized. So the gutter grows only while every value and column name that prints
 * at the default 52 still prints; past that, the long names wrap. `fits` is the
 * caller's count of what prints at a given gutter, so this function holds no layout.
 */
function rowGutterFor(rows, fits) {
  // measureLabel reports lines, not a width, so a name's one-line width is found the
  // way bar's rowGutterFor finds its own: the narrowest gutter that sets it unbroken.
  const oneLine = (label, left) => {
    const m = measureLabel(label, { width: left - ROW_NAME_PAD, fontSize: FS.row, maxLines: 2 });
    return m.lines.length === 1 && !m.lines[0].endsWith('\u2026');
  };
  let left = ROW_GUTTER_MIN;
  for (const r of rows) {
    if (!r.label) continue;
    while (left < ROW_GUTTER_MAX && !oneLine(r.label, left)) left += 1;
  }
  if (left <= GUT.left) return left;
  const floor = fits(GUT.left);
  while (left > GUT.left && fits(left) < floor) left -= 1;
  return left;
}

/** Space between cells, user units — the grid reads as cells, not as a slab. */
const CELL_GAP = 1.2;

/**
 * A cell's `` `# prose` `` annotation — the detail a reader sees on hover, and
 * the line that folds into the speaker note for print.
 *
 * WHY A SIGIL IN A CODE SPAN RATHER THAN A SECOND VALUE PILL. A table has no
 * sublist channel, which is exactly why `roadmap` scored Tier 3 in the
 * detail-reveal ADR, so the house's nested-bullet idiom is unavailable here and
 * the annotation has to live in the cell. A bare trailing pill was measured and
 * cannot work: the family's `readLeadValue` takes the LAST `<code>` as the value,
 * so a second pill becomes the value, fails `isValuePill`, and the crossing is
 * dropped — and a heatmap paints a dropped crossing as UNMEASURED, so the slide
 * does not merely lose a number, it asserts something false about the data.
 *
 * WHY `#`, AND WHY THE SPACE IS REQUIRED. Measured over 8,448 inline-code spans
 * in 266 shipped decks: 12 begin with `#` — hex colors (`#7DE38A`), issue refs
 * (`#1311`) and decks quoting heading syntax — and exactly ONE begins with `#` +
 * space, in a deck demonstrating heading layout. Requiring the space is what
 * separates an annotation from a color literal an author pasted into a cell.
 *
 * SCOPED TO THE CELL, not registered with `inline-code-directives.js`. The global
 * dispatcher would have to out-guess the pill grammar at every span in every
 * deck; read from a known position it competes with nothing. Same posture as
 * `matrix-grid`, whose `[x]` markers are parsed off the cell's own text.
 */
const CELL_NOTE = /<code>\s*#\s+([\s\S]*?)<\/code>/g;

/**
 * Split one authored cell into its value text and its optional annotation.
 * The annotation is removed from the value text, so `100 \`# why\`` measures and
 * paints exactly as `100` does — an annotated cell and a bare one are the same
 * number.
 */
function readCell(inner) {
  const html = String(inner ?? '');
  CELL_NOTE.lastIndex = 0;
  const notes = [...html.matchAll(CELL_NOTE)];
  // EVERY annotation span comes out, not just the first. A non-global regex left
  // a second `# …` in the value text, where it reached `affixOf` — on a
  // single-column matrix that made the stray note the matrix's common suffix and
  // printed it on every cell. The extra spans join the detail rather than being
  // dropped, so nothing an author wrote disappears.
  const body = notes.reduce((acc, m) => acc.replace(m[0], ''), html);
  return {
    raw: plainText(body).trim(),
    detail: notes.map((m) => plainText(m[1]).trim()).filter(Boolean).join(' '),
  };
}

/**
 * Parse the authored TABLE into a matrix.
 *
 * The table is the notation a matrix actually has: a heatmap's data starts in a
 * spreadsheet or a SQL result, and a table is paste-compatible where the nested
 * list this replaced had to be transcribed by hand, repeating every column name
 * once PER ROW (measured: the 10-by-12 stress matrix is 94 authored lines as a
 * list against 12 as a table).
 *
 * Shape: the header row's first cell is the row-axis name (usually empty, and
 * ignored either way); the rest are the column names. Each body row leads with
 * its row label and carries one value per column.
 *
 * AN EMPTY CELL IS UNMEASURED, NOT ZERO — the distinction the component is built
 * around, and the table states it better than the list did: a crossing nobody
 * measured is a blank cell rather than an omitted bullet a reader has to notice
 * is missing.
 *
 * Returns `null` when there is nothing to draw — the family's contract
 * for "leave the markup alone" rather than an error — so a slide whose table is
 * not a matrix renders as the plain table it is.
 */
function parseHeatmapTable(tableHtml) {
  const { head, rows: bodyRows } = parseTable(tableHtml);
  if (!head.length || !bodyRows.length) return null;

  // The corner cell names the row axis, so the columns start at index 1.
  //
  // EACH COLUMN REMEMBERS WHERE IT SAT, and that is not bookkeeping for its own
  // sake. A first cut filtered the unnamed columns out and then read body cells by
  // the POST-filter position, so a blank header in the middle re-bound every
  // column after it to its neighbour's data and dropped the tail — silently, with
  // nothing in `overflowCols` and nothing in the description. `| X |  | A |  | C |`
  // over `10 20 30 40` painted A with 10 and C with 20. That is the
  // silently-wrong-data failure this component's own docblock promises never
  // happens, so a column now carries the index it was authored at and the body is
  // read by THAT.
  const named = head.slice(1)
    .map((c, at) => ({ name: plainText(c.inner).trim(), at }))
    .filter((c) => c.name);
  if (!named.length) return null;
  const overflowCols = named.slice(MAX_COLS).map((c) => c.name);
  const kept = named.slice(0, MAX_COLS);
  const keptCols = kept.map((c) => c.name);

  const rows = [];
  const overflowRows = [];
  for (const cells of bodyRows) {
    if (!cells.length) continue;
    const label = plainText(cells[0].inner).trim();
    const read = kept.map((c) => (cells[c.at + 1] ? readCell(cells[c.at + 1].inner) : { raw: '', detail: '' }));
    if (!label && read.every((r) => !r.raw)) continue;
    if (rows.length >= MAX_ROWS) { overflowRows.push(label); continue; }
    rows.push({
      label,
      // `null` — not 0 — for a crossing the author left blank. See the docblock:
      // a missing cell and a measured zero are different facts.
      cells: read.map((r) => {
        if (!r.raw) return null;
        const num = cart.parseValue(r.raw);
        if (!Number.isFinite(num)) return null;
        const cell = { raw: r.raw, num };
        if (r.detail) cell.detail = r.detail;
        return cell;
      }),
      detail: [],
    });
  }
  if (!rows.length) return null;

  const values = rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c.num));
  if (!values.length) return null;

  return {
    rows,
    cols: keptCols,
    min: Math.min(...values),
    max: Math.max(...values),
    // The ramp's class boundaries, computed once over the whole matrix — see
    // rampBreaks. Carried on the model rather than recomputed per cell because
    // they are a property of the matrix, not of any one crossing.
    breaks: rampBreaks(values),
    // Reported, never silently truncated — same contract parseSeries used for
    // its own overflow, so a deck that exceeds the grid is told which crossings
    // did not make it rather than quietly losing them.
    overflowCols,
    overflowRows: overflowRows.filter(Boolean),
    affix: cart.affixOf(rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c.raw))),
  };
}

/**
 * The ramp's class boundaries — RAMP_STEPS-1 values, cut at the QUANTILES of the
 * matrix's own numbers rather than at even slices of its range.
 *
 * WHY NOT EQUAL INTERVAL, which this shipped first and which is the obvious
 * encoding: a heatmap's data is usually skewed, and an equal-interval cut then
 * spends most of the ramp on empty range. Measured across every heatmap slide we
 * ship, equal-interval used all five tones on 1 of 8 slides (mean 4.13 of 5);
 * quantile uses all five on 8 of 8. The component's own flagship slide is the
 * worst case and shows why: a retention table's M0 column is 100% BY
 * CONSTRUCTION, so it pins the top of the domain while every value the headline
 * is about clusters low — 15 cells across 4 tones, with step 4 never used at all,
 * `48` and `44` the same color and `62`/`59`/`58`/`57`/`55` all another.
 *
 * THE CONTRAST GUARANTEE IS UNAFFECTED, which is what makes this cheap. The ink
 * is solved per STOP and the stops are fixed mix percentages; which values land
 * in which stop changes no color at all. No theme regeneration, no re-solve.
 *
 * WHAT IT COSTS: tone is no longer linear in value, so a reader cannot infer a
 * magnitude from a shade. That is the classed-choropleth tradeoff and it is the
 * standard default for skewed data. It does NOT cost cross-slide comparability,
 * which is the argument it looks like it should lose to — the domain was already
 * per-slide (`min`/`max` come from each matrix's own values), so a cell at 50 on
 * a 0-100 slide and one at 50 on a 40-60 slide already painted the same tone.
 *
 * A FLAT matrix yields no boundaries at all: every value identical means there is
 * no gradient to cut, so this returns `[]` and `stepFor` takes the middle step
 * rather than reading every cell as the maximum.
 */
function rampBreaks(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length || sorted[0] === sorted[sorted.length - 1]) return [];
  const breaks = [];
  for (let k = 1; k < RAMP_STEPS; k += 1) breaks.push(sorted[Math.floor((k * sorted.length) / RAMP_STEPS)]);
  return breaks;
}

/**
 * Which of the ramp's STEPS a value falls in — 1-based, matching the
 * `--heatmap-stepN` / `--heatmap-stepN-ink` token pairs the theme carries.
 *
 * THE KERNEL QUANTIZES AND NOTHING ELSE. It does not know the step's mix
 * percentage, let alone its color: both live in the theme, because both are
 * per-palette (lib/theme/cat-ink.js § solveHeatmapRamp). That is what keeps this
 * palette-blind (HARD RULE #3) and what keeps a rendered deck theme-swappable —
 * the same HTML has to paint correctly under all 33 palettes, so a color decided
 * here would be wrong the moment the stylesheet changed.
 *
 * WHY STEPS AT ALL, since a continuous ramp is the obvious encoding and was the
 * first cut: a number printed on a continuous fill cannot be kept legible. The
 * measurement, and the dead zone that forces this, are in `solveHeatmapRamp`'s
 * docblock. The short version is that quantizing is what lets each fill carry an
 * ink solved against it, and a continuous ramp has no fills to solve against —
 * it has all of them.
 *
 * A FLAT matrix (every value identical) has no gradient to show, so it takes the
 * middle step rather than dividing by zero and painting everything at the floor.
 */
function stepFor(num, breaks) {
  // No boundaries means no gradient — a flat matrix, or one with no finite value.
  // The middle step is the honest answer: painting everything at the floor would
  // read as "all minimum", and everything at the top as "all maximum".
  if (!Array.isArray(breaks) || !breaks.length || !Number.isFinite(num)) {
    return Math.ceil(RAMP_STEPS / 2);
  }
  let step = 1;
  for (let i = 0; i < breaks.length; i += 1) if (num >= breaks[i]) step += 1;
  // CLAMPED, and the clamp is a contract guard rather than a live bug: with
  // RAMP_STEPS-1 boundaries the count cannot leave 1..RAMP_STEPS. Four places
  // (the stylesheet's five rule pairs, the generator's five token pairs, the
  // print band's remap, the tests) assume `data-step` is an integer in that
  // range, and a step outside it matches no rule — `--mix` is never set,
  // `color-mix()` is invalid at computed-value time, and the cell paints the
  // inherited BLACK. Measured on the equal-interval version this replaced, an
  // out-of-range step put a value at 1.83:1 on a solid black cell. So the range
  // holds unconditionally rather than by argument about the caller.
  return Math.max(1, Math.min(RAMP_STEPS, step));
}

/**
 * The ramp's bottom and top, as color-mix percentages of the hue over the
 * neutral anchor.
 *
 * THE FLOOR IS NOT COSMETIC. At 0% the matrix minimum paints the bare anchor —
 * the same fill as a crossing nobody measured, which is the one distinction the
 * parse step works to keep. 18% is where the lowest real cell separates from the
 * empty cell on BOTH canvases; an earlier 8% looked fine on light and collapsed
 * on dark, where the anchor and the first stop were a rounding error apart.
 */
const MIX_FLOOR = 18;
const MIX_TOP = 92;

/**
 * How many stops the ramp has.
 *
 * MIRRORED, not owned: `tools/derive-chart-cat-ink.js` writes exactly this many
 * `--heatmap-stepN` / `--heatmap-stepN-ink` pairs into every palette, and
 * heatmap.styles.css maps exactly this many `[data-step]` rules onto them.
 * test/unit/components/heatmap.test.js fails when the three drift.
 *
 * FIVE, which is the classed-choropleth default for the same reason it applies
 * here: enough stops that a cliff or a diagonal reads across the grid, few enough
 * that a reader can tell two adjacent cells apart without consulting a legend.
 * Four through eight all solve on every shipped palette; five is the pick.
 */
const RAMP_STEPS = 5;

/**
 * THE VALUE IS PRINTED IN THE CELL, and the ramp is quantized so that it can be.
 *
 * The family's rule is that labels and values sit on the canvas, never on the
 * colored mark — "so contrast is never at the mercy of a narrow band or a fill
 * ramp" (design/skills/chart-component.md). A heatmap is the member that has to
 * break it: intensity IS the encoding, and a reader who wants to know whether a
 * cell is 44 or 48 cannot get it from a tint. So the ramp is built to remove the
 * mercy rather than to ask for an exception.
 *
 * THE FIRST CUT ASKED FOR THE EXCEPTION AND FAILED. It printed the number on a
 * CONTINUOUS ramp and flipped its ink black/white at one crossover, derived on
 * one palette. Measured across all 33 palettes on both canvases:
 *
 *   - One crossover leaves 318 cells below AA, worst 2.60:1.
 *   - A per-palette crossover reaches zero failures but CANNOT BE EXPRESSED: it
 *     is a NUMBER, `section.dark` flips `color-scheme` per slide, and CSS has
 *     `light-dark()` for colors only.
 *   - Narrowing the ramp until one ink always works needs MIX_TOP at 53 against
 *     92 — rendered and looked at, `100` and `44` are the same mauve on
 *     `concrete`. That spends the primary encoding to protect the secondary one.
 *   - `--cat-on-fill` / `--cat-on-mark` are solved per palette, but against the
 *     flat `cat-N` surfaces rather than this ramp: 1012 failures.
 *
 * QUANTIZING IS WHAT SOLVES IT, and it solves both halves at once. Five chosen
 * stops instead of a continuum means (a) the per-palette knowledge becomes a
 * COLOR, which `light-dark()` carries, and (b) there are only five fills to
 * solve an ink against — and we get to choose which five. That second half is
 * the load-bearing one: there is a dead zone where black and white are equally
 * weak and the best ink of ANY color reaches about 4.6:1. A continuous ramp
 * climbs through every lightness, so it always crosses it; banding the ink over
 * a continuous fill leaves 58-73 bands under the floor at EVERY band count from
 * 3 to 12. Discrete stops step over it. Measured on the shipped set: 4 of 95
 * stops need a nudge, none by more than 2%, every palette solves, and the ramp
 * stays monotonic. (4 of 95: 19 base palettes x 5 stops. The print band is a
 * sixth ramp on top of that, solved separately — see base.modifiers.css § PRINT
 * BAND.)
 *
 * THE GUARANTEE IS A FLOOR, NOT A CUSHION, and an earlier draft of this line said
 * otherwise: it claimed a median of 7.44:1 across the 190 shipped pairs. Measured,
 * the median is 4.68:1 and 91% of pairs sit below 7.44 — because `solveInk` binary-
 * searches until it clears AA + MARGIN and STOPS, so by construction almost every
 * pair lands within a whisker of 4.65. That is the design working, but "worst 4.65,
 * median 7.44" reads as one hairline case in a comfortable spread, which is the
 * opposite of the truth. Re-derive with `rampContrastFailures` over `rampPalettes()`,
 * collecting the ratios rather than only the failures.
 *
 * WHERE EACH PIECE LIVES. The recipe is `solveHeatmapRamp` (lib/theme/cat-ink.js,
 * shared with the Studio's generator, HARD RULE #1); the per-palette values are
 * written into themes/*.css by tools/derive-chart-cat-ink.js and gated by its
 * `--check` inside build:check; this kernel only says which STEP a value is in.
 */
/**
 * Whether this cell's own formatted value can be PRINTED WHOLE.
 *
 * PER CELL, AND ON THE TEXT — not on the geometry, which is the mistake the
 * first cut made and which no gate caught. It tested `cellW >= 18 && cellH >= 12`,
 * and those are unreachable: the shared 320-unit box gives 20.90 units of cell at
 * MAX_COLS and 14.92 at MAX_ROWS, on every orientation, so the guard returned
 * true always and was dead code advertising itself as a guard.
 *
 * What it was supposed to stop happened anyway, one layer down. `buildValueLabel`
 * wraps at `maxLines: 1` and ELLIPSIZES what does not fit, reporting nothing — so
 * a twelve-column grid of seven-digit values printed `123…` in every cell. A
 * truncated number is worse than an absent one: `123…` still reads as a number,
 * and a reader has no way to know it is not the value. The intensity is already
 * carrying the reading, and the whole number is in the `<desc>`.
 *
 * So the question is the text's, per cell: does THIS string set whole at
 * `FS.value` in THIS cell. Measured with the substrate's own `measureLabel`, so
 * the answer comes from the same advance table that would do the truncating.
 *
 * THE ADVANCE IS THE PAINTED FACE'S, which the first cut got wrong. It took
 * `measureLabel`'s default — the flat 0.6 calibrated on the clean face — while
 * `.heatmap-value` sets `var(--font-body)`, and `mode: sketch` re-points that at
 * a hand face that sets about 50% wider. Measured at 11 columns with five-digit
 * values: the guard estimated 21.0 units into a 22.91-unit cell and said yes;
 * the painted run came back 24.88 and adjacent values OVERLAPPED by 0.77 units.
 * Neither dropped nor truncated — overrun, which is the one outcome this
 * function exists to make impossible.
 *
 * AND THE PREDICATE IS `readsHandBody`, NOT `includes('sketch')`, which the
 * SECOND cut got wrong in the other direction. `mode: sketch-clean` resolves to
 * `sketch sketch-clean-body`, and that token puts `--font-body` BACK on the clean
 * face while the headings stay hand-drawn. A `sketch` substring test therefore
 * measures the hand advance against clean glyphs — 50% too wide, so the guard
 * refuses, and because cell width is uniform it refuses for EVERY cell at once:
 * measured, a 12-column grid of four-digit values loses all 72 of its printed
 * numbers, silently, with the `<desc>` carrying only one peak per row. The family
 * already owns this predicate in `transform-utils`, put there when the inversion
 * lens caught quadrant and radar making the same mistake, and its docblock states
 * the rule this broke: ask which TOKEN a rule names, never which mode looks
 * hand-drawn. `gantt` reads the face off the slide for its tick advance for the
 * same reason; this now does the same, through the shared predicate.
 *
 * NO VERTICAL ARM. The first cut carried `cellH < FS.value * 1.6` — 11.2 units
 * against a minimum `cellH` of 14.92 at MAX_ROWS, on every orientation the
 * engine offers. Unreachable: the same dead-guard defect this function was
 * written to replace, at a LOOSER bound than the 12 it replaced. A guard that
 * cannot fire is worse than none, because it reads as protection. Height is
 * bounded by MAX_ROWS, which is where that constraint actually lives.
 */
function cellFitsValue(text, cellW, advance) {
  const m = measureLabel(text, { width: cellW, fontSize: FS.value, maxLines: 1, advance });
  return m.lines.length === 1 && m.lines[0] === text;
}

function buildHeatmap(model, ctx = {}) {
  const view = cart.viewFor(ctx.orientation);
  const { rows, cols } = model;
  // The advance of the face `.heatmap-value` will actually paint. Read once, off
  // the slide, so the fit math and the painted glyphs cannot desync — the seam
  // gantt's own tick advance documents.
  const advance = readsHandBody(ctx.classTokens || []) ? ADVANCE_HAND_TRACKED : ADVANCE;
  const fmtFit = cart.markFormatter({ affix: model.affix, sig: 3 });
  // What prints at a given left gutter: every cell value that sets in its cell, and
  // every column name that sets without an ellipsis. rowGutterFor spends gutter only
  // while this does not fall.
  const printsAt = (left) => {
    const w = cart.plotBox({ view, gutter: { ...GUT, left } }).w;
    const cw = (w - CELL_GAP * (cols.length - 1)) / cols.length;
    let n = 0;
    for (const c of cols) {
      const m = measureLabel(c, { width: cw + CELL_GAP, fontSize: FS.col, maxLines: 1 });
      if (!m.lines.some((l) => l.endsWith('\u2026'))) n++;
    }
    for (const r of rows) for (const cell of r.cells) if (cell && cellFitsValue(fmtFit(cell.num), cw, advance)) n++;
    return n;
  };
  const plot = cart.plotBox({ view, gutter: { ...GUT, left: rowGutterFor(rows, printsAt) } });
  // The formatter is needed BEFORE the plot is sized when a key is present, so
  // the band labels exist to measure. Built once and shared with the cells below.
  const fmtEarly = cart.markFormatter({ affix: model.affix, sig: 3 });
  const derived = model.bands ? deriveBands(model, fmtEarly) : null;
  const bands = derived ? resolveLabelSet(derived, model.bands) : null;
  // A step the author named that no cell reaches is DROPPED from the key — it
  // would paint a swatch for a tone nowhere on the slide. Dropping it silently is
  // what `label-set.js` explicitly disclaims, and it bit the first demo deck:
  // five severities were authored over a matrix whose quantiles used four steps,
  // one name vanished, and nothing said so. The ramp is cut per matrix, so an
  // author CANNOT predict this from the data alone — they have to be told.
  const unbound = derived ? unboundKeys(derived, model.bands) : [];

  // With a key, the grid gives up the rail it sits in. `buildSvgLegend` takes
  // the diagram's right edge and hands back the widened viewBox plus the offset
  // the diagram shifts by, so the two are laid out as one unit and a band swatch
  // can never drift from the row it keys.
  const key = bands ? buildBandKey(bands, plot.x1, view.h, ctx.orientation) : null;
  const cellW = (plot.w - CELL_GAP * (cols.length - 1)) / cols.length;
  const cellH = (plot.h - CELL_GAP * (rows.length - 1)) / rows.length;

  // Two consumers now: the printed value and the `<desc>`. One formatter, so the
  // number a reader sees and the number a screen reader hears cannot disagree.
  const fmt = cart.markFormatter({ affix: model.affix, sig: 3 });
  const parts = [];

  // Column names along the TOP, not the bottom: a reader scans a matrix from
  // its top-left, and a column head printed below its column is read after the
  // data it labels.
  //
  // EMITTED DIRECTLY rather than through `buildCategoryLabels`, and the reason
  // is worth stating so nobody "simplifies" it back. That helper places an
  // x-axis label at `plot.y1 + gap` with `vAlign: 'hanging'`, i.e. hanging
  // DOWNWARD from below the plot — the only way to reach the top with it is a
  // negative gap of `-(plot.h + a line height)`, which is arithmetic that
  // happens to land rather than a placement anyone can read. `wrapSvgLabel` is
  // the same emitter the helper calls, so the wrapping and the ellipsis
  // behavior are identical; only the geometry is honest.
  cols.forEach((label, i) => {
    parts.push(wrapSvgLabel(label, {
      x: round(plot.x0 + i * (cellW + CELL_GAP) + cellW / 2),
      y: round(plot.y0 - 3),
      width: cellW + CELL_GAP,
      fontSize: FS.col,
      anchor: 'middle',
      vAlign: 'bottom',
      maxLines: 1,
      className: 'heatmap-col-label cart-cat',
      attrs: ' data-anima-role="label"',
      emitFontSize: false,
    }).svg);
  });

  // Row names in the left gutter. `pitch` is passed because the substrate's own
  // docblock is explicit that without it a long row name is CULLED rather than
  // ellipsized — and a dropped row name is invisible data loss, which the
  // family's census (chart-label-drop-census.test.js) holds the line on.
  parts.push(cart.buildCategoryLabels({
    plot,
    labels: rows.map((r) => r.label),
    center: (i) => plot.y0 + i * (cellH + CELL_GAP) + cellH / 2,
    width: plot.gutter.left - ROW_NAME_PAD,
    maxLines: 2,
    axis: 'y',
    pitch: cellH + CELL_GAP,
  }));

  rows.forEach((row, ri) => {
    const y = plot.y0 + ri * (cellH + CELL_GAP);
    row.cells.forEach((cell, ci) => {
      const x = plot.x0 + ci * (cellW + CELL_GAP);
      const geom = `x="${round(x)}" y="${round(y)}" width="${round(cellW)}" height="${round(cellH)}"`;
      if (!cell) {
        // The empty fill, carrying NO --mix. See the docblock: an unwritten
        // crossing is not a zero and must not read as the bottom of the ramp.
        parts.push(`<rect class="heatmap-cell heatmap-cell--empty" ${geom}/>`);
        return;
      }
      const step = stepFor(cell.num, model.breaks);
      parts.push(
        `<rect class="heatmap-cell" data-anima-role="region" data-step="${step}"`
        + ` data-mark="${ri * cols.length + ci}" data-label="${escAttr(`${row.label} · ${cols[ci]}`)}"`
        + ` data-value="${escAttr(cell.raw)}" ${geom}/>`,
      );
      // Per CELL, on the formatted string — see cellFitsValue. A value that would
      // ellipsize is dropped whole rather than printed as a misleading stub.
      const shown = fmt(cell.num);
      if (cellFitsValue(shown, cellW, advance)) {
        // `data-step` again, on the TEXT this time: the cell carries it to pick a
        // fill, the label to pick the ink solved against that fill. One attribute,
        // two rules, no third place for them to disagree.
        parts.push(cart.buildValueLabel(shown, {
          x: x + cellW / 2,
          y: y + cellH / 2,
          anchor: 'middle',
          vAlign: 'middle',
          className: 'heatmap-value',
          fontSize: FS.value,
          width: cellW,
          extra: ` data-step="${step}"`,
        }));
      }
    });
  });

  if (!key) {
    return cart.buildSvgRoot({
      view,
      className: 'cart-svg heatmap-svg',
      title: 'Heatmap',
      desc: describe(model, fmt, bands, unbound),
      body: parts.join(''),
    });
  }
  return cart.buildSvgRoot({
    view: { w: key.viewW, h: key.viewH },
    className: 'cart-svg heatmap-svg',
    title: 'Heatmap',
    desc: describe(model, fmt, bands, unbound),
    defs: key.defs,
    body: `<g transform="translate(${key.diagramDx} ${key.diagramDy})">${parts.join('')}</g>${key.body}`,
  });
}

/**
 * The accessible description — the ONLY route to this chart's data, now that
 * the marks are `aria-hidden` (cartesian.js § ariaHiddenMarks).
 *
 * It states the RELATIONSHIP a heatmap exists to show — where the value
 * concentrates — rather than reciting every crossing. A 10x12 matrix is 120
 * numbers, and a reader made to hear all of them has been handed the raw data
 * instead of the finding. Each row is summarized by its own peak, and the
 * matrix's high and low corners are named outright.
 *
 * AND IT NAMES WHAT THE CAP CUT. `parseHeatmap` fills `overflowCols`/`overflowRows`
 * under a docblock promising the author is "told which crossings did not make it
 * rather than quietly losing them" — and for one commit NOTHING READ THEM. Not
 * this function, not the markup, not the CLI: a 14-column deck lost two columns of
 * authored data with no signal anywhere, in the component whose own PR opens on a
 * chart silently deleting an author's data. `bar` and `line` already had the
 * sentence ("Not shown, past the six-series limit: …"); this is the same sentence
 * for the two axes a matrix can overflow on.
 */
function describe(model, fmt, bands, unbound) {
  const { rows, cols } = model;
  const lines = rows.map((r) => {
    const best = r.cells.reduce((acc, c, i) => (c && (!acc || c.num > acc.c.num) ? { c, i } : acc), null);
    if (!best) return `${r.label}: no values`;
    return `${r.label} peaks at ${cols[best.i]}, ${fmt(best.c.num)}`;
  });
  const missing = rows.reduce((n, r) => n + r.cells.filter((c) => !c).length, 0);
  const gap = missing
    ? ` ${missing} crossing${missing === 1 ? ' carries' : 's carry'} no value.`
    : '';
  const cut = [];
  if (model.overflowCols?.length) cut.push(`columns ${model.overflowCols.join(', ')}`);
  if (model.overflowRows?.length) cut.push(`rows ${model.overflowRows.join(', ')}`);
  const over = cut.length ? ` Not shown, past the grid's ${MAX_ROWS}-by-${MAX_COLS} limit: ${cut.join('; ')}.` : '';
  // A key a reader cannot SEE still has to reach them: the bands are named in
  // the description or the legend is decoration for sighted readers only.
  const scale = bands?.length
    ? ` Bands: ${bands.map((b) => b.label).join('; ')}.`
    : '';
  const lost = unbound?.length
    ? ` Named but unused, so not keyed: step${unbound.length === 1 ? '' : 's'} ${unbound.join(', ')}.`
    : '';
  return `${rows.length} rows by ${cols.length} columns, `
    + `${fmt(model.min)} to ${fmt(model.max)}. ${lines.join('; ')}.${gap}${over}${scale}${lost}`;
}

/**
 * The set of bands, named by the chart itself — the DERIVED label set.
 *
 * WHY A VALUE RANGE AND NOT A WORD. Naming the stops hot/warm/cold is the
 * obvious default and it is wrong here three times over. The ramp has FIVE
 * stops, not three. Polarity is unknowable — high retention is good, high churn
 * is bad, and the same component serves both — so "hot" asserts a reading the
 * kernel cannot derive. And the bands are QUANTILE-cut per matrix (`rampBreaks`),
 * so a word names different numbers on every slide while a range does not lie
 * about that. A range also answers the one question the printed cell values
 * cannot: why are these two cells the same color?
 *
 * Words stay available — that is what the author's set is for; this is only the
 * spine it merges onto.
 *
 * The boundaries are LOWER-INCLUSIVE, matching `stepFor` (`num >= breaks[i]`
 * advances a step), so the ends read `<` and the interior reads as a span.
 *
 * A FLAT matrix has no boundaries at all, so it has one band and no range to
 * print — `stepFor` puts every cell on the middle step, and the honest label is
 * the single value every cell carries.
 */
function deriveBands(model, fmt) {
  const { breaks } = model;
  const values = model.rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c.num));
  if (!values.length) return [];

  // THE LABEL IS THE VALUES THE BAND ACTUALLY HOLDS, not its cut boundaries, and
  // that is a correctness fix rather than a nicety. The boundaries are half-open
  // — `stepFor` advances on `num >= breaks[i]` — so printing `breaks[i-1]–breaks[i]`
  // as a closed range puts the upper boundary in the label of the band BELOW the
  // one that paints it. On the shipped gallery slide that read "41–48" for band 1
  // while the cell showing 48 painted band 2, and "69–100" for band 4 while 100
  // painted band 5. For a key whose whole purpose is "why are these two cells the
  // same color?", answering with a range the reader can see contradicted on the
  // slide is worse than no key.
  //
  // Reading the extremes off the cells removes the ambiguity instead of papering
  // over it: every number in the label is a number actually on the slide, and a
  // band nobody's data reaches simply does not appear (the rule `roadmap`'s status
  // key already follows — one chip per state ACTUALLY present).
  const seen = new Map();
  for (const num of values) {
    const step = stepFor(num, breaks);
    const band = seen.get(step);
    if (!band) seen.set(step, { lo: num, hi: num });
    else { if (num < band.lo) band.lo = num; if (num > band.hi) band.hi = num; }
  }

  return Array.from({ length: RAMP_STEPS }, (_, i) => i + 1)
    .filter((n) => seen.has(n))
    .map((n) => {
      const { lo, hi } = seen.get(n);
      // A band holding one distinct value names it once rather than as a range
      // against itself — the case a flat or narrow matrix reaches constantly.
      // A NEGATIVE bound switches the separator to a word: an en-dash between
      // signed numbers reads as `−10–−5`, where the range dash and the minus are
      // the same stroke twice. A delta or variance matrix is an ordinary use.
      const a = fmt(lo);
      const b = fmt(hi);
      const label = a === b ? a : `${a}${lo < 0 || hi < 0 ? ' to ' : '–'}${b}`;
      return { key: String(n), label };
    });
}

/**
 * The key beside the grid: one row per ramp band, in ramp order.
 *
 * THE SWATCH CARRIES A CLASS, NOT A FILL, and that is the whole reason
 * `buildSvgLegend` grew a `swatchClass`. A heatmap cell's color is computed in
 * CSS — `color-mix()` driven by `--mix`, selected on `[data-step]` — so there is
 * no single value the kernel could put in a `fill` attribute, and resolving one
 * here would put color in the kernel and break theme-swapping (HARD RULE #3).
 * Handing the swatch the cell's own class and step makes it inherit the very
 * rule its cells paint by, so the key cannot drift from the grid it keys.
 */
function buildBandKey(bands, diagramRight, diagramHeight, orientation) {
  return buildSvgLegend({
    rows: bands.map((b) => ({
      swatchClass: 'heatmap-cell',
      swatchAttrs: ` data-step="${b.key}"`,
      label: b.label,
    })),
    diagramRight,
    diagramHeight,
    hasValues: false,
    orientation,
    // The bands are short numeric ranges, so the key is centered by what they
    // actually ink rather than by the category-name column the kernel reserves.
    fitLabels: true,
  });
}

const round = (n) => Math.round(n * 100) / 100;
const escAttr = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The marks a detail-carrying cell contributes, in `data-mark` order.
 *
 * `data-mark` is assigned over the WHOLE grid, row-major and including the
 * crossings nobody measured, because that is the index the rendered `<rect>`
 * carries — the reveal layer looks a template up by it, so the two have to be
 * counted the same way. An unmeasured crossing takes its index and carries no
 * detail, which `detailPayload` emits as nothing.
 */
function cellMarks(model) {
  const marks = [];
  for (const row of model.rows) {
    model.cols.forEach((col, i) => {
      const cell = row.cells[i];
      marks.push(cell?.detail
        ? { label: `${row.label} · ${col}`, valueRaw: cell.raw, detail: cell.detail }
        : {});
    });
  }
  return marks;
}

/**
 * The same marks with the detail escaped AND wrapped in an `<li>`, for the
 * MARKUP surface only.
 *
 * THE `<li>` IS THE FAMILY'S CONTRACT, not decoration. The reveal layer reads a
 * mark's card out of the template with
 * `tpl.content.querySelectorAll('li')` (docs/src/playground/chart-interact.js
 * `reveal()`): the first `<li>` is the card's body, the rest join as its meta. A
 * template holding bare text yields ZERO list items, so `body` and `meta` both
 * come back empty — and an empty body is exactly what that layer reads as `lean`,
 * the compact value-only tooltip a mark with no authored detail gets. The
 * annotation does not error, it silently DISAPPEARS on every live surface while
 * still reading correctly in the PDF, because `detailNote` has its own
 * bare-text fallback and never needed the wrapper.
 *
 * Every other member already hands `detailPayload` a run of `<li>`s, by one of two
 * routes: most (funnel, map, quadrant, radar, scatter, gantt, bullet, waterfall) lift
 * the inner HTML of an authored sublist through `markDetail.splitDetail`, where the
 * `<li>`s come free; five more (bar, line, stacked-bar, slope, state-chart) build the
 * `<li>` string themselves. Either way the shape arrives. A heatmap cell has neither —
 * a table cell cannot nest a sublist — so this is where it is put back. (An earlier
 * draft of this note said every member lifts a sublist, which is the right conclusion
 * from the wrong mechanism; the heatmap was still the only bare-text caller.)
 *
 * `detailPayload` interpolates `detail` straight into markup, which is right for
 * every other member — pie, map, quadrant, radar and the rest hand it an authored
 * sublist that markdown-it already rendered, where `<` is still `&lt;`. A heatmap
 * cell does not come through that path: `readCell` runs `plainText`, which DECODES
 * entities back to raw characters so the note reads as prose. Handing the decoded
 * string on unescaped made an annotation a live HTML sink — an authored
 * `` `# </template><img src=x onerror=…>` `` escaped its template and executed in
 * the exported .html (proved in a real browser: document.title became PWNED).
 *
 * THE NOTE KEEPS THE RAW TEXT, and the split is the point. `detailNote` flattens
 * tags and then decodes entities, so handing it pre-escaped text would put the raw
 * markup back into the comment it builds. That comment is inert today — it is a
 * comment, and notes-core escapes it again when it lifts it into the slide's
 * `<aside>` (measured) — but relying on two downstream behaviors to keep a sink
 * closed is how the first version of this got it wrong. Escaping exactly at the
 * surface that needs it leaves neither path depending on the other.
 */
function markupMarks(marks) {
  return marks.map((m) => (m.detail ? { ...m, detail: `<li>${escHtml(m.detail)}</li>` } : m));
}

function transformSection(html, ctx) {
  const c = ctx || {};
  // DECIDE BEFORE TOUCHING THE MARKUP. Lifting the author's set first and then
  // discovering there is no matrix to draw deleted a paragraph off a slide that
  // rendered no heatmap at all — content loss, against the family's "leave the
  // markup alone" pass-through contract. So the table is parsed against the
  // ORIGINAL html, and nothing is removed until a chart is certain.
  const ext = extractFirstTable(html);
  if (!ext) return html;
  if (!parseHeatmapTable(ext.full)) return html;

  // The key is OPT-IN, and deliberately so: every shipped heatmap was composed
  // without a rail, the printed cell values already carry magnitude, and a key
  // costs about a quarter of the grid's width. An author asks for it either by
  // naming the bands (an inline set) or by adding the `scale` token to get the
  // derived ranges.
  const lifted = liftLabelSet(html);
  const wants = !!lifted.set || (c.classTokens || []).includes('scale');
  return spliceFirstTable(lifted.set ? lifted.html : html, (found) => {
    const model = parseHeatmapTable(found.full);
    if (!model) return null;
    if (wants) model.bands = lifted.set || [];
    // One authored annotation, two surfaces, from one source (mark-detail.js):
    // an inert <template> the reveal layer shows on hover, and the slide's
    // speaker note so the static PDF keeps the same words. Both empty when no
    // cell carries an annotation, so an un-annotated heatmap is byte-identical.
    const marks = cellMarks(model);
    const payload = markDetail.detailPayload(markupMarks(marks));
    const note = markDetail.detailNote(marks);
    return `<div class="heatmap-figure">${buildHeatmap(model, c)}${payload}</div>${note}`;
  });
}

module.exports = {
  transformSection, parseHeatmapTable, readCell, buildHeatmap, stepFor, rampBreaks,
  deriveBands, liftLabelSet, cellMarks, markupMarks,
  FS, GUT, CELL_GAP, MAX_COLS, MAX_ROWS, MIX_FLOOR, MIX_TOP, RAMP_STEPS,
};
