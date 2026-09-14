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
 * AUTHORED AS THE FAMILY'S NESTED LIST, unchanged: a top-level `<li>` is a ROW,
 * each nested `<li>` is a COLUMN and its value. That is the same two-depth shape
 * `radar` and the Cartesian members read, so `parseSeries` from the substrate
 * does the parsing (HARD RULE #1) — rows arrive as `groups`, columns as
 * `series`, and the magnitude-suffix and affix handling come free.
 *
 *   <!-- _class: heatmap -->
 *
 *   `Retention · 2026 cohorts`
 *   ## Retention decays fastest in month two.
 *
 *   - Jan 2026
 *     - M0 `100`
 *     - M1 `62`
 *     - M2 `48`
 *   - Feb 2026
 *     - M0 `100`
 *     - M1 `58`
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
const { spliceFirstList } = require('../_chart-family/transform-utils');
const { wrapSvgLabel, measureLabel } = require('../_chart-family/svg-label');

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
 * Parse the authored list into a matrix.
 *
 * Returns `null` when there is nothing to draw, which is the family's contract
 * for "leave the markup alone" rather than an error.
 */
function parseHeatmap(ulInner) {
  const parsed = cart.parseSeries(ulInner, { maxSeries: MAX_COLS });
  if (!parsed) return null;

  // A FLAT list is not a matrix. One row of numbers is a bar chart wearing a
  // grid, and painting it as one row of cells invites the reader to compare
  // intensities where a length would have been read exactly. Decline it.
  if (parsed.flat) return null;

  const cols = parsed.series;
  if (!cols.length) return null;

  const rows = parsed.groups.slice(0, MAX_ROWS).map((g) => {
    const byCol = new Map();
    for (const p of g.points) {
      // Last write wins, deliberately: a repeated crossing is an authoring
      // slip, and averaging two values invents a number nobody wrote.
      if (cols.includes(p.series)) byCol.set(p.series, p);
    }
    return {
      label: g.label,
      detail: g.detail,
      // `null` — not 0 — for a crossing the author did not write. See the
      // docblock: a missing cell and a measured zero are different facts.
      cells: cols.map((c) => {
        const p = byCol.get(c);
        return p && Number.isFinite(p.num) ? { raw: p.raw, num: p.num } : null;
      }),
    };
  }).filter((r) => r.label || r.cells.some(Boolean));

  if (!rows.length) return null;

  const values = rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c.num));
  if (!values.length) return null;

  return {
    rows,
    cols,
    min: Math.min(...values),
    max: Math.max(...values),
    // Reported, never silently truncated — same contract parseSeries uses for
    // its own overflow, so a deck that exceeds the grid is told which crossings
    // did not make it rather than quietly losing them.
    overflowCols: parsed.seriesOverflow || [],
    overflowRows: parsed.groups.slice(MAX_ROWS).map((g) => g.label),
    affix: parsed.affix || {},
  };
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
function stepFor(num, min, max) {
  if (!(max > min)) return Math.ceil(RAMP_STEPS / 2);
  const t = (num - min) / (max - min);
  // `min(RAMP_STEPS, …)` because t === 1 at the matrix maximum would otherwise
  // index one past the top step.
  return Math.min(RAMP_STEPS, Math.floor(t * RAMP_STEPS) + 1);
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
 * stops need a nudge, none by more than 2%, every palette solves, the ramp stays
 * monotonic, and the worst pair is 4.65:1 with a median of 7.44:1. (4 of 95: 19
 * base palettes x 5 stops. The print band is a sixth ramp on top of that, solved
 * separately — see base.modifiers.css § PRINT BAND.)
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
 */
function cellFitsValue(text, cellW, cellH) {
  if (cellH < FS.value * 1.6) return false; // no vertical room for the face at all
  const m = measureLabel(text, { width: cellW, fontSize: FS.value, maxLines: 1 });
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
      const step = stepFor(cell.num, model.min, model.max);
      parts.push(
        `<rect class="heatmap-cell" data-anima-role="region" data-step="${step}"`
        + ` data-mark="${ri * cols.length + ci}" data-label="${escAttr(`${row.label} · ${cols[ci]}`)}"`
        + ` data-value="${escAttr(cell.raw)}" ${geom}/>`,
      );
      // Per CELL, on the formatted string — see cellFitsValue. A value that would
      // ellipsize is dropped whole rather than printed as a misleading stub.
      const shown = fmt(cell.num);
      if (cellFitsValue(shown, cellW, cellH)) {
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
  return `${rows.length} rows by ${cols.length} columns, `
    + `${fmt(model.min)} to ${fmt(model.max)}. ${lines.join('; ')}.${gap}`;
}

const round = (n) => Math.round(n * 100) / 100;
const escAttr = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseHeatmap(ext.inner);
    return model ? `<div class="heatmap-figure">${buildHeatmap(model, ctx || {})}</div>` : null;
  });
}

module.exports = {
  transformSection, parseHeatmap, buildHeatmap, stepFor,
  FS, GUT, CELL_GAP, MAX_COLS, MAX_ROWS, MIX_FLOOR, MIX_TOP, RAMP_STEPS,
};
