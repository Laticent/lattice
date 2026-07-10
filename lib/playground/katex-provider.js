/**
 * Lattice KaTeX provider — browser entry (bundled to
 * docs/public/playground/lattice-katex.js by tools/build-katex-provider.js).
 *
 * The real ~78.5KB-gzip KaTeX library, split out of lattice-playground.js
 * (tools/build-playground.js aliases the `katex` import there to
 * lib/engine/katex-browser-stub.js instead) so decks without math never pay
 * for it. Loaded on demand, as a classic <script>, by
 * docs/src/lib/render-engine.ts's renderMarkdown() — the same on-demand
 * <script>-injection idiom docs/src/lib/load-engine.ts uses for the main
 * engine bundle — only when a source pre-scan (lib/engine/math-detect.js)
 * finds `$…$` / `$$…$$` syntax. Self-registers into the stub's closure via
 * `window.__latticeRegisterKatex`, so math.js's already-installed renderer
 * rules pick up the real KaTeX the next time they run — no re-render needed.
 */

import katex from 'katex';

if (typeof window !== 'undefined') {
  window.__latticeRegisterKatex?.(katex);
  // A flag (rather than requiring callers to re-check __latticeRegisterKatex's
  // side effect) so render-engine.ts's loader has an unambiguous ready signal.
  window.__latticeKatexReady = true;
}
