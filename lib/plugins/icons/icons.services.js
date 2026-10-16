/**
 * The icons plugin's services (contributes.services), for code that draws an icon without
 * importing this plugin — today the core pill's `icon=` (lib/core/inline-pills.js); next, the
 * chart kernels that declare `optional: ["icons"]`. A caller asks the host
 * (lib/plugins/services.js `service('icons', 'drawHtml')`) and, with the plugin off, gets null
 * and renders its text alone.
 *
 *   known(name)                     the canonical icon for a name or alias, or null
 *   whyUnknown(name)                why a name is not an icon, coached (a service → its role icon)
 *   drawHtml(name, cls)             the icon's `<svg>` as a string, or null until the data is here
 *   drawElement(doc, name, cls)     the same as real nodes (the runtime's path, HARD RULE #22)
 */
const { canonical, unknownName, svgHtml, svgElement } = require('./icons.inline.js');

const services = Object.freeze({
  known: canonical,
  whyUnknown: unknownName,
  drawHtml: svgHtml,
  drawElement: svgElement,
});

module.exports = { services };
