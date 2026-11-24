'use strict';
/**
 * The engine's TEST SEAMS, kept off the object `createEngine()` returns.
 *
 * `_tokens(src)` used to sit on that object: undocumented, underscore-named, and still part of what every consumer of
 * `@laticent/lattice` could reach and come to depend on. It now lives here, keyed by engine, for the three suites
 * that need the engine's own token stream (the plugin conformance harness, the source-doors and meta-door tests).
 * `package.json` `exports` names only `lib/engine/index.js`, so a consumer cannot import this file.
 */

/** @type {WeakMap<object, (src: string) => object[]>} */
const TOKENS = new WeakMap();

/** Called once by `createEngine` for each engine it makes. */
function registerTokens(engine, fn) {
  TOKENS.set(engine, fn);
}

/**
 * The token stream the engine's own parser produces for `src`: the memoized markdown-it `render` uses, with every
 * plugin and every LATTICE_PLUGINS rule installed, on the body `render` parses. LF source only.
 * @param {object} engine a `createEngine()` result
 * @param {string} src
 */
function engineTokens(engine, src) {
  const fn = TOKENS.get(engine);
  if (!fn) throw new TypeError('engineTokens: not an engine made by createEngine()');
  return fn(src);
}

module.exports = { registerTokens, engineTokens };
