/**
 * Lattice playground engine — browser entry (bundled to
 * docs/public/playground/lattice-playground.js by tools/build-playground.js).
 *
 * Renders Lattice markdown CLIENT-SIDE through the owned engine (lib/engine/) —
 * the SAME engine the emulator CLI ships — so the docs-site playground matches
 * the PDF output with no per-surface wiring. (Marp was retired in P4; this entry
 * no longer bundles marp-core, and the owned CSS emitter is the only packer.)
 *
 * Theme CSS (dist/lattice.css + themes/<name>.css) is NOT bundled — the page
 * fetches it from /playground/themes/ and registers it via addThemes(), so the
 * bundle stays engine-only and palettes load lazily.
 *
 * Public API (attached to window.LatticePlayground):
 *   addThemes(cssTextList)   register one or more @theme stylesheets
 *   hasTheme(name)           has a theme been registered?
 *   render(markdown, theme)  → { html, css, width, height } for the theme
 *                              (width/height = resolved `@size` box, px)
 *   marp                     Export-to-Marp bundle building blocks (the split
 *                            baker + shared bundle spec) for the in-browser export
 */

import { bakeSplits } from '../core/bake-splits.js';
// Auto-glossary is a SOURCE transform (it appends a generated slide and strips its
// own trigger), so the export has to bake it in the same way it bakes splits —
// otherwise the exported deck loses the generated Glossary slide entirely, while
// the slide before it still says "the next slide is generated" (#1256).
import { appendAutoGlossary } from '../core/glossary-auto.mjs';
// The Export-to-Marp bundle spec — the SAME pure module the CLI uses, so the
// in-browser export (docs/src/playground/drawing-board-export.js) produces a
// byte-identical bundle to `npm run export:marp`.
import * as marpBundle from '../core/marp-bundle.js';
import latticeEngine from '../engine/index.js';

const engine = latticeEngine.createEngine();

function addThemes(cssTextList) {
  engine.addThemes(cssTextList);
}

function hasTheme(name) {
  return engine.hasTheme(name);
}

function render(markdown, theme, opts) {
  // `opts` (e.g. { baseUrl }) forwards to the engine so a sample deck's
  // `![bg](relative.svg)` resolves against the staged samples dir on the web.
  // `preview: true` marks this as a PREVIEW render (this bundle is what the
  // previewers load), so the engine keeps the preview-only `data-debug` flag the
  // debug-overlay agent reads. The export/emulator path never sets it, so exported
  // artifacts stay clean — engineering/decisions/2026-07-01-debug-bounding-boxes.md.
  const out = engine.render(markdown, theme, { ...opts, preview: true });
  // width/height (the resolved `@size` box in px) ride along so the browser
  // hosts fit-scale + export against the real slide dimensions — a `size: 4K`
  // deck is a 3840-wide box, not the hardcoded 1280. `stats` (the perf overlay's
  // opt-in per-stage breakdown) rides along too when the engine collected it.
  const base = { html: out.html, css: out.css, width: out.width, height: out.height };
  return out.stats ? { ...base, stats: out.stats } : base;
}

const api = {
  addThemes,
  hasTheme,
  render,
  // The render engine is always the owned lattice-engine (constant kept for any
  // surface that still reads it; marp-core was retired in P4).
  get engine() {
    return 'lattice';
  },
  // Export-to-Marp building blocks for the Drawing Board's in-browser export:
  // the split baker + the shared bundle spec (templates + static-asset manifest).
  marp: { bakeSplits, appendAutoGlossary, ...marpBundle },
};

if (typeof window !== 'undefined') {
  window.LatticePlayground = api;
}
export default api;
