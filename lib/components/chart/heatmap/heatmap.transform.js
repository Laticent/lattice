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
const { wrapSvgLabel } = require('../_chart-family/svg-label');

/**
 * How many columns and rows stay readable.
 *
 * NOT the categorical cap. `parseSeries` defaults to 6 series because past six
 * the categorical palette repeats (Wong 2011) — but a heatmap's columns are AXIS
 * POSITIONS on one hue, not palette slots, so that reasoning does not transfer.
 * What binds here is cell size: the shared 320-unit landscape box minus the row
 * gutter leaves ~250 units of plot, so 12 columns is ~20 units a cell, which is
 * the narrowest a two-digit value still sets in at `FS.value`. Rows are capped
 * lower because each one costs vertical space the box has less of.
 */
const MAX_COLS = 12;
const MAX_ROWS = 10;

// Nominal label sizes in viewBox user units, MIRRORING heatmap.styles.css. CSS
// owns what is painted; the kernel needs the same numbers to size the gutters
// the labels sit in. test/unit/components/svg-label-css-mirror.test.js reads the
// stylesheet and fails when the two drift.
const FS = Object.freeze({
  row: 7.5,    // .heatmap-row-label — a row name in the left gutter
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
 * The intensity a value takes, as a color-mix percentage.
 *
 * Floored and capped by MIX_FLOOR / MIX_TOP below, which carry the reasoning.
 *
 * A FLAT matrix (every value identical) has no gradient to show, so it takes the
 * mid stop rather than dividing by zero and painting everything at the floor.
 */
function mixFor(num, min, max) {
  if (!(max > min)) return Math.round((MIX_FLOOR + MIX_TOP) / 2);
  return Math.round(MIX_FLOOR + ((num - min) / (max - min)) * (MIX_TOP - MIX_FLOOR));
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
 * Above this mix the cell has stopped being the light one, and its value's ink
 * swaps (heatmap.styles.css § the value ink).
 *
 * A STEP RATHER THAN A RAMP, decided here because the kernel is the only thing
 * that knows the mix at emit time — CSS has no conditional on a percentage.
 *
 * 82 IS MEASURED, NOT CHOSEN. The obvious value is the ramp's midpoint, and the
 * midpoint is wrong: painted and read back over the whole ramp, white only
 * overtakes black at mix 84 on the light canvas and around 80 on the dark one,
 * so a midpoint flip puts white ink on cells that are still pale. It measured
 * 2.87:1 on the gallery's own `71` — a real AA failure, on the one surface in
 * this family where text sits on a colored mark.
 *
 * 82 sits between the two crossovers, which is the most either canvas gives up:
 * the hardest cell on the ramp can reach 4.60:1 on light and 4.65:1 on dark
 * whatever the ink, so the ramp has roughly one point of headroom over AA at its
 * worst and the flip point is what spends or keeps it. Re-derive with
 * a sweep that PAINTS each mix and reads the pixel back — computed fills come
 * back as `oklab(...)`, and a regex over that string reports every pair at
 * 1.00:1.
 */
const INK_FLIP_AT = 82;

/**
 * Whether a cell's own value is printed inside it.
 *
 * A number on a colored fill is the one place this family will not guarantee
 * contrast (chart-component.md: "labels and values sit on the canvas, not on
 * the colored mark"), so it is printed only where the cell is big enough for
 * the value to sit in the LIGHT half of the ramp — and never on the saturated
 * end, where the ink would have to flip and the flip point is a palette
 * property rather than a layout one.
 */
function cellFitsValue(cellW, cellH) {
  return cellW >= 18 && cellH >= 12;
}

function buildHeatmap(model, ctx = {}) {
  const view = cart.viewFor(ctx.orientation);
  const plot = cart.plotBox({ view, gutter: GUT });
  const { rows, cols } = model;

  const cellW = (plot.w - CELL_GAP * (cols.length - 1)) / cols.length;
  const cellH = (plot.h - CELL_GAP * (rows.length - 1)) / rows.length;
  const showValues = cellFitsValue(cellW, cellH);
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
      const mix = mixFor(cell.num, model.min, model.max);
      parts.push(
        `<rect class="heatmap-cell" data-anima-role="region" style="--mix:${mix}%"`
        + ` data-mark="${ri * cols.length + ci}" data-label="${escAttr(`${row.label} · ${cols[ci]}`)}"`
        + ` data-value="${escAttr(cell.raw)}" ${geom}/>`,
      );
      if (showValues) {
        parts.push(cart.buildValueLabel(fmt(cell.num), {
          x: x + cellW / 2,
          y: y + cellH / 2,
          anchor: 'middle',
          vAlign: 'middle',
          className: 'heatmap-value',
          fontSize: FS.value,
          width: cellW,
          // THE FLIP IS DECIDED HERE because this is the only place the mix is
          // known at emit time, and CSS cannot branch on a percentage. The
          // value's ink swaps partway ALONG the ramp rather than with the
          // canvas — see heatmap.styles.css § the value ink for why a smooth
          // blend between the two inks is unreadable in the middle.
          extra: mix >= INK_FLIP_AT ? ' data-ink="flip"' : '',
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
  transformSection, parseHeatmap, buildHeatmap, mixFor,
  FS, GUT, CELL_GAP, MAX_COLS, MAX_ROWS, MIX_FLOOR, MIX_TOP, INK_FLIP_AT,
};
