/**
 * lib/plugins/checks/checks.services.js — what the checks plugin offers code outside it, by name
 * (lib/core/plugin-services.js). A check that LEADS an element is composed with its label into one
 * pill (shared/compose.js); the markdown-it integration, the runtime and the label-set keys draw it
 * through these, never by importing this folder.
 */

// Required inside the function, not at the top: the generated services table requires THIS file, and compose is light
// enough to load on first use. Built by the host with this plugin's ctx, which compose needs for the vocabulary and the pill.
const services = (ctx) => Object.freeze({
  composeHtml: (marker, label, container, options) => require('./shared/compose.js').composeHtml(marker, label, container, options, ctx),
  composeElement: (doc, marker, label, container, options) => require('./shared/compose.js').composeElement(doc, marker, label, container, options, ctx),
});

module.exports = { services };
