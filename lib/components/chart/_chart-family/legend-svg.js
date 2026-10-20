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
 * The automatic color of each numbered label: the slot of its number (1 is c1), skipping the slots
 * an author has already given a label, so no two markers share a color while slots remain (13
 * labels with no color words wrap to c1 again). An author's own word always wins.
 * @param {object[]} ordered  the entries in number order
 * @returns {Array<number|string>} each entry's color, in the same order
 */
function markerColors(ordered) {
  const slot = (c) => Number(String(c).replace(/^c/, ''));
  const used = new Set(ordered.filter((e) => e.color != null).map((e) => slot(e.color)));
  const free = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((c) => !used.has(c));
  const pool = free.length ? free : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let next = 0;
  return ordered.map((e) => e.color ?? pool[next++ % pool.length]);
}

/**
 * One numbered marker centered on `(cx, cy)`: the knockout, the plate, the numeral.
 * @param {number} size   the numeral's size in viewBox units; the plate and knockout grow from it
 * @param {number|string} [color]  the plate's slot; the caller's automatic one when the entry has none
 * @returns {{svg: string, width: number, height: number}} the marker and its outer size
 */
function markerSvg(n, cx, cy, entry, size, mark, color = entry.color) {
  const shape = entry.plate || 'circle';
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
  const height = label.bottom - label.top + 2 * (size * PLATE_PAD.y + k);
  const width = Math.max(label.right - label.left + 2 * (pad + k), height);
  return { svg: `${knockout}${plate}${label.svg}`, width, height };
}

/**
 * How far a lane label's words start from the lane's edge: the widest marker any of these entries
 * will draw there (its number of digits and its shape), plus a gap. The caller sizing the lane asks
 * this same function, so the lane it reserves is the lane the labels use.
 */
function laneIndent(entries, fontSize) {
  const size = fontSize * MARKER_SCALE;
  const widest = entries.reduce((w, e) => Math.max(w, markerSvg(entries.length, 0, 0, e, size, 0).width), 0);
  return widest + fontSize * 0.4;
}

/** Where a marker may sit on or around its mark, in the order they are tried. */
function pinSpots(t, w, h) {
  const x0 = t.cx - t.w / 2;
  const x1 = t.cx + t.w / 2;
  const y0 = t.cy - t.h / 2;
  const y1 = t.cy + t.h / 2;
  const inside = w <= t.w && h <= t.h
    ? [[x0 + w / 2, y0 + h / 2], [x1 - w / 2, y0 + h / 2], [x0 + w / 2, y1 - h / 2], [x1 - w / 2, y1 - h / 2]]
    : [];
  // On a corner itself, the marker overhangs the gutter: tried when no inside corner is clear.
  return inside.concat([[x0, y0], [x1, y0], [x0, y1], [x1, y1]]);
}

const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Draw an anchored legend in a lane beside the figure.
 *
 * @param {object[]} entries  the legend's entries (lib/core/legend.js), each resolved by the caller:
 *        `{ ...entry, target: {cx, cy, w, h, mark} }` — the mark's center and size, and its
 *        `data-mark` index.
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
 * @param {number} [o.minMarkerSize] the smallest the marker on a mark may shrink to find a clear spot
 * @param {Array<{left: number, top: number, right: number, bottom: number}>} [o.avoid] boxes a
 *        marker on a mark must not cover: every value the figure prints, and its axis labels
 * @returns {{svg: string, placed: Array<{entry: object, box: object, n: number, pinned: boolean}|null>}}
 *          the group, and each entry's placed box, number, and whether its mark got a marker, in
 *          entry order (null where the label was dropped)
 */
function laneSvg(entries, { x, width, top, bottom, fontSize, maxLines = 3, markerSize = fontSize * MARKER_SCALE, minMarkerSize = markerSize, avoid = [] }) {
  if (!entries.length) return { svg: '', placed: [] };
  const gap = fontSize * LANE_GAP;
  // Reading order: row by row, then left to right, then as written.
  const order = entries.map((_, i) => i).sort((a, b) => entries[a].target.cy - entries[b].target.cy
    || entries[a].target.cx - entries[b].target.cx || a - b);
  const colors = markerColors(order.map((i) => entries[i]));
  const laneSize = fontSize * MARKER_SCALE;
  const indent = laneIndent(entries, fontSize);
  const markerColumn = indent - fontSize * 0.4;
  const height = markerSvg(order.length, 0, 0, {}, laneSize, 0).height;
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
    return { i, up: Math.max(-d.top, height / 2), down: Math.max(d.bottom, height / 2) };
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
  const taken = avoid.slice();
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
    const color = colors[k];
    const label = draft(e, centers[k]);
    // ON THE MARK, in the first spot clear of every printed value, every axis label and every marker
    // already placed: inside a corner, else on one, at full size, then at the floor size. Where no
    // spot is clear the marker is left off: the ring still marks the cell and the label still sits
    // level with its row, and a value is never covered.
    let pin = null;
    for (const size of markerSize > minMarkerSize ? [markerSize, minMarkerSize] : [markerSize]) {
      const m = markerSvg(n, 0, 0, e, size, t.mark, color);
      const spot = pinSpots(t, m.width, m.height).find(([cx, cy]) => {
        const box = { left: cx - m.width / 2, right: cx + m.width / 2, top: cy - m.height / 2, bottom: cy + m.height / 2 };
        return !taken.some((b) => hits(box, b));
      });
      if (spot) {
        pin = { size, cx: spot[0], cy: spot[1], w: m.width, h: m.height };
        break;
      }
    }
    if (pin) {
      taken.push({ left: pin.cx - pin.w / 2, right: pin.cx + pin.w / 2, top: pin.cy - pin.h / 2, bottom: pin.cy + pin.h / 2 });
      parts.push(markerSvg(n, pin.cx, pin.cy, e, pin.size, t.mark, color).svg);
    }
    placed[h.i] = { entry: e, box: label, n, pinned: !!pin };
    parts.push(markerSvg(n, x + markerColumn / 2, centers[k], e, laneSize, t.mark, color).svg);
    parts.push(label.svg);
  });
  return { svg: `<g class="legend legend--anchored">${rings.join('')}${parts.join('')}</g>`, placed };
}

module.exports = { laneSvg, laneIndent, plateSvg, markerSvg, PLATE_CLASS, PLATE_PAD, LANE_GAP };
