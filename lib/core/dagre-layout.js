/**
 * dagre for the bundled render paths — the runtime bundle and the docs playground.
 *
 * The OTHER half of the delivery described in tools/build-dagre-bundle.js. Both
 * halves exist because the state-chart's browser pass is serialised through
 * `.toString()` and so cannot carry an import; both end at the same global, and
 * the pass only ever reads that global:
 *
 *   emulator / CLI export  →  the generated IIFE is prepended to the pass
 *   runtime bundle / docs  →  this module, which esbuild inlines
 *
 * Requiring this module for its SIDE EFFECT is the point — it installs
 * `globalThis.__latticeDagre` so a stringified function can find it. That reads
 * oddly next to a normal import, which is why it is stated here rather than left
 * for the next reader to infer from a lint warning about an unused import.
 *
 * Self-hosted, with no external script (the policy in
 * engineering/decisions/2026-09-03-self-hosted-runtime-deps.md, and on the
 * player path an outright impossibility: its CSP is
 * `default-src 'none'; script-src 'sha256-…'`).
 */


// Guarded: the emulator's prepended IIFE may have installed it already, and in a
// browser both halves can land in one document (the runtime bundle inside a page
// that also carries an export's bootstrap). First writer wins; they are the same
// build of the same library, so it does not matter which.
if (!globalThis.__latticeDagre) {
  try {
    // eslint-disable-next-line global-require
    const dagre = require('dagre-d3-es/src/dagre/index.js');
    const { Graph } = require('dagre-d3-es/src/graphlib/index.js');
    globalThis.__latticeDagre = { layout: dagre.layout, Graph };
  } catch (_e) {
    // Absent dagre is NOT fatal. The pass falls back to the numbered column, so
    // a host that cannot resolve it renders today's layout instead of nothing.
  }
}

module.exports = {
  /** True when a layout engine is reachable from here. */
  hasDagre: () => Boolean(globalThis.__latticeDagre),
};
