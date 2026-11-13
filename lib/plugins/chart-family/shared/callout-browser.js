/**
 * callout-browser.js — callout placement for a chart the BROWSER lays out (flowchart, state chart).
 *
 * Those charts draw in a Trama pass (docs/src/lib/trama/pipeline.ts) after the layout has put every shape in
 * its place, so the shapes' boxes exist only there. The server half names each note's shape (`resolve` over
 * the shape names, the same reader as every chart) and carries the notes in the model payload; this does the
 * rest: ring each shape, set the notes under or beside the figure, and say how large the figure has become.
 *
 * One function, `placeCallouts`, over the same `place` the other seventeen charts call (HARD RULE #1). The
 * runtime bundles this file; the export's serialized bootstrap embeds the esbuild bundle of it
 * (tools/build-callout-browser.js), because that script cannot `require`.
 *
 * Pure JS, no DOM.
 */

const { pad } = require('./callout-geometry');
const heavy = require('./callout-place');

/** The author's `side=`: `under` (the default) sets the notes below the figure, `beside` to its right. */
const SIDE = { under: 'below', beside: 'right' };

/**
 * @param {object} spec
 * @param {Array<{text: string, detail?: string, plate?: string, color?: number, size?: string, mark: number, n?: number, shape?: string}>} spec.callouts
 *        the notes, each with the index of its shape in `spec.ids`; numbered (`n`, `shape`, `color`) when the server set
 *        them as a list outside the drawing
 * @param {string[]} spec.ids  the shape ids, by index
 * @param {Record<string, {x: number, y: number, w: number, h: number, cx: number, cy: number}>} spec.nodes  the laid-out boxes
 * @param {{w: number, h: number}} spec.view  the laid-out figure
 * @param {'under'|'beside'} [spec.side]
 * @param {number} [spec.font]  the notes' size when the figure's own labels are not the key's size (a flowchart's)
 * @param {number} [spec.label]  the figure's smallest name, uncapped: the markers' size when the notes are a list outside it
 * @param {Array<{cx: number, cy: number, w: number, h: number}>} [spec.labels]  the edge labels' boxes, which a marker beside a
 *        node must not cover
 * @param {Array<Array<{x: number, y: number}>>} [spec.lines]  the edges' routed points, which it must not cover either
 * @returns {{svg: string, w: number, h: number, drawn: number, dx?: number, dy?: number}|null} null when there is nothing
 *          to draw; `dx`/`dy` (markers only) is how far the caller shifts the rest of its paint, the markers having grown
 *          the drawing past its top or left edge
 */
function placeCallouts({ callouts, ids, nodes, view, side = 'under', font, label, labels = [], lines = [] }) {
  if (!callouts?.length) return null;
  const found = callouts.flatMap((e) => {
    const b = nodes[ids[e.mark]];
    return b ? [{ ...e, box: { cx: b.cx, cy: b.cy, w: b.w, h: b.h } }] : [];
  });
  if (!found.length) return null;
  const named = new Set(found.map((e) => e.mark));
  // What a marker must not cover: every shape the notes do not name.
  const avoid = ids.flatMap((id, i) => {
    const b = nodes[id];
    return b && !named.has(i) ? [pad({ left: b.x, right: b.x + b.w, top: b.y, bottom: b.y + b.h }, 0.5)] : [];
  });
  // ON A PHONE PAGE the server numbered the notes and set them as a list under the drawing (callout-place.js
  // `numberNotes`), so the notes do not shrink with the fit: only the markers are drawn here, on their shapes, with the
  // server's numbers, and the figure keeps its own size.
  // Any numbered note means the server set the list: a note the sanitizer stripped of its number is in that list too, so it
  // is never drawn again in a lane (it would print twice); it simply has no marker.
  const numbered = found.filter((e) => Number.isFinite(e.n));
  if (numbered.length) {
    // Clear of every node, its own included, every edge and every edge label. Sized from the
    // names' own size, uncapped (`label`): a marker beside a name reads at the name's scale.
    const all = ids.flatMap((id) => {
      const b = nodes[id];
      return b ? [pad({ left: b.x, right: b.x + b.w, top: b.y, bottom: b.y + b.h }, 0.5)] : [];
    });
    for (const l of labels) all.push(pad({ left: l.cx - l.w / 2, right: l.cx + l.w / 2, top: l.cy - l.h / 2, bottom: l.cy + l.h / 2 }, 0.5));
    // Each straight run of an edge, as a thin box (the routes are orthogonal, so a run's box is the run). `soft`: when no
    // spot clears every line, a marker may cross one before it would cover a name (legend-svg.js `pinMarkers`).
    for (const pts of lines) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        all.push({ ...pad({ left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) }, 2), soft: true });
      }
    }
    const m = heavy.marks(numbered, { view, avoid: all, laneFont: label || font });
    return { svg: m.svg, w: m.w, h: m.h, dx: m.dx, dy: m.dy, drawn: m.drawn };
  }
  const plot = { x0: 0, y0: 0, x1: view.w, y1: view.h };
  const won = heavy.place(found, { view, plot, side: SIDE[side] || 'below', avoid, ...(font ? { laneFont: font } : {}) });
  return { svg: won.svg, w: won.w, h: won.h, drawn: won.drawn };
}

module.exports = { placeCallouts };
