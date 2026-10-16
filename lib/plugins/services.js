/**
 * lib/plugins/services.js — how code calls a plugin's function without importing the plugin
 * (engineering/decisions/2026-09-27-plugin-system.md § 4.3 `services`).
 *
 *   const draw = service('icons', 'draw', off);
 *   const fields = draw ? draw('database', { color: 3 }) : null;
 *
 * A caller asks the HOST by plugin and service name, and gets the function or null: null when no
 * plugin offers it, and null when the plugin is off for this render (`off`, the engine's set of
 * plugins the deck did not load). With null, the caller renders without the plugin — a pill shows
 * its label alone — so a core kernel never depends on a plugin being installed.
 *
 * The services come from lib/plugins/services.generated.js, which tools/build-plugin-registry.js
 * writes from each manifest's `contributes.services` and checks one-to-one against the plugin's
 * `<name>.services.js`. Those modules are light by contract (no data; data arrives through
 * lib/plugins/plugin-data.js), so this file is safe in every bundle a kernel is in.
 */

const { SERVICES } = require('./services.generated.js');

/**
 * @param {string} plugin
 * @param {string} name
 * @param {Set<string>|null} [off] plugins switched off for this render
 * @returns {Function|null}
 */
function service(plugin, name, off) {
  if (off?.has(plugin)) return null;
  const fns = Object.hasOwn(SERVICES, plugin) ? SERVICES[plugin] : null;
  const fn = fns && Object.hasOwn(fns, name) ? fns[name] : null;
  return typeof fn === 'function' ? fn : null;
}

module.exports = { service };
