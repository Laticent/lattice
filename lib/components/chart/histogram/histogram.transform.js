/**
 * histogram chart kernel — one quantity cut into bands that join end to end, each
 * band as wide as its range and as tall as its share per unit of range, so the
 * AREA of a bar is its share. A board reads "most years lose under $10M, and one
 * in thirty tops $100M" off the shape.
 *
 * Shape (chart-family.docs.md § How a chart is written):
 *   `[{Annual loss, $1M..$250M, log}, {Share of years}]`
 *
 *   ## Most years stay under $10M.
 *
 *   - `$1M..$10M` `55%`
 *   - `$10M..$50M` `30%`
 *
 * Each row is a band (a Segno range, `a..b`) and a value, read by the one row
 * model the narrator shares (lib/core/histogram-model.js). The optional axis line
 * names the x axis, can fix its domain, and can ask for a LOG scale with the word
 * `log` (cartesian.js § logScale), which is what loss bands that widen toward the
 * tail need: on a linear axis the widest band flattens to nothing.
 *
 * WHY NOT A `bar` MODIFIER. A bar's categories are separate things on a band
 * scale; a histogram's bands are a number line, so their widths are data. With
 * unequal bands, bars of equal width drawn to the value make a narrow band look
 * like the biggest one. Here the width is the band and the height is the value
 * divided by that width, so equal bands draw exactly as bars would and unequal
 * bands draw honestly.
 *
 * The kernel emits no color (HARD RULE #3): every band carries `data-hue="1"`,
 * one series in one hue, filled with the bar's wash, whose stops name the palette.
 */

const markDetail = require('../_chart-family/mark-detail');
const { noteLabelDrop } = require('../_chart-family/label-drops');
const cart = require('../_chart-family/cartesian');
const { readListLead, spliceFirstList, escAttr } = require('../_chart-family/transform-utils');
const { parseTopLevelLis } = require('../../../core/html-lists');
const { liftBracketSpans, axisAcceptor } = require('../../../core/lift-bracket-span');
const { parseBracketList } = require('../../../core/bracket-list');
const { readAxisMember } = require('../../../core/axis-member');
const AXIS_CATALOG = require('../../../core/axis-catalog.generated.js');
const { readRow, bandName, domainOf, isLogDrawn } = require('../../../core/histogram-model');

// Nominal sizes in viewBox user units, MIRRORING chart-family.styles.css's
// cartesian chrome (`.cart-tick`, `.cart-value`), which these marks reuse.
const FS = { tick: cart.FS.tick, value: cart.FS.value };
// The display face's width a glyph at the value size, for placing a label clear
// of its neighbors (a slight overestimate, so two labels never kiss).
const VALUE_ADVANCE = 0.6;
// The air two value labels keep side by side, so `2%` and `0.9%` never read as one string.
const VALUE_GAP = 4;

/**
 * Parse the band list. Returns null when there is nothing to draw, so the
 * dispatcher leaves the section untouched (the family contract).
 */
function parseHistogram(ulInner) {
  const bands = [];
  for (const item of parseTopLevelLis(ulInner)) {
    const { lead, detail } = markDetail.splitDetail(item);
    const { label, pills } = readListLead(lead);
    const row = readRow(pills);
    if (!row) continue;
    bands.push({ ...row, label: label || bandName(row), detail });
  }
  return bands.length ? { bands } : null;
}

/** The axis line above the heading: x (with its scale) and an optional y name. */
function readAxes(html) {
  // Required, as for scatter: a missing catalog entry must fail the build, not
  // quietly re-enable the below slot and eat the coda.
  const decl = AXIS_CATALOG.histogram;
  if (!decl) throw new Error('histogram: no axisSet entry — run build-stage-catalog.');
  const lifted = liftBracketSpans(html, {
    below: decl.keyBelow !== false, bodyTags: decl.bodyTags, acceptAbove: axisAcceptor(decl, { maxParts: 4 }),
  });
  const members = lifted.above ? parseBracketList(lifted.above, { maxParts: 4 }) : null;
  return {
    x: readAxisMember(members?.[0], { scales: true }),
    y: readAxisMember(members?.[1]),
    html: lifted.html,
  };
}

const EMPTY_AXIS = { name: '', range: null, threshold: null, scale: 'linear', ignored: [] };

/** The x scale over the drawn domain: log only when `isLogDrawn` says so. */
function xScaleFor(bands, axis, plot) {
  const domain = domainOf(bands, axis);
  if (isLogDrawn(bands, axis)) {
    return { x: cart.logScale(domain, [plot.x0, plot.x1]), log: true, unit: (a, b) => Math.log10(b) - Math.log10(a) };
  }
  return { x: cart.linearScale(domain, [plot.x0, plot.x1]), log: false, unit: (a, b) => b - a };
}

function buildHistogram(model, ctx = {}, axes = {}) {
  const { bands } = model;
  const ax = axes.x || EMPTY_AXIS;
  const ay = axes.y || EMPTY_AXIS;
  const view = cart.viewFor(ctx.orientation, ctx.paneView);
  const plot = cart.plotBox({
    view,
    gutter: { left: ay.name ? 16 : 8, right: 10, top: 14, bottom: ax.name ? 30 : 18 },
  });
  const { x, log, unit } = xScaleFor(bands, ax, plot);

  // HEIGHT IS VALUE PER UNIT OF RANGE, so area is the value. Bands of one width
  // all divide by the same number, which leaves their heights in the ratio of
  // their values: a histogram of equal bands is exactly a gapless bar chart.
  const density = bands.map((b) => b.value / unit(b.from, b.to));
  const top = Math.max(...density.map((d) => Math.max(0, d)));
  const h = (d) => (top > 0 ? (Math.max(0, d) / top) * plot.h : 0);
  const equal = bands.every((b) => Math.abs(unit(b.from, b.to) - unit(bands[0].from, bands[0].to)) < 1e-9 * Math.abs(unit(bands[0].from, bands[0].to)));

  // THE BAR'S WASH (cartesian.js § buildFillDefs), shaded across each band's width like a
  // column's, so a histogram beside a bar chart reads as its sibling. The wash restarts at
  // every band, which with the ink edge below is what tells two touching bands apart.
  const fill = cart.buildFillDefs({ kind: 'cat', slots: [1], name: 'histogram-fill', x2: 1, y2: 0 });
  const parts = [];
  const marks = [];
  const geo = bands.map((b, k) => {
    const x0 = x(b.from);
    const x1 = x(b.to);
    const top = plot.y1 - h(density[k]);
    marks.push(`<rect class="histogram-band" data-mark="${k}" data-hue="1" data-encodes="hue" data-paint="fill" data-anima-role="bar"` +
      ` data-label="${escAttr(b.label)}" data-value="${escAttr(b.valueRaw)}"` +
      ` x="${cart.round2(x0)}" y="${cart.round2(top)}" width="${cart.round2(Math.max(0, x1 - x0))}" height="${cart.round2(plot.y1 - top)}" fill="${fill.url(1)}"/>`);
    return { x0, x1, top };
  });

  // THE VALUES. Each prints over its band at its full width, never ellipsized: a
  // narrow tail band's `0.9%` read `0.…`. A label wider than its band spills over
  // its neighbors, so it sits above the tallest band it spans, and it climbs one
  // more line if it would touch a label already placed. A label that still cannot
  // clear is left to the hover card, the narration and the description, which all
  // carry it, rather than overprint another.
  const placed = [];
  const values = [];
  const lineH = FS.value + 1;
  bands.forEach((b, k) => {
    const g = geo[k];
    const cx = (g.x0 + g.x1) / 2;
    const w = String(b.valueRaw).length * FS.value * VALUE_ADVANCE;
    const l = cx - w / 2;
    const r = cx + w / 2;
    const under = Math.min(...geo.filter((o) => o.x1 > l && o.x0 < r).map((o) => o.top), g.top);
    for (let lift = 0; lift < 2; lift++) {
      const base = under - 2 - lift * lineH;
      const box = { l, r, t: base - FS.value, b: base };
      if (box.t < 0) break;
      if (placed.some((p) => p.l < box.r + VALUE_GAP && p.r > box.l - VALUE_GAP && p.t < box.b && p.b > box.t)) continue;
      placed.push(box);
      values.push(cart.buildValueLabel(b.valueRaw, { x: cx, y: base, width: w + 4, extra: ` data-mark-for="${k}"` }));
      return;
    }
    // No line cleared: the value is a drop, and says so (label-drops.js).
    noteLabelDrop(b.valueRaw, 'overlap');
  });
  // THE SEAMS. Where two bands meet, a canvas-colored line runs up the shared edge as
  // far as the lower band reaches. Without it two touching bands of one hue read as one
  // shape whenever a `chart-finish:` swaps the wash for a flat body (the ink edge alone
  // nearly vanishes on tone and on dark pigment). It carries no `data-hue`, so no finish
  // repaints it.
  const seams = [];
  bands.forEach((b, k) => {
    const prev = bands[k - 1];
    if (!prev || Math.abs(prev.to - b.from) > 1e-9 * Math.max(1, Math.abs(b.from))) return;
    const top = Math.max(geo[k - 1].top, geo[k].top);
    if (top >= plot.y1) return;
    seams.push(`<line class="histogram-seam" x1="${cart.round2(geo[k].x0)}" y1="${cart.round2(top)}" x2="${cart.round2(geo[k].x0)}" y2="${cart.round2(plot.y1)}"/>`);
  });
  parts.push(`<g class="histogram-bands">${marks.join('')}</g>`, seams.join(''), values.join(''));
  parts.push(cart.buildAxisRule({ plot }));

  // The edges, each printed as the author wrote it. Where two bands meet the one
  // shared edge prints once; where they leave a gap both ends print. When the
  // labels would touch they thin evenly (cartesian.js § thinEvenly), and the last
  // edge always prints. Every edge's number is still in its band's label, the
  // hover card and the narration.
  const edges = [];
  bands.forEach((b, k) => {
    const prev = bands[k - 1];
    if (!prev || Math.abs(prev.to - b.from) > 1e-9 * Math.max(1, Math.abs(b.from))) edges.push({ v: b.from, raw: b.fromRaw });
    edges.push({ v: b.to, raw: b.toRaw });
  });
  const pos = edges.map((e) => x(e.v));
  const keep = cart.thinEvenly(pos, edges.map((e) => e.raw), { fontSize: FS.tick });
  edges.forEach((e, i) => {
    if (!keep[i]) return;
    parts.push(`<line class="cart-axis" x1="${cart.round2(pos[i])}" y1="${cart.round2(plot.y1)}" x2="${cart.round2(pos[i])}" y2="${cart.round2(plot.y1 + 3)}"/>` +
      `<text class="cart-tick histogram-edge" x="${cart.round2(pos[i])}" y="${cart.round2(plot.y1 + 8)}" text-anchor="middle">${escAttr(e.raw)}</text>`);
  });

  if (ax.name) {
    parts.push(cart.buildAxisTitle(ax.name, { x: (plot.x0 + plot.x1) / 2, y: view.h - 10, width: plot.w }));
  }
  if (ay.name) {
    parts.push(cart.buildAxisTitle(ay.name, { x: 7, y: (plot.y0 + plot.y1) / 2, width: plot.h, rotate: -90 }));
  }

  const svg = cart.buildSvgRoot({
    view,
    className: 'histogram-svg',
    title: 'Histogram',
    desc: buildDesc(model, { name: ax.name, log, equal }),
    defs: fill.defs,
    body: parts.join(''),
  });
  const detailMarks = bands.map((b) => ({ label: b.label, valueRaw: b.valueRaw, detail: b.detail || '' }));
  return `<div class="histogram-figure">${svg}${markDetail.detailPayload(detailMarks)}</div>${markDetail.detailNote(detailMarks)}`;
}

/** The read a sighted viewer gets: every band in order, with its value. */
function buildDesc(model, { name = '', log = false, equal = true } = {}) {
  const what = name ? `Histogram of ${name}` : 'Histogram';
  const scale = log ? ', on a log scale' : '';
  const area = equal ? '' : ' Bands differ in width, so each bar\'s area, not its height, is its value.';
  const lines = model.bands.map((b) => `${b.label}: ${b.valueRaw}`);
  const n = model.bands.length;
  return `${what}, ${n} ${n === 1 ? 'band' : 'bands'}${scale}. ${lines.join('; ')}.${area}`;
}

/** The chart-family entrypoint (see the `kernel` block in histogram.manifest.json). */
function transformSection(html, ctx) {
  const axes = readAxes(html);
  let built = false;
  const out = spliceFirstList(axes.html, (ext) => {
    const model = parseHistogram(ext.inner);
    if (!model) return null;
    built = true;
    return buildHistogram(model, ctx, axes);
  });
  // Only consume the axis line when a chart was drawn: a section with no bands
  // comes back byte-identical.
  return built ? out : html;
}

module.exports = { transformSection, parseHistogram, buildHistogram, buildDesc, readAxes, FS };
