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
 * and a color word the color. Its height is the caller's, from its marks (`markerHeight`), so it
 * follows the figure's density, and every marker on a figure shares one height, one spot (inside the
 * mark's top-left corner, or a badge offset from it) and one choice of digit (`pinMarkers`); the
 * lane's copy carries a digit as large as the label it leads. Every marker
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

/**
 * A marker is sized by its HEIGHT, the size a reader sees: the caller passes the height its marks
 * allow (the heatmap, a share of its cell; the lane, the label's size), and every shape is drawn to
 * look that tall. Its digit is set from the height by one ratio, the diamond's: the digit's cap height
 * is a little under two-fifths of the shape's height in every shape, the padding that made the diamond
 * read best in the owner's review (design note § 18). A square is drawn a touch smaller than its box
 * and a triangle or star a touch larger, because that is how they look the same size.
 */
const DIGIT_OF_HEIGHT = 1 / 1.84;

/**
 * Each shape's drawn height as a share of the marker's height: equal heights read as unequal sizes, so
 * a square, which fills its box, is drawn a little shorter, and a triangle, a diamond and a star, which
 * fill theirs least, a little taller. Every shape still holds its digit at the same size.
 */
const SHAPE_HEIGHT = Object.freeze({ circle: 1, square: 0.88, triangle: 1.06, diamond: 1.06, hexagon: 0.96, star: 1.06 });

/** How far the knockout reaches past the marker, as a fraction of its digit size. */
const KNOCKOUT = 0.2;

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

/** A star's inner radius, as a fraction of its outer one: plump enough to hold a readable digit. */
const STAR_INNER = 0.62;

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
 * One marker centered on `(cx, cy)`: the knockout, the shape, and the digit when `digit` is set.
 * @param {string} shape  one of MARKER_SHAPES
 * @param {number} height the marker's height as a reader sees it, in viewBox units
 * @param {number|string} [color]  the shape's slot
 * @param {boolean} [digit]  draw the digit; a marker without it is the shape alone, filled solid
 * @returns {{svg: string, width: number, height: number}} the marker and its outer size, knockout included
 */
function markerSvg(n, cx, cy, shape, height, mark, color, digit = true) {
  const d = height * DIGIT_OF_HEIGHT;
  const r = (height * SHAPE_HEIGHT[shape]) / shapeOutline(shape, 0, 0, 1).h;
  const k = d * KNOCKOUT;
  const knockout = shapeOutline(shape, cx, cy, r + k / Math.max(SHAPE_INSET[shape], KNOCKOUT_INSET_MIN));
  const body = shapeOutline(shape, cx, cy, r);
  // Every marker is one solid shape in its slot's strong tone, with or without its digit, on a mark or
  // in the lane, so the two copies of a callout's marker are the same color (legend.styles.css).
  const own = ` data-shape="${shape}" data-mark-for="${mark}" aria-hidden="true"`;
  let svg = knockout.el(' class="legend-knockout"') + body.el(` class="legend-plate"${colorAttr(color)}${own}`);
  if (digit) {
    // CENTERED ON THE DIGIT'S OWN HEIGHT (`central`), not on half the lowercase height (`middle`):
    // digits stand as tall as capitals, and `middle` set them a tenth of their size high, measured. A
    // triangle's and a star's digit sit halfway between the shape's middle and its box's, where the
    // eye reads the middle of a shape with a point on top.
    svg += wrapSvgLabel(String(n), {
      x: cx,
      y: cy + body.dy / 2,
      width: d * 4,
      fontSize: d,
      anchor: 'middle',
      baseline: 'central',
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
 * of the six shapes, at the label's height), plus a gap. The caller sizing the lane asks this same
 * function, so the lane it reserves is the lane the labels use.
 */
function laneIndent(_entries, fontSize) {
  const widest = MARKER_SHAPES.reduce((w, s) => Math.max(w, markerSvg(1, 0, 0, s, laneHeight(fontSize), 0).width), 0);
  return widest + fontSize * 0.4;
}

/** The lane marker's height: its digit as large as the label beside it. */
const laneHeight = (fontSize) => fontSize / DIGIT_OF_HEIGHT;

/**
 * Where a marker may sit on its mark, in the order tried, and nothing else (owner, § 18): whole inside
 * the mark's top-left corner; a badge offset up and left of it, two-thirds on the mark; or a badge
 * centered where the gutters cross at that corner (the caller passes its gutter as `target.gutter`),
 * because a crowded grid's only clear space is the band between one row's values and the next, and
 * that band is centered on the gutter. A marker never sits on another corner or along an edge, where
 * its knockout would cut the mark's border at a point that changes from cell to cell.
 */
const PIN_INSET = 1;
function pinSpots(t, w, h) {
  const x0 = t.cx - t.w / 2;
  const y0 = t.cy - t.h / 2;
  return {
    inside: w + 2 * PIN_INSET <= t.w && h + 2 * PIN_INSET <= t.h ? [x0 + PIN_INSET + w / 2, y0 + PIN_INSET + h / 2] : null,
    badge: [x0 + w / 6, y0 + h / 6],
    corner: [x0 - (t.gutter || 0) / 2, y0 - (t.gutter || 0) / 2],
  };
}

const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Where each marker sits ON its mark, decided for the figure as a whole (owner, § 18): one size, one
 * spot and one choice of digit for every marker, so no marker jumps or shrinks against its neighbors.
 * The first setup that places EVERY marker clear of everything it must avoid wins, tried in this order:
 * the digit whole inside the top-left corner, then on a badge offset from it, then on a badge at the
 * gutters' crossing; then the shape alone, in the same three places. Failing all six, the height steps down a tenth at a time to
 * the floor. Where even the floor places some markers and not others, the setup that places the most
 * is kept and the rest keep their ring alone; a value is never covered.
 */
function pinMarkers(items, { markerHeight, minMarkerHeight, minDigit, avoid }) {
  const setups = [[true, 'inside'], [true, 'badge'], [true, 'corner'], [false, 'inside'], [false, 'badge'], [false, 'corner']];
  const heights = [];
  for (let f = 1; markerHeight * f > minMarkerHeight + 1e-9; f -= 0.1) heights.push(markerHeight * f);
  heights.push(minMarkerHeight);
  const attempt = (height, digit, spot) => {
    const taken = avoid.slice();
    return items.map((it) => {
      const m = markerSvg(it.n, 0, 0, it.shape, height, it.e.target.mark, it.color, digit);
      const at = pinSpots(it.e.target, m.width, m.height)[spot];
      if (!at) return null;
      const box = { left: at[0] - m.width / 2, right: at[0] + m.width / 2, top: at[1] - m.height / 2, bottom: at[1] + m.height / 2 };
      if (taken.some((b) => hits(box, b))) return null;
      taken.push(box);
      return { cx: at[0], cy: at[1], height, digit };
    });
  };
  let best = items.map(() => null);
  for (const height of heights) {
    for (const [digit, spot] of setups) {
      if (digit && height * DIGIT_OF_HEIGHT < minDigit) continue;
      const pins = attempt(height, digit, spot);
      if (pins.every(Boolean)) return pins;
      if (pins.filter(Boolean).length > best.filter(Boolean).length) best = pins;
    }
  }
  return best;
}

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
 * @param {number} [o.markerHeight] the height of the marker ON a mark; the caller sizes it from its
 *        marks, so it grows and shrinks with the figure's density (the heatmap: from its cell). The
 *        marker in the lane is as tall as the label beside it needs.
 * @param {number} [o.minMarkerHeight] the smallest the markers on the marks may shrink to fit
 * @param {number} [o.minDigit] the smallest digit worth printing on a mark; below it the shape goes alone
 * @param {Array<{left: number, top: number, right: number, bottom: number}>} [o.avoid] boxes a
 *        marker on a mark must not cover: every value the figure prints, and its axis labels
 * @returns {{svg: string, placed: Array<{entry: object, box: object, n: number, shape: string, pinned: boolean, digit: boolean}|null>}}
 *          the group, and each entry's placed box, number, shape, and whether its mark got a marker
 *          and whether that marker carries its digit, in entry order (null where the label was dropped)
 */
function laneSvg(entries, { x, width, top, bottom, fontSize, maxLines = 3, markerHeight = laneHeight(fontSize), minMarkerHeight = markerHeight, minDigit = 0, avoid = [] }) {
  if (!entries.length) return { svg: '', placed: [] };
  const gap = fontSize * LANE_GAP;
  // Reading order: row by row, then left to right, then as written.
  const order = entries.map((_, i) => i).sort((a, b) => entries[a].target.cy - entries[b].target.cy
    || entries[a].target.cx - entries[b].target.cx || a - b);
  const colors = markerColors(order.map((i) => entries[i]));
  const shapes = markerShapes(order.map((i) => entries[i]));
  const laneSize = laneHeight(fontSize);
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
  const rings = [];
  const drawn = []; // [k, entry, number], in number order: the labels the lane holds
  let n = 0;
  extent.forEach((h, k) => {
    const e = entries[h.i];
    const t = e.target;
    // The ring is drawn whatever happens to the label: the mark is still the one the author named.
    // In the callout's own color, on a halo of the canvas color so it reads on any fill, the way a
    // marker reads on its knockout (owner, § 18): the cell, its marker and its label carry one color.
    const ring = `x="${round(t.cx - t.w / 2 + 0.5)}" y="${round(t.cy - t.h / 2 + 0.5)}" width="${round(t.w - 1)}" height="${round(t.h - 1)}"`;
    rings.push(`<rect class="legend-target-halo" ${ring}/><rect class="legend-target"${colorAttr(colors[k])} data-mark-for="${t.mark}" ${ring}/>`);
    if (centers[k] + h.down > bottom + 0.01) {
      noteLabelDrop(e.text, 'overlap');
      return;
    }
    n += 1;
    drawn.push([k, e, n]);
  });
  const pins = pinMarkers(drawn.map(([k, e, num]) => ({ k, e, n: num, shape: shapes[k], color: colors[k] })), { markerHeight, minMarkerHeight, minDigit, avoid });
  const parts = [];
  drawn.forEach(([k, e, num], at) => {
    const t = e.target;
    const pin = pins[at];
    const label = draft(e, centers[k]);
    if (pin) parts.push(markerSvg(num, pin.cx, pin.cy, shapes[k], pin.height, t.mark, colors[k], pin.digit).svg);
    placed[extent[k].i] = { entry: e, box: label, n: num, shape: shapes[k], pinned: !!pin, digit: !!pin?.digit };
    parts.push(markerSvg(num, x + markerColumn / 2, centers[k], shapes[k], laneSize, t.mark, colors[k]).svg);
    parts.push(label.svg);
  });
  return { svg: `<g class="legend legend--anchored">${rings.join('')}${parts.join('')}</g>`, placed };
}

module.exports = { laneSvg, laneIndent, laneHeight, keySvg, plateSvg, markerSvg, markerShapes, MARKER_SHAPES, DIGIT_OF_HEIGHT, PLATE_CLASS, PLATE_PAD, LANE_GAP };
