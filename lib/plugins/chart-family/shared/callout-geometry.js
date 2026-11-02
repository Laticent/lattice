/**
 * callout-geometry.js — the leaf of the callout layer: constants and the small pure functions about boxes and
 * names that every other half uses. It imports one thing (`svg-label`'s advance), so the export's browser
 * placer (callout-browser.js) carries it without the Segno reader that `callout-core.js`'s `lift` needs.
 *
 * Pure JS, no DOM, no font metrics (HARD RULE #1): both render paths bundle this file.
 */

const { ADVANCE } = require('./svg-label');

/** The smallest a callout's words set, in viewBox units: the floor the lane steps down to. */
const FS_FLOOR = 7.5;

/** The space between a figure and its lane (or the notes under it), in viewBox units. */
const LANE_PAD = 5;

/** The least a callout marker is tall, in viewBox units: the floor that keeps the shape a shape. */
const MARKER_MIN_HEIGHT = 3.8;

/** A text's box, for an `avoid` list: `anchor` is start | middle | end, `vAlign` bottom | middle | hanging. */
function textBox({ x, y, text, fontSize, anchor = 'middle', vAlign = 'bottom', advance = ADVANCE }) {
  const w = String(text).length * fontSize * advance;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const top = vAlign === 'bottom' ? y - fontSize : vAlign === 'middle' ? y - fontSize / 2 : y;
  return { left, right: left + w, top, bottom: top + fontSize };
}

/**
 * A stretch of line as a run of small boxes, for an `avoid` list: a marker must clear the line itself, and
 * the line's one bounding box (which a diagonal fills with empty corners) would turn every spot near its
 * middle away. `thickness` is the line's weight plus a little air.
 */
function lineBoxes(a, b, { thickness = 1.6, step = 3 } = {}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  const h = thickness / 2;
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    return { left: x - h, right: x + h, top: y - h, bottom: y + h };
  });
}

/** The box padded by `p` on every side. */
const pad = (b, p) => ({ left: b.left - p, right: b.right + p, top: b.top - p, bottom: b.bottom + p });

/** The boxes of a figure's gutters, outside its plot, where its axis names print. `sides` names the
 *  gutters that hold something: a chart whose right and top gutters are empty lets a marker use them. */
function gutterBoxes(plot, { margin = 0.5, sides = ['left', 'right', 'top', 'bottom'] } = {}) {
  const all = {
    left: { left: -Infinity, right: plot.x0 - margin, top: -Infinity, bottom: Infinity },
    right: { left: plot.x1 + margin, right: Infinity, top: -Infinity, bottom: Infinity },
    top: { left: -Infinity, right: Infinity, top: -Infinity, bottom: plot.y0 - margin },
    bottom: { left: -Infinity, right: Infinity, top: plot.y1 + margin, bottom: Infinity },
  };
  return sides.map((s) => all[s]);
}

/**
 * Read `for=` as a name or an index over a list of mark names: a number is the index, a string is a
 * name compared without case or extra spaces. Returns the index, or -1.
 */
function matchName(target, names) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const t = String(target ?? '').trim();
  if (/^\d+$/.test(t)) return Number(t) < names.length ? Number(t) : -1;
  return names.findIndex((n) => norm(n) === norm(t));
}

module.exports = {
  FS_FLOOR, LANE_PAD, MARKER_MIN_HEIGHT, textBox, lineBoxes, pad, gutterBoxes, matchName,
};
