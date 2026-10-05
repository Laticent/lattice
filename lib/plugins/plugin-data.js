/**
 * lib/plugins/plugin-data.js — a plugin's DATA, loaded only when something asks for it
 * (`contributes.data`, engineering/decisions/2026-09-29-inline-icons.md § 6a and § 7).
 *
 * A plugin's kernels never `require` their data: a bundler would carry it into every bundle the
 * kernel is in — the linter, the runtime, the Studio's startup JavaScript — whether the deck uses
 * the plugin or not. They call `pluginData(name)` instead, which finds the data in one of two ways:
 *
 *   NODE (the CLI, the tests): the engine registers each plugin's lazy loader here
 *   (`provideData`, from lib/plugins/data.generated.js), so the first call loads the file and a
 *   deck that never asks loads nothing.
 *
 *   A BROWSER: the bundle that carries the engine aliases data.generated.js to
 *   data-browser-stub.js, so no loader is registered. The data arrives as its own script, which
 *   sets `globalThis.__latticePluginData[name]`; a surface fetches it only for a deck that uses the
 *   plugin (the plugin's `detect`), before it renders. Until it arrives this returns null, and the
 *   kernel leaves the span as the author wrote it.
 *
 * The result is cached per name. A null is NOT cached, so data that arrives later is found.
 */

const loaders = new Map();
const cache = new Map();

/** Register a lazy loader for a plugin's data (the engine does this once per plugin). */
function provideData(name, load) {
  if (typeof load === 'function' && !loaders.has(name)) loaders.set(name, load);
}

/** The plugin's data, or null when it is not available on this surface yet. */
function pluginData(name) {
  if (cache.has(name)) return cache.get(name);
  const global = typeof globalThis !== 'undefined' ? globalThis.__latticePluginData : undefined;
  let data = global && Object.hasOwn(global, name) ? global[name] : null;
  if (!data && loaders.has(name)) data = loaders.get(name)() || null;
  if (data) cache.set(name, data);
  return data;
}

module.exports = { provideData, pluginData };
