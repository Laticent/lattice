/**
 * lib/plugins/checks/checks.services.js — what the checks plugin offers code outside it, by name
 * (lib/core/plugin-services.js). A check that LEADS an element is composed with its label into one
 * pill (shared/compose.js); the markdown-it integration, the runtime and the label-set keys draw it
 * through these, never by importing this folder.
 */

// Required inside the function, not at the top: compose draws its pill through the pills plugin, whose
// kernel asks for services through lib/core/plugin-services.js, which requires the generated services
// table, which requires THIS file. A top-level require would close that circle (pills.services.js says
// the same).
const services = Object.freeze({
  composeHtml: (...args) => require('./shared/compose.js').composeHtml(...args),
  composeElement: (...args) => require('./shared/compose.js').composeElement(...args),
});

module.exports = { services };
