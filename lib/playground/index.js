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
 *   addThemes(list)          register one or more stylesheets; each entry is
 *                            `{ name, css }` (preferred — identity is given, not
 *                            searched for) or a bare CSS string (legacy, name
 *                            recovered from the `@theme` directive)
 *   hasTheme(name)           has a theme been registered?
 *   render(markdown, theme)  → { html, css, width, height } for the theme
 *                              (width/height = resolved `@size` box, px)
 *   missingLanguages(md)     which fenced-code grammars this deck asks for that
 *                            this build cannot color — what the host should fetch
 *   drainLanguages()         register everything queued on window.__latticeHljs;
 *                            → the canonical names that took
 *   marp                     Export-to-Marp bundle building blocks (the split
 *                            baker + shared bundle spec) for the in-browser export
 *
 * ON-DEMAND GRAMMARS, and why the split lands here. This bundle carries
 * highlight.js's 36-language `common` build; the CLI and marp-core both carry all
 * 192, so a `powershell` fence measured 11 token spans in an export and 0 here.
 * Shipping the full build would close it and nearly double the bundle (327 KB →
 * 585 KB gzipped, measured), so instead the missing grammars are fetched per deck
 * — median 1.9 KB each, built one-file-per-language by tools/build-hljs-languages.js.
 *
 * The engine answers WHAT is missing; the host answers HOW to fetch it. That is not
 * fastidiousness: `render()` is synchronous BY DESIGN (lib/engine/README.md — the
 * headless-Chromium PDF path has raced on async reflow before), so the awaiting has
 * to happen in the caller, above the render, and the caller is also the only party
 * that knows the asset base, the content-hashed URL and the service worker. This
 * module therefore exposes the question and the registration, and never fetches.
 */

import { bakeSplits } from '../core/bake-splits.js';
// The imagery bucket's `![bg]` → `.lattice-bg` panel — also a SOURCE transform, so
// the export bakes it like the splits. Without it Marp's own advanced-background
// machinery takes the `![bg]`: photo full-bleed, prose unscrimmed on top.
import { liftImageBgImages } from '../core/bg-image.js';
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

function addThemes(list) {
  engine.addThemes(list);
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

/**
 * Which grammars this deck asks for that this build cannot color.
 * Empty for the overwhelming majority of decks — js/ts/python/yaml/sql/bash are
 * all in `common` — so the host's fetch path stays cold on the normal case.
 */
function missingLanguages(markdown) {
  return latticeEngine.languages.missing(markdown);
}

/**
 * Drain `window.__latticeHljs` into the engine's highlight.js.
 *
 * The queue is a plain array each grammar file pushes `[name, definition]` onto,
 * rather than a callback the file invokes, so ORDER CANNOT MATTER: a grammar that
 * lands before this bundle finishes evaluating is still waiting in the array when
 * the drain runs, and one that lands after is picked up by the next drain. That
 * matters because the files are injected as classic `<script>` tags whose arrival
 * order against the engine bundle is not something the page controls.
 *
 * Idempotent — the queue is emptied as it drains, and `register` no-ops on a name
 * highlight.js already holds.
 *
 * @returns {string[]} the names that actually registered
 */
function drainLanguages() {
  if (typeof window === 'undefined') return [];
  const queue = window.__latticeHljs;
  if (!Array.isArray(queue) || queue.length === 0) return [];
  const taken = [];
  // splice, not a loop over the live array: a file arriving mid-drain appends to
  // the same array, and iterating it by index while it grows would drain a grammar
  // twice (harmless, `register` guards) or skip one (not harmless).
  for (const entry of queue.splice(0, queue.length)) {
    if (!Array.isArray(entry)) continue;
    const [name, definition] = entry;
    if (latticeEngine.languages.register(name, definition)) taken.push(name);
  }
  return taken;
}

const api = {
  addThemes,
  hasTheme,
  render,
  missingLanguages,
  drainLanguages,
  /** The engine's language capability, for a host that wants `has`/`list` too. */
  languages: latticeEngine.languages,
  // The render engine is always the owned lattice-engine (constant kept for any
  // surface that still reads it; marp-core was retired in P4).
  get engine() {
    return 'lattice';
  },
  // Export-to-Marp building blocks for the Drawing Board's in-browser export:
  // the split baker + the shared bundle spec (templates + static-asset manifest).
  marp: { bakeSplits, appendAutoGlossary, liftImageBgImages, ...marpBundle },
};

if (typeof window !== 'undefined') {
  window.LatticePlayground = api;
}
export default api;
