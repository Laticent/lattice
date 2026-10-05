/* Mermaid portrait reorientation.
 *
 * A left-to-right flowchart shrinks to fit a portrait slide's width and then
 * floats as a thin strip in the tall frame (its own SVG text goes tiny — Mermaid
 * sizes that itself, so --canvas-scale can't help). Reorienting the graph to
 * top-to-bottom lets it flow DOWN the tall canvas and fill it. We rewrite only
 * the flow DIRECTION token, so the diagram is unchanged on landscape and the
 * author's source still reads naturally.
 *
 * Scope, deliberately narrow:
 *   - Only `graph`/`flowchart` declarations and subgraph `direction` statements
 *     carry LR/RL; every other diagram type (sequence, gantt, pie, state, …)
 *     has no such token, so the regex simply doesn't match and they pass through.
 *   - Direction is PRESERVED, not flattened: LR→TB, RL→BT (a right-to-left flow
 *     becomes bottom-to-top), so reading order survives the rotation.
 *   - Portrait only. Square (1:1) holds a horizontal graph fine, so it's left as
 *     authored.
 *
 * Shared by the emulator (PDF) and the runtime (preview) so both paths agree —
 * see the sibling consumers. Pure + fs-free.
 */

const DIR_MAP = { LR: 'TB', RL: 'BT' };

/**
 * Rewrite a single mermaid definition's flow direction for a portrait canvas.
 * `orientation` is the deck-wide value ('portrait' | 'square' | 'landscape').
 * Returns the definition unchanged unless it's a portrait flowchart/graph.
 */
function reorientMermaidForPortrait(def, orientation) {
  if (orientation !== 'portrait' || typeof def !== 'string') return def;
  return def
    // Top-level `graph LR` / `flowchart RL` (TD/TB/BT and no-direction untouched).
    .replace(/^(\s*(?:graph|flowchart)\s+)(LR|RL)\b/m, (_m, head, dir) => head + DIR_MAP[dir])
    // Subgraph `direction LR` statements.
    .replace(/^(\s*direction\s+)(LR|RL)\b/gm, (_m, head, dir) => head + DIR_MAP[dir]);
}

module.exports = { reorientMermaidForPortrait };
