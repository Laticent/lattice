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
 * @param {Array<{text: string, detail?: string, plate?: string, color?: number, size?: string, mark: number}>} spec.callouts
 *        the notes, each with the index of its shape in `spec.ids`
 * @param {string[]} spec.ids  the shape ids, by index
 * @param {Record<string, {x: number, y: number, w: number, h: number, cx: number, cy: number}>} spec.nodes  the laid-out boxes
 * @param {{w: number, h: number}} spec.view  the laid-out figure
 * @param {'under'|'beside'} [spec.side]
 * @param {number} [spec.font]  the notes' size when the figure's own labels are not the key's size (a flowchart's)
 * @returns {{svg: string, w: number, h: number, drawn: number}|null} null when there is nothing to draw
 */
function placeCallouts({ callouts, ids, nodes, view, side = 'under', font }) {
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
  const plot = { x0: 0, y0: 0, x1: view.w, y1: view.h };
  const won = heavy.place(found, { view, plot, side: SIDE[side] || 'below', avoid, ...(font ? { laneFont: font } : {}) });
  return { svg: won.svg, w: won.w, h: won.h, drawn: won.drawn };
}

module.exports = { placeCallouts };
