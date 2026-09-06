/**
 * dagre for NODE — tests, and any Node caller that wants the layout engine
 * installed the way a browser document has it.
 *
 * WHAT THIS IS NOT, ANY MORE. Until the split it was one of two delivery halves:
 * `lib/runtime/index.js` required it for the side effect and esbuild inlined the
 * library, which is how dagre ended up on the eager path — 25.9 KiB gzipped on
 * `lattice-runtime.min.js` for every reader of every deck. The browser now gets
 * the engine from `dist/lattice-dagre.min.js`, a sibling script the host emits
 * before the runtime tag (the shape Mermaid and the KaTeX provider already use).
 *
 * THIS MODULE MUST NOT BE REACHABLE FROM A BROWSER BUNDLE. `lib/runtime`,
 * `docs/src` and the playground bundles all esbuild with `bundle: true` and no
 * externals, so a single import from any of them re-inlines the whole library
 * and silently undoes the split. `test/unit/core/dagre-delivery.test.js` pins
 * that: it asserts the built runtime carries no dagre internals.
 *
 * WHY THE GLOBAL AT ALL. The state-chart's browser pass is serialised through
 * `Function.prototype.toString()`, so it carries no closure and no module scope
 * and can only reach a layout engine through a global that already exists in the
 * document it lands in. Every delivery half therefore ends at the same name,
 * `globalThis.__latticeDagre`, and the pass only ever reads that.
 *
 * Requiring this module for its SIDE EFFECT is the point. That reads oddly next
 * to a normal import, which is why it is stated here rather than left for the
 * next reader to infer from a lint warning about an unused import.
 *
 * Self-hosted, with no external script (the policy in
 * engineering/decisions/2026-09-03-self-hosted-runtime-deps.md, and on the
 * player path an outright impossibility: its CSP is
 * `default-src 'none'; script-src 'sha256-…'`, which is why that path takes the
 * inlined IIFE rather than a `<script src>`).
 */


// Guarded: the emulator's prepended IIFE may have installed it already, and in a
// browser both halves can land in one document (the sibling script inside a page
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
