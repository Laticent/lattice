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
const { plainText, readsHandBody } = require('../_chart-family/transform-utils');
const { spliceFirstTable, parseTable } = require('../../../core/html-tables');
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
const GUT = Object.freeze({ left: 52, right: 4, top: 16, bottom: 4 });

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
const CELL_NOTE = /<code>\s*#\s+([\s\S]*?)<\/code>/;

/**
 * Split one authored cell into its value text and its optional annotation.
 * The annotation is removed from the value text, so `100 \`# why\`` measures and
 * paints exactly as `100` does — an annotated cell and a bare one are the same
 * number.
 */
function readCell(inner) {
  const html = String(inner ?? '');
  const note = html.match(CELL_NOTE);
  const body = note ? html.replace(note[0], '') : html;
  return { raw: plainText(body).trim(), detail: note ? plainText(note[1]).trim() : '' };
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
 * Returns `null` when there is nothing to draw, which is the family's contract
 * for "leave the markup alone" rather than an error — so a slide whose table is
 * not a matrix renders as the plain table it is.
 */
function parseHeatmapTable(tableHtml) {
  const { head, rows: bodyRows } = parseTable(tableHtml);
  if (!head.length || !bodyRows.length) return null;

  // The corner cell names the row axis, so the columns start at index 1.
  const cols = head.slice(1).map((c) => plainText(c.inner).trim()).filter(Boolean);
  if (!cols.length) return null;
  const overflowCols = cols.slice(MAX_COLS);
  const keptCols = cols.slice(0, MAX_COLS);

  const rows = [];
  const overflowRows = [];
  for (const cells of bodyRows) {
    if (!cells.length) continue;
    const label = plainText(cells[0].inner).trim();
    const read = keptCols.map((_, i) => (cells[i + 1] ? readCell(cells[i + 1].inner) : { raw: '', detail: '' }));
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
  const plot = cart.plotBox({ view, gutter: GUT });
  const { rows, cols } = model;

  const cellW = (plot.w - CELL_GAP * (cols.length - 1)) / cols.length;
  const cellH = (plot.h - CELL_GAP * (rows.length - 1)) / rows.length;

  // Two consumers now: the printed value and the `<desc>`. One formatter, so the
  // number a reader sees and the number a screen reader hears cannot disagree.
  const fmt = cart.markFormatter({ affix: model.affix, sig: 3 });
  // The advance of the face `.heatmap-value` will actually paint. Read once, off
  // the slide, so the fit math and the painted glyphs cannot desync — the seam
  // gantt's own tick advance documents.
  const advance = readsHandBody(ctx.classTokens || []) ? ADVANCE_HAND_TRACKED : ADVANCE;


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
    width: GUT.left - 5,
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

  return cart.buildSvgRoot({
    view,
    className: 'cart-svg heatmap-svg',
    title: 'Heatmap',
    desc: describe(model, fmt),
    body: parts.join(''),
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
function describe(model, fmt) {
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
  return `${rows.length} rows by ${cols.length} columns, `
    + `${fmt(model.min)} to ${fmt(model.max)}. ${lines.join('; ')}.${gap}${over}`;
}

const round = (n) => Math.round(n * 100) / 100;
const escAttr = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function transformSection(html, ctx) {
  return spliceFirstTable(html, (ext) => {
    const model = parseHeatmapTable(ext.full);
    return model ? `<div class="heatmap-figure">${buildHeatmap(model, ctx || {})}</div>` : null;
  });
}

module.exports = {
  transformSection, parseHeatmapTable, readCell, buildHeatmap, stepFor, rampBreaks,
  FS, GUT, CELL_GAP, MAX_COLS, MAX_ROWS, MIX_FLOOR, MIX_TOP, RAMP_STEPS,
};
