/**
 * legend-svg.js — the legend's SVG emitter, `anchored` layout: labels that name one mark each.
 *
 * Design: engineering/decisions/2026-10-19-universal-legend.md § 6. The model and its reader are
 * lib/core/legend.js; this is the SVG half of "one model, two emitters". It sits in the chart family
 * rather than lib/core because its back end is this folder's label kernel (`wrapSvgLabel`), and
 * lib/core may not import a component (.dependency-cruiser.cjs `core-no-component-imports`).
 *
 * THE FIRST STRATEGY IS A LANE OF NUMBERED LABELS, and the first caller is why. A heatmap has no
 * free space: every cell is filled and prints its number at its center, so a label set ON the grid
 * covers a number or a fill it cannot hold contrast against (and the canvas-color text halo that
 * would rescue it is dropped by the CLI's vector PDF writer, followups.d/2798-p1). So the words sit
 * in a lane beside the figure, on the canvas, and each is tied to its mark by a NUMBER: a small
 * marker pinned to the corner of the named mark, and the same marker before its words in the lane.
 *
 * A LINE WAS TRIED FIRST AND LOST (owner review, #2798). A leader from the lane into the grid must
 * either cross cells, covering values, or run in the gap between rows, where it vanishes against
 * the canvas-colored gutter; and two callouts on one row put two leaders in the same gap, where
 * they merge. A number crosses nothing, and it stays unambiguous however many labels share a row.
 *
 * THE MARKER IS THE LABEL'S PLATE. The pill vocabulary (`circle`, `tag`, `c4`, …) styles it, so an
 * author colors and shapes it with the words a pill takes; with none, it is a `circle` in the color
 * slot of its number, so the markers are told apart by color as well as by digit. Its size is the
 * caller's, from its marks (`markerSize`), so it follows the figure's density; the lane's copy is
 * sized from the label it leads, as a pill is from the text around it. Every marker
 * on the figure sits on a KNOCKOUT, the same shape a little larger in the canvas color, so it parts
 * from whatever fill is under it in either mode. The knockout is a filled shape, not a text stroke,
 * so the PDF writer keeps it.
 *
 * Numbers run in reading order (row by row, then left to right), and the lane lists the labels in
 * that order, each level with its mark where the stack allows.
 *
 * GESTURE TIER 1 (§ 8). A label carries `data-mark-for` naming its mark, so hover and tap open the
 * mark's card through chart-interact.js with no new code. It never carries `data-mark`: that would
 * shift the popover's index map.
 *
 * A label the lane cannot hold is DROPPED and reported (label-drops.js, `overlap`), never drawn over
 * another, and its marker is not drawn either: a number with no words would be a dangling key.
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
function plateSvg(shape, box, fontSize, color, className = null) {
  if (!PLATE_CLASS[shape]) return '';
  const cls = className || PLATE_CLASS[shape];
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
  // Capped, so a tall plate's point stays a point and not a spike.
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

/** The marker's numeral, as a fraction of the label size, when the caller does not size it. */
const MARKER_SCALE = 0.82;

/** How far the knockout reaches past the marker, as a fraction of the numeral size. */
const KNOCKOUT = 0.2;

/**
 * A marker's color: the author's slot, else the slot of its number (1 is c1, 13 is c1 again), so
 * the numbers are told apart by color as well as by digit, and a label and its cell share one.
 */
const markerColor = (entry, n) => entry.color ?? ((n - 1) % 12) + 1;

/**
 * One numbered marker centered on `(cx, cy)`: the knockout, the plate, the numeral.
 * @param {number} size  the numeral's size in viewBox units; the plate and knockout grow from it
 * @returns {{svg: string, width: number, height: number}} the marker and its outer size
 */
function markerSvg(n, cx, cy, entry, size, mark) {
  const shape = entry.plate || 'circle';
  const color = markerColor(entry, n);
  const label = wrapSvgLabel(String(n), {
    x: cx,
    y: cy,
    width: size * 4,
    fontSize: size,
    anchor: 'middle',
    baseline: 'middle',
    vAlign: 'middle',
    maxLines: 1,
    className: 'legend-text legend-text--plated legend-number',
    attrs: `${colorAttr(color)} data-mark-for="${mark}" aria-hidden="true"`,
  });
  const k = size * KNOCKOUT;
  const grown = { left: label.left - k, right: label.right + k, top: label.top - k, bottom: label.bottom + k };
  const plate = plateSvg(shape, label, size, color);
  const knockout = plateSvg(shape, grown, size, null, 'legend-knockout');
  // The outer size, from the knockout's own geometry: wide enough for the widest shape's points.
  const pad = size * PLATE_PAD.x + (['chevron-left', 'chevron-right', 'diamond'].includes(shape) ? size * TIP : 0);
  const width = Math.max(label.right - label.left + 2 * (pad + k), label.bottom - label.top + 2 * (size * PLATE_PAD.y + k));
  return { svg: `${knockout}${plate}${label.svg}`, width, height: label.bottom - label.top + 2 * (size * PLATE_PAD.y + k) };
}

/**
 * Draw an anchored legend in a lane beside the figure.
 *
 * @param {object[]} entries  the legend's entries (lib/core/legend.js), each resolved by the caller:
 *        `{ ...entry, target: {cx, cy, w, h, mark, clear} }` — the mark's center and size, and its
 *        `data-mark` index — and `clear: {w, h}`, the box of anything printed at the mark's center
 *        that the marker must not cover. The marker is pinned to the mark's top-left corner.
 * @param {object} o
 * @param {number} o.x          the lane's left edge
 * @param {number} o.width      the lane's width; a label wraps to it
 * @param {number} o.top        the highest a label may sit
 * @param {number} o.bottom     the lowest a label may reach
 * @param {number} o.fontSize   the label size in viewBox units, emitted as an attribute
 * @param {number} [o.maxLines] lines a label may wrap to before it ellipsizes
 * @param {number} [o.markerSize] the numeral size of the marker ON a mark; the caller sizes it from
 *        its marks, so it grows and shrinks with the figure's density (the heatmap: from its cell).
 *        The marker in the lane is sized from the label beside it, as a pill is from its text.
 * @returns {{svg: string, placed: Array<{entry: object, box: object, n: number}|null>}} the group,
 *          and each entry's placed box and number in entry order (null where it was dropped)
 */
function laneSvg(entries, { x, width, top, bottom, fontSize, maxLines = 3, markerSize = fontSize * MARKER_SCALE }) {
  if (!entries.length) return { svg: '', placed: [] };
  const gap = fontSize * LANE_GAP;
  // Reading order: row by row, then left to right, then as written.
  const order = entries.map((_, i) => i).sort((a, b) => entries[a].target.cy - entries[b].target.cy
    || entries[a].target.cx - entries[b].target.cx || a - b);
  const laneSize = fontSize * MARKER_SCALE;
  const sample = markerSvg(order.length, 0, 0, {}, laneSize, 0);
  const pin = markerSvg(order.length, 0, 0, {}, markerSize, 0);
  const indent = sample.width + fontSize * 0.4;
  const draft = (e, cy) => wrapSvgLabel(e.text, {
    x: x + indent,
    y: cy,
    width: width - indent,
    fontSize,
    anchor: 'start',
    baseline: 'middle',
    vAlign: 'middle',
    maxLines,
    className: 'legend-text legend-text--bare',
    attrs: ` data-mark-for="${e.target.mark}" data-anima-role="label"`,
  });
  // Each label starts level with its mark and is pushed down only as far as the label above it
  // needs; a stack that runs off the bottom slides up as one.
  const extent = order.map((i) => {
    const d = draft(entries[i], 0);
    const half = sample.height / 2;
    return { i, up: Math.max(-d.top, half), down: Math.max(d.bottom, half) };
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
  const rings = [];
  const parts = [];
  let n = 0;
  extent.forEach((h, k) => {
    const e = entries[h.i];
    const t = e.target;
    // The ring is drawn whatever happens to the label: the mark is still the one the author named.
    rings.push(`<rect class="legend-target" data-mark-for="${t.mark}" x="${round(t.cx - t.w / 2 + 0.5)}" y="${round(t.cy - t.h / 2 + 0.5)}" width="${round(t.w - 1)}" height="${round(t.h - 1)}"/>`);
    if (centers[k] + h.down > bottom + 0.01) {
      noteLabelDrop(e.text, 'overlap');
      return;
    }
    n += 1;
    const label = draft(e, centers[k]);
    placed[h.i] = { entry: e, box: label, n };
    // On the mark: inside its top-left corner when that keeps clear of the value printed at its
    // center, else centered ON the corner, where it overhangs the gutter and leaves the value whole.
    const r = pin.height / 2;
    const room = Math.max(t.w / 2 - (t.clear?.w || 0) / 2, t.h / 2 - (t.clear?.h || 0) / 2);
    const inset = room >= 2 * r + fontSize * 0.2 ? r : 0;
    parts.push(markerSvg(n, t.cx - t.w / 2 + inset, t.cy - t.h / 2 + inset, e, markerSize, t.mark).svg);
    parts.push(markerSvg(n, x + sample.width / 2, centers[k], e, laneSize, t.mark).svg);
    parts.push(label.svg);
  });
  return { svg: `<g class="legend legend--anchored">${rings.join('')}${parts.join('')}</g>`, placed };
}

module.exports = { laneSvg, plateSvg, markerSvg, PLATE_CLASS, PLATE_PAD, LANE_GAP };
