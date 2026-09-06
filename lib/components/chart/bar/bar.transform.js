/**
 * bar chart kernel — the chart family's magnitude comparison.
 *
 * THE CLAIM: *these categories differ in magnitude.* Length from a zero
 * baseline is the most accurately decoded visual encoding there is (Cleveland &
 * McGill 1984, position on a common scale), which is why the bar is the most
 * used chart in a board deck and why the family's nearest neighbour is not a
 * substitute: `progress` is an HTML percentage fill with no value axis and no
 * grouping, so it cannot say "revenue by region" at all.
 *
 * FOUR FORMS, one authoring shape:
 *   default      vertical columns, categories along the bottom
 *   `row`        horizontal bars — the correct form whenever the category
 *                names are long, because a row label reads on one line in a
 *                gutter instead of wrapping into a 40-unit band
 *   `grouped`    side-by-side bars per category, from the nested series DSL
 *   `diverging`  signed values off a CENTERED zero rule (tornado / variance)
 *
 * Everything Cartesian — the viewBox, the plot box, the ticks, the grid, the
 * category labels, the canonical rectangular fill — comes from the shared
 * substrate (`_chart-family/cartesian.js`, HARD RULE #1). This file owns the
 * bars, where the value is printed, and the four decisions that make a bar
 * chart read like a board chart rather than a spreadsheet plot:
 *
 *   1. VALUE LABELS INSTEAD OF A VALUE AXIS, wherever the labels fit. A bar
 *      chart with a number on every bar does not need a gridded axis to read
 *      the same number off; carrying both spends a third of the plot on
 *      redundant chrome. See `wantsValueAxis`.
 *   2. BAR WIDTH ADAPTS TO n AND IS CAPPED. `bandScale`'s 0.28 default gives a
 *      3-bar chart 67-unit barn doors and a 10-bar chart a comb. See `padFor`
 *      and MAX_BAR / MAX_ROW_BAR.
 *   3. ONE SERIES IS ONE HUE. A single-series chart whose every bar is a
 *      different color encodes nothing with that color. The categorical
 *      rotation is reserved for `grouped`, where it encodes the series.
 *   4. NEGATIVES HANG FROM THE ZERO RULE, in every form. `niceTicks` includes
 *      zero by default, so the axis already admits them; the bar geometry is
 *      written from `min(v,0)` to `max(v,0)` rather than from the baseline up.
 *
 * Pure CommonJS string-in/string-out: no fs, no DOM, no color (HARD RULE #3).
 */

const cart = require('../_chart-family/cartesian');
const markDetail = require('../_chart-family/mark-detail');
const { measureLabel, ADVANCE } = require('../_chart-family/svg-label');
const { buildSvgLegend } = require('../_chart-family/svg-legend');
const { spliceFirstList, escAttr } = require('../_chart-family/transform-utils');

// ── Tunables, all in viewBox user units ───────────────────────────────────

// The widest a single bar may paint. Without a cap, a 2-category chart at any
// sane padding paints two barn doors: the eye reads AREA on a shape that wide
// and the length encoding — the entire reason to use a bar — stops being the
// thing you see.
// A bar too wide reads as AREA and the length encoding stops being what you
// see; a bar too narrow reads as a stick and its end is hard to place against
// its neighbour's. Both ends are relative to the plot, not absolute, because
// the portrait viewBox is 300 tall against landscape's 180: at a fixed 40 the
// same four-category chart that looks right in landscape paints 1:6 thermometer
// tubes in portrait. Tied to the plot's own depth, the cap lands at 40 in
// landscape and 64 in portrait, and the bars keep the same proportion in both.
const MAX_BAR_LO = 28;
const MAX_BAR_HI = 64;
const MAX_ROW_BAR_LO = 12;
const MAX_ROW_BAR_HI = 36;

/** The widest a column may paint, from the plot's depth. */
function maxBarFor(plot) {
  return Math.min(MAX_BAR_HI, Math.max(MAX_BAR_LO, plot.h * 0.28));
}

/** The thickest a row bar may paint, from the plot's depth. */
function maxRowBarFor(plot) {
  return Math.min(MAX_ROW_BAR_HI, Math.max(MAX_ROW_BAR_LO, plot.h * 0.13));
}

// A category label is CULLED or shortened when it will not fit its band, and on
// a bar chart that is data loss the reader cannot detect: "Global Transacti…"
// and "Global Transaction Services" are two different business units. The row
// form has no such limit — the name sits in a gutter and reads on one line —
// so the column form hands over to it rather than shorten a name. Measured on
// the real wrapper, so the trigger is "this label would actually be cut", not a
// character count guess.
const ROW_GUTTER_MIN = 56;
const ROW_GUTTER_MAX = 96;

// Gutters. `left` is the value-tick column and shrinks to a hairline when the
// chart labels its bars directly (no ticks to hold); `bottom` holds two lines
// of category label at FS.cat plus the 5-unit gap `buildCategoryLabels` uses.
const GUT_COL = { left: 30, right: 10, top: 13, bottom: 27 };
const GUT_COL_NOAXIS = { left: 8, right: 10, top: 13, bottom: 27 };
const GUT_ROW = { left: 72, right: 30, top: 8, bottom: 10 };

// `buildCategoryLabels` and `buildValueTicks` place an x-axis label at
// `plot.y1 + gap` as a BASELINE, so at the substrate's default gap of 5 the
// glyphs straddle the line the bars stand on. 11 clears the ascender.
const CAT_GAP_X = 11;

/**
 * Inner padding as a fraction of the band step, chosen from n.
 *
 * `bandScale`'s 0.28 default is tuned for a mid-count categorical axis. At n=3
 * on a 280-unit plot it yields a 67-unit bar; at n=12 it yields 16 units with a
 * 6-unit gutter between them, which reads as a comb. The ladder below keeps the
 * GAP between roughly a third and a half of the bar at every count the chart
 * claims to support, and MAX_BAR takes over at the low end.
 */
function padFor(n) {
  if (n <= 2) return 0.55;
  if (n <= 4) return 0.42;
  if (n <= 6) return 0.34;
  if (n <= 9) return 0.28;
  return 0.24;
}

// ── Parse ─────────────────────────────────────────────────────────────────

/**
 * Parse the section's first list into the Cartesian series model.
 * Returns null when there is nothing to draw — the kernels' pass-through
 * signal, which leaves the section markup untouched.
 */
function parseBar(ulInner) {
  return cart.parseSeries(ulInner);
}

// ── Shape resolution ──────────────────────────────────────────────────────

/**
 * Which of the four forms this slide is, from the class tokens plus the shape
 * of the data itself.
 *
 * `grouped` is DERIVED, not merely declared: a nested series list can only be
 * drawn grouped, and a flat list cannot be. The token is accepted (and
 * documented) so an author can say what they meant, but it never overrides the
 * data — a `grouped` token on a flat list draws the single-series chart rather
 * than an empty one.
 */
function resolveShape(model, ctx) {
  const tokens = Array.isArray(ctx.classTokens) ? ctx.classTokens : [];
  const shape = {
    grouped: !model.flat && model.series.length > 1,
    diverging: tokens.includes('diverging'),
    row: tokens.includes('row'),
    autoRow: false,
  };
  shape.axis = wantsValueAxis(model, shape, ctx);
  if (!shape.row && wouldShortenALabel(model, shape, ctx)) {
    shape.row = true;
    shape.autoRow = true;
    shape.axis = false;
  }
  return shape;
}

/**
 * Would the COLUMN form have to shorten a category name?
 *
 * The trigger is deliberately "a name would be LOST", not "a name is long".
 * Rotating a chart because a label is tight would make the whole composition
 * flip on a one-word edit, with no visible cause — a real objection, and the
 * reason `roadmap`'s auto-switch keys on the deck orientation stamp (a stable,
 * author-visible fact) rather than on content. What makes this case different
 * is what the alternative costs: the column form does not merely crowd a long
 * name, it ELLIPSIZES it, and a shortened business-unit name is wrong data
 * rather than tight typography. Rotating is visible and self-explaining; a
 * silently truncated name is not. So the switch fires only where the choice is
 * "rotate or lose the name", and `row` can always be asked for outright.
 */
function wouldShortenALabel(model, shape, ctx) {
  const view = cart.viewFor(ctx.orientation);
  const plot = cart.plotBox({ view, gutter: shape.axis ? GUT_COL : GUT_COL_NOAXIS });
  const n = model.groups.length;
  const band = cart.bandScale(n, [plot.x0, plot.x1], { padInner: padFor(n), padOuter: 0.14 });
  const width = band.step * 0.98;
  return model.groups.some((g) => {
    if (!g.label) return false;
    const m = measureLabel(g.label, { width, fontSize: cart.FS.cat, maxLines: 2 });
    return m.lines.some((l) => l.endsWith('\u2026'));
  });
}

/**
 * Does this chart carry a value axis, or does it label its bars directly?
 *
 * Direct labeling wins whenever it fits — the family's standing rule
 * (design/skills/chart-component.md) — and it is worth more on a bar than
 * anywhere else, because a bar's value is one short number that sits naturally
 * at the end of the bar. Carrying BOTH spends a tenth of the plot on a tick
 * column and four gridlines so a reader can re-derive a number already printed
 * two units away. So the axis is not the default that direct labels replace; it
 * is the FALLBACK for when the labels will not fit.
 *
 * "Will not fit" is MEASURED rather than guessed at a mark count. An earlier cut
 * used "more than eight marks", which called a ten-column single series
 * unlabelable — each of those labels has its own 28-unit band and fits with room
 * to spare — while passing a 3x3 grouped chart whose bars are 10 units apart.
 * The quantity that actually decides it is the room ONE label has: a whole band
 * when there is one series per category, and just its own bar's slot when the
 * bars are grouped.
 *
 * A ROW chart always labels directly: its values print into the right gutter,
 * which is sized to hold the longest of them, so there is no crowding to fall
 * back from.
 */
function wantsValueAxis(model, shape, ctx) {
  if (shape.row) return false;
  const view = cart.viewFor(ctx.orientation);
  const plot = cart.plotBox({ view, gutter: GUT_COL_NOAXIS });
  const n = model.groups.length;
  const band = cart.bandScale(n, [plot.x0, plot.x1], { padInner: padFor(n), padOuter: 0.14 });
  const nS = shape.grouped ? model.series.length : 1;
  const groupW = Math.min(band.width, maxBarFor(plot) * nS);
  const inner = cart.bandScale(nS, [0, groupW], { padInner: nS > 1 ? 0.14 : 0, padOuter: 0 });
  const room = nS > 1 ? inner.step : band.step * 0.98;
  return marksOf(model).some((m) => estWidth(m.raw) > room);
}

/** The painted width of a short value label, user units — the same conservative
 *  per-character advance the shared line-breaker budgets with. */
function estWidth(text) {
  return String(text == null ? '' : text).length * cart.FS.value * ADVANCE;
}

// ── Build ─────────────────────────────────────────────────────────────────

function buildBar(model, ctx = {}) {
  const orientation = ctx.orientation;
  const shape = resolveShape(model, ctx);
  const view = cart.viewFor(orientation);
  return shape.row
    ? buildRows(model, shape, { view, axis: shape.axis, orientation })
    : buildColumns(model, shape, { view, axis: shape.axis, orientation });
}

/**
 * The value domain, its ticks, and the scale onto the value axis.
 *
 * WITHOUT AN AXIS the domain is the DATA's own extent, not a nice-numbered one.
 * There are no ticks to land on round numbers, and rounding 4.4 up to 6 would
 * spend a quarter of the plot on headroom nobody can read a value off — the
 * tallest bar should reach the top of the plot it is drawn in.
 *
 * WITH an axis, `bestTicks` picks the tick target rather than pinning it at the
 * family default of 4: `niceTicks` snaps the STEP to the 1/2/2.5/5 ladder and
 * then widens the domain to whole steps, so a fixed target routinely lands a
 * 4.4 series on a 0-6 axis. Trying a few targets and keeping the one that wastes
 * the least headroom costs nothing and stays inside the substrate's generator.
 */
function domainFor(model, shape, axis) {
  let lo = Math.min(0, model.min);
  let hi = Math.max(0, model.max);
  if (shape.diverging) {
    // A diverging chart's claim is "how far off zero, and which way" — so zero
    // sits at the CENTER of the plot and both sides share one scale. An
    // asymmetric domain would put zero off-center and make a -3 look longer
    // than a +3.
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    lo = -m; hi = m;
  }
  if (!axis) {
    if (lo === hi) hi = lo + 1;
    return { min: lo, max: hi, step: 1, ticks: [0] };
  }
  return bestTicks(lo, hi);
}

/**
 * The nicest axis for [lo, hi]: fewest wasted units, 3-5 gridlines, and every
 * tick printable.
 *
 * The printability check is not belt-and-braces. `niceTicks` will happily
 * choose a 2.5 step off its 1/2/2.5/5 ladder, and the shared formatter decides
 * its decimals from the step — any step of 1 or more prints whole numbers — so
 * a 0/2.5/5 axis paints "0 · 3 · 5". Rendered, the gridline at 2.5 is labeled
 * 3. So a candidate is kept only when re-reading each printed tick gives the
 * number back; otherwise the next target is tried.
 */
function bestTicks(lo, hi) {
  let best = null;
  for (const target of [4, 3, 5, 2]) {
    const t = cart.niceTicks(lo, hi, { target, includeZero: true });
    if (t.ticks.length < 3 || t.ticks.length > 5) continue;
    if (!ticksPrintTruthfully(t)) continue;
    const span = t.max - t.min;
    const waste = span > 0 ? ((t.max - hi) + (lo - t.min)) / span : 1;
    if (!best || waste < best.waste - 1e-9) best = { t, waste };
  }
  return best ? best.t : cart.niceTicks(lo, hi, { target: 4, includeZero: true });
}

/** Does every tick survive a round trip through the shared axis formatter? */
function ticksPrintTruthfully({ ticks, step }) {
  const fmt = cart.axisFormatter({ ticks, step });
  return ticks.every((v) => {
    const back = cart.parseValue(fmt(v));
    return Number.isFinite(back) && Math.abs(back - v) <= Math.abs(step) * 0.001;
  });
}

/**
 * Room to reserve INSIDE the plot for a value label that would otherwise be
 * printed outside it.
 *
 * A directly-labeled bar prints its number just past the bar's far end. For a
 * positive bar that end is the top (column) or the right (row), and the gutter
 * there already holds the label. For a NEGATIVE bar the far end is the bottom
 * or the left — where the category labels live — so at full reach the value
 * landed on top of the category name ("-2.9" printed through "FX exposure").
 *
 * The fix is in the RANGE, not the domain: the scale maps onto a slightly
 * inset plot rather than onto a padded domain, so zero stays exactly where the
 * zero rule is drawn and the bars keep their proportions to each other.
 */
function valueRoom(model, axis, horizontal) {
  if (axis) return 0;
  const negs = marksOf(model).filter((m) => m.num < 0);
  if (!negs.length) return 0;
  if (!horizontal) return cart.FS.value * 1.5;
  const widest = negs.reduce((w, m) => Math.max(w, String(m.raw || '').length), 0);
  return widest * cart.FS.value * 0.6 + 4;
}

/** Every categorical slot this chart paints, so `buildFillDefs` mints one gradient each. */
function slotsFor(model, shape) {
  if (shape.diverging) return [1, 2];
  if (shape.grouped) return model.series.map((_, i) => (i % 6) + 1);
  return [1];
}

/**
 * Which categorical slot a mark takes: the series when grouped, the SIGN when
 * diverging, slot 1 otherwise.
 *
 * Slots 1 and 2 carry the diverging pair because they are the two a theme
 * separates hardest — indaco reads blue / rust, cuoio bronze / teal, the
 * untuned master blue / orange. A pair further down the ramp is a coin flip:
 * slot 6 is rose in the master set and TEAL in indaco, a hair from slot 1's
 * blue.
 */
function slotOf(shape, { seriesIndex = 0, num = 0 } = {}) {
  if (shape.diverging) return num < 0 ? 2 : 1;
  if (shape.grouped) return (seriesIndex % 6) + 1;
  return 1;
}

/** One data point, flattened out of the group model into what the geometry needs. */
function marksOf(model) {
  const out = [];
  model.groups.forEach((g, gi) => {
    if (model.flat) {
      out.push({ gi, si: 0, label: g.label, raw: g.raw, num: g.num });
      return;
    }
    model.series.forEach((name, si) => {
      const p = g.points.find((q) => q.series === name);
      if (p) out.push({ gi, si, label: g.label, series: name, raw: p.raw, num: p.num });
    });
  });
  return out.filter((m) => Number.isFinite(m.num));
}

/**
 * The reference line every bar is read against.
 *
 * `buildAxisRule` is deliberately NOT used. It draws at the plot EDGE, and on a
 * bar chart the line that matters is ZERO — which is the edge only while every
 * value is positive. A signed series drawn with both got a floating zero rule
 * AND a meaningless rule under the negative bars, reading as two baselines.
 * `buildGrid` already emits zero as its own emphasized `cart-zero` class, so
 * one call covers both cases: the ticks when there is an axis, zero alone when
 * there is not.
 */
function referenceLines({ plot, ticks, scale, axis, which }) {
  return cart.buildGrid({ plot, ticks: axis ? ticks : [0], scale, axis: which });
}

// ── Columns (default + grouped + diverging) ───────────────────────────────

function buildColumns(model, shape, { view, axis, orientation }) {
  const plot = cart.plotBox({ view, gutter: axis ? GUT_COL : GUT_COL_NOAXIS });
  const { min, max, step, ticks } = domainFor(model, shape, axis);
  const room = valueRoom(model, axis, false);
  const y = cart.linearScale([min, max], [plot.y1 - room, plot.y0]);
  const n = model.groups.length;
  const band = cart.bandScale(n, [plot.x0, plot.x1], { padInner: padFor(n), padOuter: 0.14 });

  const chrome = [referenceLines({ plot, ticks, scale: y, axis, which: 'y' })];
  if (axis) {
    chrome.push(cart.buildValueTicks({ plot, ticks, scale: y, step, affix: model.affix, axis: 'y' }));
  }
  chrome.push(cart.buildCategoryLabels({
    plot, labels: model.groups.map((g) => g.label), center: (i) => band.center(i),
    width: band.step * 0.98, maxLines: 2, axis: 'x', gap: CAT_GAP_X,
  }));

  // Inner band: one slot per SERIES inside each category band, so grouped bars
  // sit side by side. A single series collapses to one slot of the full width.
  const nS = shape.grouped ? model.series.length : 1;
  const groupW = Math.min(band.width, maxBarFor(plot) * nS);
  const inner = cart.bandScale(nS, [0, groupW], { padInner: nS > 1 ? 0.14 : 0, padOuter: 0 });

  const bars = [];
  const values = [];
  for (const m of marksOf(model)) {
    const x0 = band.center(m.gi) - groupW / 2 + inner.start(m.si);
    const w = inner.width;
    const top = y(Math.max(m.num, 0));
    const bot = y(Math.min(m.num, 0));
    bars.push({ m, x: x0, y: top, w, h: Math.max(0, bot - top) });
    if (!axis && m.raw) {
      const above = m.num >= 0;
      values.push(cart.buildValueLabel(m.raw, {
        x: x0 + w / 2,
        y: above ? top - 2.5 : bot + 2,
        anchor: 'middle',
        // 'bottom' grows the block UPWARD off the bar top; 'hanging' puts y at
        // the block's TOP edge so a label under a negative bar clears it. The
        // substrate has no 'top' — passing one silently means 'baseline', which
        // printed every negative value inside its own bar.
        vAlign: above ? 'bottom' : 'hanging',
        width: Math.max(w, 30),
      }));
    }
  }

  return assemble({ model, shape, view, plot, chrome, bars, values, orientation });
}

// ── Rows ──────────────────────────────────────────────────────────────────

/**
 * The left gutter a row chart needs: enough for the longest category name on
 * two lines, clamped. Fixed at 72 the stress deck still shortened "Global
 * Transaction Services"; unclamped, one long name would eat the plot the bars
 * are drawn in.
 */
function rowGutterFor(model) {
  let need = ROW_GUTTER_MIN;
  for (const g of model.groups) {
    if (!g.label) continue;
    for (let w = ROW_GUTTER_MIN; w <= ROW_GUTTER_MAX; w += 4) {
      const m = measureLabel(g.label, { width: w - 5, fontSize: cart.FS.cat, maxLines: 2 });
      if (!m.lines.some((l) => l.endsWith('\u2026'))) { need = Math.max(need, w); break; }
      if (w + 4 > ROW_GUTTER_MAX) need = ROW_GUTTER_MAX;
    }
  }
  return need;
}

function buildRows(model, shape, { view, axis, orientation }) {
  // The right gutter holds the value printed past the end of the longest
  // POSITIVE bar, so it is sized from the values rather than fixed: a series of
  // `$182M` needs more air than one of `9`, and a fixed 30 either wasted plot or
  // pushed the widest label off the viewBox.
  const widestValue = marksOf(model)
    .filter((m) => m.num >= 0)
    .reduce((w, m) => Math.max(w, estWidth(m.raw)), 0);
  const right = Math.min(46, Math.max(24, widestValue + 6));
  const plot = cart.plotBox({ view, gutter: { ...GUT_ROW, left: rowGutterFor(model), right } });
  const { min, max, step, ticks } = domainFor(model, shape, axis);
  const room = valueRoom(model, axis, true);
  const x = cart.linearScale([min, max], [plot.x0 + room, plot.x1]);
  const n = model.groups.length;
  const band = cart.bandScale(n, [plot.y0, plot.y1], { padInner: padFor(n), padOuter: 0.1 });

  const chrome = [referenceLines({ plot, ticks, scale: x, axis, which: 'x' })];
  if (axis) {
    chrome.push(cart.buildValueTicks({ plot, ticks, scale: x, step, affix: model.affix, axis: 'x', gap: CAT_GAP_X }));
  }
  chrome.push(cart.buildCategoryLabels({
    plot, labels: model.groups.map((g) => g.label), center: (i) => band.center(i),
    width: plot.gutter.left - 5, maxLines: 2, axis: 'y',
  }));

  const nS = shape.grouped ? model.series.length : 1;
  const groupH = Math.min(band.width, maxRowBarFor(plot) * nS);
  const inner = cart.bandScale(nS, [0, groupH], { padInner: nS > 1 ? 0.14 : 0, padOuter: 0 });

  const bars = [];
  const values = [];
  for (const m of marksOf(model)) {
    const y0 = band.center(m.gi) - groupH / 2 + inner.start(m.si);
    const h = inner.width;
    const left = x(Math.min(m.num, 0));
    const right = x(Math.max(m.num, 0));
    bars.push({ m, x: left, y: y0, w: Math.max(0, right - left), h });
    if (!axis && m.raw) {
      const pos = m.num >= 0;
      values.push(cart.buildValueLabel(m.raw, {
        x: pos ? right + 3 : left - 3,
        y: y0 + h / 2,
        anchor: pos ? 'start' : 'end', vAlign: 'middle',
        width: plot.gutter.right - 4,
      }));
    }
  }

  return assemble({ model, shape, view, plot, chrome, bars, values, orientation });
}

// ── Emission ──────────────────────────────────────────────────────────────

function assemble({ model, shape, view, plot, chrome, bars, values, orientation }) {
  const slots = slotsFor(model, shape);
  // THE WASH RUNS ACROSS THE BAR'S THICKNESS, NEVER ALONG ITS LENGTH. The
  // canonical fill is a gradient, and on a bar the one thing that must not vary
  // along the bar is its value: a column shaded dark-at-the-top to light-at-the-
  // bottom puts a second, meaningless gradient on the axis the reader is
  // measuring. So a column takes the horizontal axis and a row keeps the
  // substrate's vertical default — in both cases the wash reads as shading on
  // the bar's thickness and the length is carried by geometry alone.
  const fill = cart.buildFillDefs({
    kind: 'cat', slots, name: 'bar-fill',
    ...(shape.row ? {} : { x2: 1, y2: 0 }),
  });

  // Marks are grouped by SERIES so the stylesheet can cycle the categorical
  // palette with `nth-of-type` on the series <g> — never `nth-child`, and never
  // on the rects themselves, whose document order interleaves the series.
  const nS = shape.grouped ? model.series.length : 1;
  const lanes = [];
  for (let si = 0; si < nS; si++) {
    const rects = bars.filter((b) => b.m.si === si).map((b) => {
      const slot = slotOf(shape, { seriesIndex: b.m.si, num: b.m.num });
      const cls = shape.diverging ? `bar-mark ${b.m.num < 0 ? 'bar-down' : 'bar-up'}` : 'bar-mark';
      // data-cat is the 0-BASED categorical slot, the family-wide hook the a11y
      // and print stylesheets texture on (the shared legend already keys its
      // swatches `[data-cat="0"]`, so a bar and its key entry texture alike).
      // data-s carries the diverging chart's own semantics — up / down, which is
      // not the CHART_STATUS vocabulary and deliberately says so. `--i` stays as
      // the family's index idiom. None of the three paints, so the PDF is
      // byte-identical with or without them.
      const sign = shape.diverging ? ` data-s="${b.m.num < 0 ? 'down' : 'up'}"` : '';
      return `<rect class="${cls}" data-mark="${b.m.gi}" data-anima-role="bar"` +
        ` data-cat="${slot - 1}" style="--i:${slot - 1}"${sign}` +
        ` data-label="${escAttr(b.m.label)}"${b.m.raw ? ` data-value="${escAttr(b.m.raw)}"` : ''}` +
        ` x="${cart.round2(b.x)}" y="${cart.round2(b.y)}"` +
        ` width="${cart.round2(b.w)}" height="${cart.round2(b.h)}"` +
        ` fill="${fill.url(slot)}"/>`;
    }).join('');
    lanes.push(`<g class="bar-lane">${rects}</g>`);
  }
  // Two MUTUALLY EXCLUSIVE container classes rather than one, so the
  // sign-coloured diverging rules and the per-series lane rotation never meet
  // in the cascade. They did at first — `.bar-marks > g:nth-of-type(1)
  // .bar-mark` is one class-unit MORE specific than `.bar-mark.bar-down`, so
  // every diverging bar took the lane's ink and a cuoio negative bar painted a
  // bronze edge around a teal fill. Winning a specificity race is a fix that
  // holds until the next selector; two containers make the collision
  // unreachable.
  const marks = `<g class="bar-marks ${shape.diverging ? 'bar-signed' : 'bar-cat'}">${lanes.join('')}</g>`;

  const inner = `${chrome.join('')}${marks}${values.join('')}`;
  const title = shape.grouped ? 'Grouped bar chart' : shape.diverging ? 'Diverging bar chart' : 'Bar chart';
  const desc = buildDesc(model);

  let body = inner;
  let defs = fill.defs;
  let viewW = view.w;
  let viewH = view.h;
  if (shape.grouped) {
    // THE RIGHT RAIL, which is `buildSvgLegend`'s landscape default, and it was
    // worth checking rather than assuming: the key-below layout was tried and
    // measured WORSE. The rail costs width and the key-below costs height, so
    // which wins is decided by the chart body's aspect, and the body is far
    // wider than the viewBox — measured off the rendered PDF it is about
    // 1005x430 px against a 320x180 box, so every Cartesian chart here is
    // HEIGHT-limited and has spare width to give away. At that aspect the rail
    // leaves a 574x293 plot and the key below leaves 437x223 — the rail is 73%
    // more plot. (An earlier round ran this arithmetic on a guessed 710x425
    // body, picked key-below, and shrank the chart by a third; the render is
    // what caught it.)
    const legend = buildSvgLegend({
      rows: model.series.map((name, si) => ({
        swatchFill: fill.url(slotOf(shape, { seriesIndex: si })),
        label: name,
      })),
      diagramRight: plot.x1 + 4,
      diagramHeight: view.h,
      hasValues: false,
      orientation,
    });
    defs += legend.defs;
    body = `<g transform="translate(${legend.diagramDx} ${legend.diagramDy})">${inner}</g>${legend.body}`;
    viewW = legend.viewW;
    viewH = legend.viewH;
  }

  const svg = `<svg class="cart-svg bar-svg" viewBox="0 0 ${viewW} ${viewH}"` +
    ` preserveAspectRatio="xMidYMid meet" role="img">` +
    `<title>${title}</title>${desc}<defs>${defs}</defs>${body}</svg>`;

  const detailMarks = model.groups.map((g) => ({
    label: g.label,
    valueRaw: g.raw || g.totalRaw || '',
    detail: g.detail.length ? g.detail.map((d) => `<li>${escAttr(d)}</li>`).join('') : '',
  }));
  return `<div class="bar-figure">${svg}${markDetail.detailPayload(detailMarks)}</div>` +
    markDetail.detailNote(detailMarks);
}

/**
 * The accessible description.
 *
 * `role="img"` prunes the whole SVG subtree from the accessibility tree, so
 * every `<text>` above is unreachable and this string is the ONLY route to the
 * data. A bar chart exists to say which category is bigger and by how much, so
 * the desc carries the RANKING and the spread as well as the values — the same
 * standard the funnel's desc sets by carrying conversion rates rather than
 * stage values alone.
 */
function buildDesc(model) {
  const parts = [];
  if (model.flat) {
    parts.push(model.groups
      .map((g) => (g.raw ? `${g.label} ${g.raw}` : g.label))
      .filter(Boolean).join('; '));
  } else {
    parts.push(model.groups.map((g) => {
      const pts = g.points.map((p) => `${p.series} ${p.raw}`).join(', ');
      return pts ? `${g.label} — ${pts}` : g.label;
    }).join('; '));
  }
  const ms = marksOf(model);
  if (ms.length > 1) {
    const hi = ms.reduce((a, b) => (b.num > a.num ? b : a));
    const lo = ms.reduce((a, b) => (b.num < a.num ? b : a));
    const name = (m) => (m.series ? `${m.label} ${m.series}` : m.label);
    parts.push(`Highest ${name(hi)} ${hi.raw}, lowest ${name(lo)} ${lo.raw}`);
  }
  const text = parts.filter(Boolean).join('. ');
  return text ? `<desc>${escAttr(text)}</desc>` : '';
}

/** The chart-family entrypoint (see the `kernel` block in bar.manifest.json). */
function transformSection(html, ctx) {
  return spliceFirstList(html, (ext) => {
    const model = parseBar(ext.inner);
    return model ? buildBar(model, ctx) : null;
  });
}

module.exports = {
  transformSection, parseBar, buildBar,
  resolveShape, wantsValueAxis, padFor, domainFor, bestTicks, marksOf, rowGutterFor, slotOf, valueRoom,
  maxBarFor, maxRowBarFor, estWidth, GUT_COL, GUT_COL_NOAXIS, GUT_ROW, CAT_GAP_X,
};
