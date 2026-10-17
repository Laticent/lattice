/**
 * The pills plugin's services (contributes.services), for code that needs to know about a pill without importing this
 * plugin. A caller asks the host (lib/plugins/services.js `service('pills', 'reads')`). The plugin is embedded, so the
 * host always answers.
 *
 *   reads(text)   true when `{…}` is a valid pill
 */
// Required inside the function, not at the top: the kernel calls `service('icons', …)` through lib/plugins/services.js,
// which requires the generated services table, which requires THIS file. A top-level require here would close that
// circle and hand the table a half-loaded module.
const services = Object.freeze({
  reads: (text) => require('./pills.inline.js').resolve(text) !== null,
});

module.exports = { services };
