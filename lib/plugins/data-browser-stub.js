/**
 * esbuild `alias` target for lib/plugins/data.generated.js in every BROWSER bundle that carries
 * the engine (tools/build-playground.js) — never required directly. data.generated.js holds each
 * plugin's data as a lazy `require`, which a bundler follows statically, so the bundle would carry
 * every plugin's data whatever the deck uses. This stub registers no loader; the data arrives as
 * its own script instead (lib/plugins/plugin-data.js says how).
 */
module.exports = { DATA_LOADERS: Object.freeze({}) };
