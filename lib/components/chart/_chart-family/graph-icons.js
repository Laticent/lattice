/**
 * graph-icons — the icon a graph chart's node draws beside its name (`icon=`) or in place of it
 * (`icon-only`), for the flowchart and the state chart
 * (engineering/decisions/2026-09-29-inline-icons.md § 5.3, § 6a).
 *
 * THE DRAWING COMES FROM THE HOST, NEVER THE PLUGIN. A kernel asks lib/plugins/services.js for the
 * icons plugin's `drawHtml`; with the plugin off for this deck (`off`), or its data not here yet,
 * there is nothing to draw and the node shows its name alone, exactly as before.
 *
 * WHAT IT EMITS. An `<svg>` inside the node's HARNESS tile, before the name, so the measuring pass
 * sizes the node with its icon in it. The browser half (flowchart.layout.js,
 * state-chart.layout.js) reads that drawing back out of the harness and repaints it into the
 * chart's SVG from a closed set of shape elements and geometry attributes (HARD RULE #22: the
 * harness is server markup the sanitizer kept, and a deck can forge one in raw HTML, so the pass
 * trusts none of it). The node's name stays text: on an `icon-only` node it is hidden in the
 * harness and painted as the drawing's `<title>`, so a diagram of icons still reads aloud and
 * still carries every word.
 */
const { service } = require('../../../plugins/services.js');
const { escAttr } = require('./transform-utils');

/**
 * @param {{id:string, icon?:string, iconOnly?:boolean}[]} shapes  the grammar's shapes (icon is
 *   the canonical name; flowchart-grammar.js coached and dropped any the set does not have)
 * @param {string} cls  the class on the drawn `<svg>`
 * @param {Set<string>|null} [off]  the plugins this deck did not load
 * @returns {Map<string, {name:string, only:boolean, html:string, attrs:string}>}  by shape id;
 *   a shape whose icon could not be drawn is absent
 */
function nodeIcons(shapes, cls, off) {
  const out = new Map();
  if (!shapes.some((s) => s.icon)) return out;
  const draw = service('icons', 'drawHtml', off);
  if (!draw) return out;
  for (const s of shapes) {
    if (!s.icon) continue;
    const svg = draw(s.icon, cls);
    if (!svg) continue;
    const only = s.iconOnly === true;
    out.set(s.id, {
      name: s.icon,
      only,
      html: `<span class="graph-icon" aria-hidden="true">${svg}</span>`,
      attrs: ` data-icon="${escAttr(s.icon)}"${only ? ' data-icon-only=""' : ''}`,
    });
  }
  return out;
}

module.exports = { nodeIcons };
