/**
 * legend-svg.js — the legend's SVG emitter, `anchored` layout: labels that name one mark each.
 *
 * Design: engineering/decisions/2026-10-19-universal-legend.md § 6. The model and its reader are
 * lib/core/legend.js; this is the SVG half of "one model, two emitters". It sits in the chart family
 * rather than lib/core because its back end is this folder's label kernel (`wrapSvgLabel`), and
 * lib/core may not import a component (.dependency-cruiser.cjs `core-no-component-imports`).
 *
 * THE FIRST STRATEGY IS A LANE, and the first caller is why. A heatmap has no free space: every
 * cell is filled and prints its number at its center, so a label set ON the grid covers either a
 * number or a fill it cannot hold contrast against. The design note's halo answer (a canvas-color
 * knockout, `paint-order: stroke`) paints in Chrome but not in the CLI's vector PDF writer, which
 * draws SVG text as plain fill and drops the stroke (lib/core/pdf-compose/read-slide.mjs; logged
 * in followups.d/2798-p1-pdf-writer-drops-svg-text-halo.md). So the labels sit in a lane beside
 * the figure, on the canvas, where a bare label needs no help in any medium, and a leader joins
 * each to its mark. The caller supplies the leader's ROUTE because only it knows where its
 * gutters run: the heatmap's runs along the gap between two rows, so the line never crosses a
 * cell. A chart with open space (a scatter) will place labels beside the marks through
 * `placeLabels` when it adopts the legend (Wave 5).
 *
 * THE TARGET IS RINGED. A callout names one cell of a dense grid, and a leader alone points into a
 * field of near-identical rectangles. A ring inside the named mark's own box (`legend-target`)
 * closes that gap and moves nothing.
 *
 * GESTURE TIER 1 (§ 8). A label carries `data-mark-for` naming its mark, so hover and tap open the
 * mark's card through chart-interact.js with no new code. It never carries `data-mark`: that would
 * shift the popover's index map.
 *
 * A label the lane cannot hold is DROPPED and reported (label-drops.js, `overlap`), never drawn over
 * another: the same call `placeLabels` makes, for the same reason.
 *
 * Pure string-in/string-out; everything is viewBox units.
 */

const { wrapSvgLabel } = require('./svg-label');
const { noteLabelDrop } = require('./label-drops');
const { colorAttr } = require('../../../core/legend-key');

const round = (n) => Math.round(n * 100) / 100;

/** Padding inside a plate, as fractions of the font size: wide enough that the edge clears the ink. */
const PLATE_PAD = Object.freeze({ x: 0.45, y: 0.22 });

/** The longest a chevron's or diamond's point may reach, as a fraction of the font size. */
const TIP = 0.75;

/** Clear space between two labels in the lane, as a fraction of the font size. */
const LANE_GAP = 0.5;

/** The plate classes, spelled out (checkChartMarks reads string literals whole). */
const PLATE_CLASS = Object.freeze({
  pill: 'legend-plate legend-plate--pill',
  chip: 'legend-plate legend-plate--chip',
  tag: 'legend-plate legend-plate--tag',
  'tag-bordered': 'legend-plate legend-plate--tag-bordered',
  circle: 'legend-plate legend-plate--circle',
  'chevron-right': 'legend-plate legend-plate--chevron-right',
  'chevron-left': 'legend-plate legend-plate--chevron-left',
  diamond: 'legend-plate legend-plate--diamond',
});

/**
 * The plate behind a placed label, from its measured box. Shapes follow the pill's: a capsule, a
 * soft chip, a square tag, a bordered tag, a circle, two chevrons and a diamond.
 */
function plateSvg(shape, box, fontSize, color) {
  const cls = PLATE_CLASS[shape];
  if (!cls) return '';
  const px = fontSize * PLATE_PAD.x;
  const py = fontSize * PLATE_PAD.y;
  let x0 = box.left - px;
  let x1 = box.right + px;
  const y0 = box.top - py;
  const y1 = box.bottom + py;
  const h = y1 - y0;
  const c = colorAttr(color);
  const pts = (list) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
  const midY = (y0 + y1) / 2;
  // Capped at what plateInset and the lane budget for it: a wrapped label's half-height would push
  // a chevron's point into the grid on one side and past the figure on the other.
  const tip = Math.min(h / 2, fontSize * TIP);
  if (shape === 'circle' && x1 - x0 < h) {
    const mid = (x0 + x1) / 2;
    x0 = mid - h / 2;
    x1 = mid + h / 2;
  }
  if (shape === 'chevron-right') return `<polygon class="${cls}"${c} points="${pts([[x0, y0], [x1, y0], [x1 + tip, midY], [x1, y1], [x0, y1]])}"/>`;
  if (shape === 'chevron-left') return `<polygon class="${cls}"${c} points="${pts([[x0 - tip, midY], [x0, y0], [x1, y0], [x1, y1], [x0, y1]])}"/>`;
  if (shape === 'diamond') return `<polygon class="${cls}"${c} points="${pts([[x0 - tip, midY], [x0, y0], [x1, y0], [x1 + tip, midY], [x1, y1], [x0, y1]])}"/>`;
  const rx = shape === 'pill' || shape === 'circle' ? h / 2 : shape === 'chip' ? h * 0.22 : 0;
  return `<rect class="${cls}"${c} x="${round(x0)}" y="${round(y0)}" width="${round(x1 - x0)}" height="${round(h)}" rx="${round(rx)}"/>`;
}

/** How far a plate reaches past its glyph box on each side: the text is inset by this. */
function plateInset(entry, fontSize) {
  if (!entry.plate) return 0;
  const tip = ['chevron-left', 'chevron-right', 'diamond'].includes(entry.plate) ? fontSize * TIP : 0;
  return fontSize * PLATE_PAD.x + tip;
}

/**
 * Draw an anchored legend in a lane beside the figure.
 *
 * @param {object[]} entries  the legend's entries (lib/core/legend.js), each resolved by the caller:
 *        `{ ...entry, target: {cx, cy, w, h, mark, route} }` — the mark's center and size, its
 *        `data-mark` index, and the leader's route as points from the mark toward the lane.
 * @param {object} o
 * @param {number} o.x          the lane's left edge
 * @param {number} o.width      the lane's width; a label wraps to it
 * @param {number} o.top        the highest a label may sit
 * @param {number} o.bottom     the lowest a label may reach
 * @param {number} o.fontSize   the label size in viewBox units, emitted as an attribute
 * @param {number} [o.maxLines] lines a label may wrap to before it ellipsizes
 * @returns {{svg: string, placed: Array<{entry: object, box: object}|null>}} the group, and each
 *          entry's placed box in entry order (null where it was dropped)
 */
function laneSvg(entries, { x, width, top, bottom, fontSize, maxLines = 3 }) {
  if (!entries.length) return { svg: '', placed: [] };
  const gap = fontSize * LANE_GAP;
  const pad = (e) => (e.plate ? fontSize * PLATE_PAD.y : 0);
  // A plated label is centered in its plate. The plate is sized from the kernel's width ESTIMATE,
  // which errs wide by design (svg-label.js), so start-anchored text left all the spare room on the
  // right; centered, it splits evenly and the plate reads as fitted.
  const draft = (e, cy, center) => wrapSvgLabel(e.text, {
    x: center ?? x + plateInset(e, fontSize),
    y: cy,
    width: width - 2 * plateInset(e, fontSize),
    fontSize,
    anchor: center === undefined ? 'start' : 'middle',
    baseline: 'middle',
    vAlign: 'middle',
    maxLines,
    className: e.plate ? 'legend-text legend-text--plated' : 'legend-text legend-text--bare',
    attrs: `${colorAttr(e.color)} data-mark-for="${e.target.mark}" data-anima-role="label"`,
  });
  // Top to bottom by the mark each names, so the lane reads in the order the marks sit and two
  // leaders never cross. Each label starts level with its mark and is pushed down only as far as
  // the label above it needs; a stack that runs off the bottom slides up as one.
  const order = entries.map((_, i) => i).sort((a, b) => entries[a].target.cy - entries[b].target.cy || a - b);
  const extent = order.map((i) => {
    const d = draft(entries[i], 0);
    return { i, up: -d.top + pad(entries[i]), down: d.bottom + pad(entries[i]) };
  });
  let floor = top;
  const centers = extent.map((h) => {
    const cy = Math.max(entries[h.i].target.cy, floor + h.up);
    floor = cy + h.down + gap;
    return cy;
  });
  const overrun = floor - gap - bottom;
  if (overrun > 0) {
    // Slide the stack up, never past `top`: whatever still does not fit is dropped from the bottom.
    let ceiling = top;
    for (let k = 0; k < centers.length; k++) {
      centers[k] = Math.max(centers[k] - overrun, ceiling + extent[k].up);
      ceiling = centers[k] + extent[k].down + gap;
    }
  }
  const placed = new Array(entries.length).fill(null);
  const parts = [];
  extent.forEach((h, k) => {
    const e = entries[h.i];
    const t = e.target;
    // The ring is drawn whatever happens to the label: the mark is still the one the author named.
    parts.push(`<rect class="legend-target" data-mark-for="${t.mark}" x="${round(t.cx - t.w / 2 + 0.5)}" y="${round(t.cy - t.h / 2 + 0.5)}" width="${round(t.w - 1)}" height="${round(t.h - 1)}"/>`);
    if (centers[k] + h.down > bottom + 0.01) {
      noteLabelDrop(e.text, 'overlap');
      return;
    }
    const first = draft(e, centers[k]);
    const label = e.plate ? draft(e, centers[k], (first.left + first.right) / 2) : first;
    placed[h.i] = { entry: e, box: label };
    const route = (t.route || []).concat([[x - fontSize * 0.3, centers[k]]]);
    parts.push(`<polyline class="chart-leader legend-leader" points="${route.map(([px, py]) => `${round(px)},${round(py)}`).join(' ')}"/>`);
    if (e.plate) parts.push(plateSvg(e.plate, label, fontSize, e.color));
    parts.push(label.svg);
  });
  return { svg: `<g class="legend legend--anchored">${parts.join('')}</g>`, placed };
}

module.exports = { laneSvg, plateSvg, PLATE_CLASS, PLATE_PAD, LANE_GAP };
