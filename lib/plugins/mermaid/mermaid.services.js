/**
 * lib/plugins/mermaid/mermaid.services.js — what the Mermaid plugin offers code outside it, by name
 * (lib/core/plugin-services.js; 2026-11-01-plugin-contract-hollywood.md §2a). The fence matcher is the plugin's own grammar,
 * so engine code that must find the fences Mermaid would draw asks for it here instead of carrying a copy:
 *
 *   fences(markdown)            every Mermaid fence in the source, as the bake finds them (shared/mermaid-fences.js)
 *   firstFenceBody(markdown)    the first fence's body, or null (the diagram narrator)
 *
 * A caller that must not pass a deck it cannot read (the gallery gate) FAILS CLOSED when this plugin is off: it gets
 * null and refuses, rather than reading no fences and admitting the gallery.
 */
const { matchMermaidFences, firstMermaidFenceBody } = require('./shared/mermaid-fences');

const services = (_ctx) => Object.freeze({
  fences: (markdown) => matchMermaidFences(markdown),
  firstFenceBody: (markdown) => firstMermaidFenceBody(markdown),
});

module.exports = { services };
