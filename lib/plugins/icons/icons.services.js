/**
 * The icons plugin's services (contributes.services), for code that draws an icon without
 * importing this plugin — today the core pill's `icon=` (lib/plugins/pills/pills.inline.js); next, the
 * chart kernels that declare `optional: ["icons"]`. A caller asks the host
 * (lib/core/plugin-services.js `service('icons', 'drawHtml')`) and, with the plugin off, gets null
 * and renders its text alone.
 *
 *   known(name)                     the canonical icon for a name or alias, or null
 *   whyUnknown(name)                why a name is not an icon, coached (a service → its role icon)
 *   drawHtml(name, cls)             the icon's `<svg>` as a string, or null until the data is here
 *   drawElement(doc, name, cls)     the same as real nodes (the runtime's path, HARD RULE #22)
 *   glyphHtml(name, cls)            the icon as a Lattice Icons glyph, to write BESIDE the `<svg>` ('' when the icon
 *                                   is not in the font): CSS shows one of the two (engineering/decisions/2026-11-01-icon-font.md)
 *   glyphElement(doc, name, cls)    the same as real nodes, or null
 */
const { canonical, unknownName, svgHtml, svgElement, glyphHtml, glyphElement } = require('./icons.inline.js');

/** Built by the host with this plugin's ctx, so the drawings come from the host's data. */
const services = (ctx) => Object.freeze({
  known: canonical,
  whyUnknown: unknownName,
  drawHtml: (name, cls) => svgHtml(name, cls, ctx.data()),
  drawElement: (doc, name, cls) => svgElement(doc, name, cls, ctx.data()),
  glyphHtml: (name, cls) => glyphHtml(name, cls, ctx.data()),
  glyphElement: (doc, name, cls) => glyphElement(doc, name, cls, ctx.data()),
});

module.exports = { services };
