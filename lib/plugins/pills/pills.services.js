/**
 * The pills plugin's services (contributes.services), for code that needs to know about a pill without importing this
 * plugin. A caller asks the host (lib/core/plugin-services.js `service('pills', 'reads')`). The plugin is embedded, so the
 * host always answers.
 *
 *   reads(text)          true when `{…}` is a valid pill
 *   pillHtml(…)          the pill's markup, as the kernel's pillHtml
 *   pillElement(doc, …)  the pill as a DOM element, as the kernel's pillElement
 */
// Required inside the function, not at the top: the kernel calls `service('icons', …)` through lib/core/plugin-services.js,
// which requires the generated services table, which requires THIS file. A top-level require here would close that
// circle and hand the table a half-loaded module.
const services = Object.freeze({
  reads: (text) => require('./pills.inline.js').resolve(text) !== null,
  // The pill renderer, for engine code below the plugins (the markdown-it integration, the glossary
  // slide) that draws a pill without importing this folder.
  pillHtml: (...args) => require('./pills.inline.js').pillHtml(...args),
  pillElement: (...args) => require('./pills.inline.js').pillElement(...args),
});

module.exports = { services };
