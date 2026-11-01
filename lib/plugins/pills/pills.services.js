/**
 * The pills plugin's services (contributes.services), for code that needs to know about a pill without importing this
 * plugin. A caller asks the host (lib/core/plugin-services.js `service('pills', 'reads')`). The plugin is embedded, so the
 * host always answers.
 *
 *   reads(text)          true when `{…}` is a valid pill
 *   pillHtml(…)          the pill's markup, as the kernel's pillHtml
 *   pillElement(doc, …)  the pill as a DOM element, as the kernel's pillElement
 */
// Required inside the function, not at the top: the services table requires THIS file, and the kernel is light enough
// to load on first use. Built by the host with this plugin's ctx (lib/core/plugin-ctx.js), so `icon=` reaches the
// icons plugin through it.
const services = (ctx) => Object.freeze({
  // The pill's size words, for a plugin that sizes something the way a pill is sized (checks).
  sizes: () => require('./pills.inline.js').SIZES,
  reads: (text) => require('./pills.inline.js').resolve(text, ctx) !== null,
  // The pill renderer, for engine code below the plugins (the markdown-it integration, the glossary
  // slide) that draws a pill without importing this folder.
  pillHtml: (text, _off, lead) => require('./pills.inline.js').pillHtml(text, ctx, lead),
  pillElement: (doc, text, _off, lead) => require('./pills.inline.js').pillElement(doc, text, ctx, lead),
  pillHtmlFrom: (parts, _off, lead) => require('./pills.inline.js').pillHtmlFrom(parts, ctx, lead),
  pillElementFrom: (doc, parts, _off, lead) => require('./pills.inline.js').pillElementFrom(doc, parts, ctx, lead),
});

module.exports = { services };
