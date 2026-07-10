/**
 * esbuild `alias` target for tools/build-playground.js ONLY — never required
 * directly. Keeps the real ~78.5KB-gzip KaTeX library out of
 * lattice-playground.js: esbuild statically bundles whatever `require('katex')`
 * resolves to, so a runtime conditional inside math.js can't exclude it — the
 * import specifier itself has to resolve to something small.
 *
 * The real katex is bundled SEPARATELY (lib/playground/katex-provider.js →
 * tools/build-katex-provider.js → docs/public/playground/lattice-katex.js) and
 * self-registers here via `window.__latticeRegisterKatex(katexModule)` once
 * loaded. docs/src/lib/render-engine.ts's renderMarkdown() pre-scans a deck for
 * math syntax (lib/engine/math-detect.js) and awaits that load BEFORE calling
 * render() when needed, so `renderToString` below only ever runs after
 * `real` is populated for a genuine math deck; a caller that skips the
 * pre-scan gate (there should be none — see render-engine.ts) gets math.js's
 * existing malformed-formula fallback (escaped source text), not a throw.
 */



let real = null;

if (typeof window !== 'undefined') {
  window.__latticeRegisterKatex = (k) => {
    real = k;
  };
}

module.exports = {
  renderToString(src, opts) {
    if (!real) throw new Error('katex-browser-stub: KaTeX not loaded yet');
    return real.renderToString(src, opts);
  },
};
