/**
 * legend-svg.js — the legend's SVG emitter, both of its layouts: `anchored` (labels that name one
 * mark each, `laneSvg`) and `key` (a swatch-and-label list beside or below the figure, `keySvg`).
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
 * THE MARKER IS A SHAPE AND A COLOR, AND THE DIGIT RIDES INSIDE WHEN THERE IS ROOM (design note
 * § 18). Callouts take six shapes in number order (circle, square, triangle, diamond, hexagon, star),
 * one each, and a color slot each, so a marker is matched to its label by shape and color and never
 * by color or position alone (WCAG 1.4.1). On a grid whose values fill their cells the digit has no
 * room, and the shape alone marks the cell: an outline stays recognizable at a size a numeral does
 * not. An author's pill word picks the shape it looks like (`circle`, `tag` is the square, `diamond`),
 * and a color word the color. Its size is the caller's, from its marks (`markerSize`), so it follows
 * the figure's density; the lane's copy, digit and all, is sized from the label it leads. Every marker
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
// The `key` layout, re-exported so the emitter has one front door. It lives in a file of its own for
// the reason lib/core/legend-key.js does: the eight charts that draw only a key import it directly,
// and none of them should carry the lane code below in its kernel.
const { keySvg } = require('./legend-svg-key');
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
 * The plate behind a placed label, from its measured box. Callout markers stopped using it when they
 * became the six shapes (design note § 18); it stays as the SVG twin of the pill plate, for the labels
 * the `key` and `along-path` layouts will set on one (§ 6). Shapes follow the pill's: a capsule, a
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
 * THE SIX MARKER SHAPES, in the order callouts take them (design note § 18). A callout is tied to its
 * mark by shape AND color, never by color alone (WCAG 1.4.1), and the digit rides inside the shape
 * only where the mark has room for it: on a grid whose values fill their cells, the shape still fits
 * where a digit cannot, because a filled outline stays recognizable at a size a numeral does not.
 * Six because about that many shapes are told apart at a glance at marker size, and a chart with
 * more callouts than that is making more points than one slide should (lib/core/legend.js
 * `MAX_ANCHORED`). Every pair differs in outline: there is no rectangle, which reads as the square.
 */
const MARKER_SHAPES = Object.freeze(['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star']);

/** A pill shape word an author gave a callout, read as the marker shape it looks like. */
const SHAPE_OF_PLATE = Object.freeze({
  circle: 'circle', pill: 'circle', tag: 'square', 'tag-bordered': 'square', chip: 'square', diamond: 'diamond',
});

/**
 * Each shape's outer radius per unit of numeral size: sized so a one-digit numeral sits inside the
 * shape's inscribed circle (a triangle's and a star's are half their outer radius, so they draw
 * larger to hold the same digit).
 */
const SHAPE_R = Object.freeze({ circle: 0.72, square: 0.86, triangle: 1.1, diamond: 1, hexagon: 0.8, star: 1.2 });

/**
 * The same, for a shape drawn WITHOUT its digit: sized so every shape stands about as tall as the
 * circle, since nothing has to fit inside it. That is what lets a triangle or a star fit the thin
 * band a crowded grid leaves between its rows of values.
 */
const SHAPE_R_BARE = Object.freeze({ circle: 0.72, square: 0.86, triangle: 0.92, diamond: 0.72, hexagon: 0.8, star: 0.8 });

/**
 * Each shape's inscribed radius as a fraction of its outer one. The knockout grows the outer radius by
 * the knockout's width over this, so the canvas-color edge thickens along a triangle's slanted side
 * toward a circle's: grown by the width alone, a triangle's edge came out three-eighths as thick…
 */
const SHAPE_INSET = Object.freeze({ circle: 1, square: Math.SQRT1_2, triangle: 0.5, diamond: Math.SQRT1_2, hexagon: Math.sqrt(3) / 2, star: 0.5 });

/**
 * …held at 0.8, a compromise that was measured. The full correction (a triangle's and a star's
 * outer radius grown by twice the width) makes those knockouts large enough that, on a ten-row grid of
 * four-digit values, three of six shapes lost their spot. At 0.8 all six keep it, and a triangle's
 * slanted edge is five-eighths as thick as a circle's rather than three-eighths.
 */
const KNOCKOUT_INSET_MIN = 0.8;

/** A star's inner radius, as a fraction of its outer one: round enough to hold a digit. */
const STAR_INNER = 0.55;

/**
 * Each entry's marker shape, in number order: an author's pill word claims its shape when no earlier
 * callout has, and every other callout takes the next shape not yet used, so no two markers share
 * one while shapes remain.
 * @param {object[]} ordered  the entries in number order
 * @returns {string[]} each entry's shape, in the same order
 */
function markerShapes(ordered) {
  const used = new Set();
  const asked = ordered.map((e) => {
    const s = SHAPE_OF_PLATE[e.plate];
    if (!s || used.has(s)) return null;
    used.add(s);
    return s;
  });
  const free = MARKER_SHAPES.filter((s) => !used.has(s));
  let next = 0;
  return asked.map((s) => s || free[next++ % Math.max(free.length, 1)] || MARKER_SHAPES[0]);
}

/**
 * A shape's outline around `(cx, cy)` at outer radius `r`, and the point its digit centers on. Every
 * shape is centered on its own bounding box, so a marker placed by its box sits where it was put; a
 * triangle's and a star's digit sit below that center, on the shape's own middle.
 */
function shapeOutline(shape, cx, cy, r) {
  const pts = (list) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
  const ring = (n, radius, start, ox, oy) => Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n;
    return [ox + radius(i) * Math.cos(a), oy + radius(i) * Math.sin(a)];
  });
  if (shape === 'circle') return { el: (attrs) => `<circle${attrs} cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}"/>`, w: 2 * r, h: 2 * r, dy: 0 };
  if (shape === 'square') {
    const h = r * Math.SQRT1_2;
    return { el: (attrs) => `<rect${attrs} x="${round(cx - h)}" y="${round(cy - h)}" width="${round(2 * h)}" height="${round(2 * h)}"/>`, w: 2 * h, h: 2 * h, dy: 0 };
  }
  if (shape === 'diamond') return { el: (attrs) => `<polygon${attrs} points="${pts([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]])}"/>`, w: 2 * r, h: 2 * r, dy: 0 };
  if (shape === 'hexagon') {
    const p = ring(6, () => r, 0, cx, cy);
    return { el: (attrs) => `<polygon${attrs} points="${pts(p)}"/>`, w: 2 * r, h: r * Math.sqrt(3), dy: 0 };
  }
  if (shape === 'triangle') {
    // An equilateral triangle spans r above its middle and r/2 below: its middle sits r/4 below the box's.
    const oy = cy + r / 4;
    const p = ring(3, () => r, -Math.PI / 2, cx, oy);
    return { el: (attrs) => `<polygon${attrs} points="${pts(p)}"/>`, w: r * Math.sqrt(3), h: 1.5 * r, dy: r / 4 };
  }
  // The star: five points, its lowest tips cos 36° of r below its middle.
  const low = r * Math.cos(Math.PI / 5);
  const oy = cy + (r - low) / 2;
  const p = ring(10, (i) => (i % 2 ? r * STAR_INNER : r), -Math.PI / 2, cx, oy);
  return { el: (attrs) => `<polygon${attrs} points="${pts(p)}"/>`, w: 2 * r * Math.sin((2 * Math.PI) / 5), h: r + low, dy: (r - low) / 2 };
}

/**
 * One marker centered on `(cx, cy)`: the knockout, the shape, and the numeral when `digit` is set.
 * @param {string} shape  one of MARKER_SHAPES
 * @param {number} size   the numeral's size in viewBox units; the shape and knockout grow from it
 * @param {number|string} [color]  the shape's slot
 * @param {boolean} [digit]  draw the numeral; a marker without it is the shape alone
 * @returns {{svg: string, width: number, height: number}} the marker and its outer size
 */
function markerSvg(n, cx, cy, shape, size0, mark, color, digit = true) {
  // NO WIDER THAN THE CIRCLE. A triangle or a star drawn large enough to hold its digit is wider than
  // the circle, and the lane reserves its widest marker: on a crowded grid those few units come out of
  // the cells, and a four-digit value that fit no longer does. So a wider shape scales down, digit and
  // all, to the circle's width.
  const fit = digit ? Math.min(1, (2 * SHAPE_R.circle) / (shapeOutline(shape, 0, 0, 1).w * SHAPE_R[shape])) : 1;
  const size = size0 * fit;
  const r = size * (digit ? SHAPE_R : SHAPE_R_BARE)[shape];
  const k = size0 * KNOCKOUT;
  const knockout = shapeOutline(shape, cx, cy, r + k / Math.max(SHAPE_INSET[shape], KNOCKOUT_INSET_MIN));
  const body = shapeOutline(shape, cx, cy, r);
  const own = ` data-shape="${shape}" data-mark-for="${mark}" aria-hidden="true"`;
  let svg = knockout.el(' class="legend-knockout"') + body.el(` class="legend-plate"${colorAttr(color)}${own}`);
  if (digit) {
    svg += wrapSvgLabel(String(n), {
      x: cx,
      y: cy + body.dy,
      width: size * 4,
      fontSize: size,
      anchor: 'middle',
      baseline: 'middle',
      vAlign: 'middle',
      maxLines: 1,
      className: 'legend-text legend-text--plated legend-number',
      attrs: `${colorAttr(color)} data-mark-for="${mark}" aria-hidden="true"`,
    }).svg;
  }
  return { svg, width: knockout.w, height: knockout.h };
}

/**
 * How far a lane label's words start from the lane's edge: the widest marker the lane may draw (any
 * of the six shapes, with its digit), plus a gap. The caller sizing the lane asks this same function,
 * so the lane it reserves is the lane the labels use.
 */
function laneIndent(_entries, fontSize) {
  const size = fontSize * MARKER_SCALE;
  const widest = MARKER_SHAPES.reduce((w, s) => Math.max(w, markerSvg(1, 0, 0, s, size, 0).width), 0);
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
  // On a corner itself, the marker overhangs the gutter: tried when no inside corner is clear. Last,
  // the middle of the top and bottom edges: on a grid whose values fill their cells' width, the only
  // clear space is the band between one row's values and the next.
  return inside.concat([[x0, y0], [x1, y0], [x0, y1], [x1, y1], [t.cx, y0], [t.cx, y1]]);
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
function laneSvg(entries, { x, width, top, bottom, fontSize, maxLines = 3, markerSize = fontSize * MARKER_SCALE, minMarkerSize = markerSize, minShapeSize = minMarkerSize, avoid = [] }) {
  if (!entries.length) return { svg: '', placed: [] };
  const gap = fontSize * LANE_GAP;
  // Reading order: row by row, then left to right, then as written.
  const order = entries.map((_, i) => i).sort((a, b) => entries[a].target.cy - entries[b].target.cy
    || entries[a].target.cx - entries[b].target.cx || a - b);
  const colors = markerColors(order.map((i) => entries[i]));
  const shapes = markerShapes(order.map((i) => entries[i]));
  const laneSize = fontSize * MARKER_SCALE;
  const indent = laneIndent(entries, fontSize);
  const markerColumn = indent - fontSize * 0.4;
  const height = MARKER_SHAPES.reduce((h, sh) => Math.max(h, markerSvg(1, 0, 0, sh, laneSize, 0).height), 0);
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
    // already placed: inside a corner, else on one, else mid-edge. First with its digit, at full size and
    // then at the floor size; then the shape alone at its own floor, smaller, because an outline reads
    // where a numeral does not. Shape and color tie it to its label either
    // way, and the label leads with the same marker, digit and all. Where even the shape finds no clear
    // spot, the ring alone marks the cell and the label sits level with its row; a value is never covered.
    const shape = shapes[k];
    const tries = [[markerSize, true], [minMarkerSize, true], [minShapeSize, false]]
      .filter(([size, digit], i, all) => all.findIndex(([s2, d2]) => s2 === size && d2 === digit) === i);
    let pin = null;
    for (const [size, digit] of tries) {
      const m = markerSvg(n, 0, 0, shape, size, t.mark, color, digit);
      const spot = pinSpots(t, m.width, m.height).find(([cx, cy]) => {
        const box = { left: cx - m.width / 2, right: cx + m.width / 2, top: cy - m.height / 2, bottom: cy + m.height / 2 };
        return !taken.some((b) => hits(box, b));
      });
      if (spot) {
        pin = { size, digit, cx: spot[0], cy: spot[1], w: m.width, h: m.height };
        break;
      }
    }
    if (pin) {
      taken.push({ left: pin.cx - pin.w / 2, right: pin.cx + pin.w / 2, top: pin.cy - pin.h / 2, bottom: pin.cy + pin.h / 2 });
      parts.push(markerSvg(n, pin.cx, pin.cy, shape, pin.size, t.mark, color, pin.digit).svg);
    }
    placed[h.i] = { entry: e, box: label, n, shape, pinned: !!pin, digit: !!pin?.digit };
    parts.push(markerSvg(n, x + markerColumn / 2, centers[k], shape, laneSize, t.mark, color).svg);
    parts.push(label.svg);
  });
  return { svg: `<g class="legend legend--anchored">${rings.join('')}${parts.join('')}</g>`, placed };
}

module.exports = { laneSvg, laneIndent, keySvg, plateSvg, markerSvg, markerShapes, MARKER_SHAPES, PLATE_CLASS, PLATE_PAD, LANE_GAP };
