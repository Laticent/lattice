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
 *   setPluginDefaults(names) narrow the default plugin set every later render loads
 *                            from (`null` = every shipped plugin, the shipped state)
 *   pluginAdmission(deck)    the plugins a whole deck loads under it (null on the default
 *                            set) — a slide rendered alone takes it as `pluginDefaults`
 *   pluginDefaultsKey()      a render-cache key that moves with setPluginDefaults
 *   missingLanguages(md)     which fenced-code grammars this deck asks for that
 *                            this build cannot color — what the host should fetch
 *   drainLanguages()         register everything queued on window.__latticeHljs;
 *                            → the canonical names that took
 *   highlightSpans(code,lang) tokenize one fence body → [{from,to,cls}] offsets
 *                            into `code`, for a surface that cannot take HTML
 *   splitForPreview(html, source, width, height, { firstSlide })
 *                            → { html, changed }: the structural auto-split the CLI
 *                            export runs, applied to a `render()` result, so a
 *                            portrait/square deck paginates live exactly as its PDF
 *                            does. Landscape is a no-op. A PREVIEW call: exports
 *                            keep rendering unsplit until they opt in
 *   widenPaneCss(css, html)  → css: author CSS the host appends after the theme, widened
 *                            so its `section.<component>` rules reach a pane of the
 *                            rendered `html` (lib/core/pane-css.js). Unchanged when the
 *                            html holds no pane
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

import { bakeSplits, stripPaneMarkers } from '../core/bake-splits.js';
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
import * as paneCss from '../core/pane-css.js';
// The structural auto-split the CLI export runs — the SAME module — so a live preview
// paginates a portrait deck exactly as its PDF does (`splitForPreview` below).
import { structuralSplit } from '../core/structural-split.js';
import latticeEngine from '../engine/index.js';
import { PLUGIN_NAMES } from '../plugins/blocks.generated.mjs';
import { admitPlugins } from '../plugins/host-grammar.mjs';

const engine = latticeEngine.createEngine();

function addThemes(list) {
  engine.addThemes(list);
}

function hasTheme(name) {
  return engine.hasTheme(name);
}

// THE HOST'S DEFAULT PLUGIN SET (plugin-system §9 decision 9) — `undefined`, every shipped plugin,
// unless the host narrows it with `setPluginDefaults`. Every render below takes it, so the preview
// and every export that renders through this bundle admit the same plugins.
let pluginDefaults;

/**
 * Narrow this bundle's default plugin set (`null` restores every shipped plugin). The Studio and the
 * Playground ship on the default set; this is the door for a host that does not, and the one the
 * e2e test drives to prove the browser half draws nothing of a plugin a deck did not load. The
 * engine's markup carries the answer (`data-lattice-off`), so every frame that shows a render
 * honors it with no knob of its own. The source-side readers in a host's own bundle (lint, slide
 * mapping) are not reached by it: they read the default set's grammar.
 * @param {string[] | null} names
 */
function setPluginDefaults(names) {
  if (names !== null && !Array.isArray(names)) throw new TypeError('setPluginDefaults: pass an array of plugin names, or null');
  const unknown = (names || []).filter((n) => !PLUGIN_NAMES.includes(n));
  if (unknown.length) throw new TypeError(`setPluginDefaults: no plugin is named ${unknown.map((n) => JSON.stringify(n)).join(', ')}`);
  pluginDefaults = names === null ? undefined : [...names];
}

/**
 * The plugins a WHOLE deck loads under this bundle's default set, as names — or `null` on the
 * shipped default set, where every plugin loads and there is nothing to pass. ADMISSION IS
 * DECK-WIDE (a `diagram` slide anywhere loads Mermaid for every slide), so a host that renders one
 * slide alone hands this to that render as its `pluginDefaults`; admitted on the slice, a plain
 * Mermaid fence beside a diagram slide would show source in the preview while the export drew it.
 * @param {string} deck  the whole deck's Markdown
 * @returns {string[] | null}
 */
function pluginAdmission(deck) {
  if (!pluginDefaults) return null;
  return admitPlugins(String(deck || ''), { defaults: pluginDefaults }).active.map((g) => g.name);
}

/** A key for a host's render caches: it changes whenever `setPluginDefaults` does. */
function pluginDefaultsKey() {
  return pluginDefaults ? pluginDefaults.join(',') : '*';
}

function render(markdown, theme, opts) {
  // `opts` (e.g. { baseUrl }) forwards to the engine so a sample deck's
  // `![bg](relative.svg)` resolves against the staged samples dir on the web.
  // `preview: true` marks this as a PREVIEW render (this bundle is what the
  // previewers load), so the engine keeps the preview-only `data-debug` flag the
  // debug-overlay agent reads. The export/emulator path never sets it, so exported
  // artifacts stay clean — engineering/decisions/2026-07-01-debug-bounding-boxes.md.
  // The caller's own `pluginDefaults` (a slide rendered alone, handed its deck's admission) wins; an
  // absent or `undefined` one keeps the host's set rather than silently restoring every plugin.
  const defaults = opts?.pluginDefaults ?? pluginDefaults;
  const out = engine.render(markdown, theme, { ...opts, ...(defaults ? { pluginDefaults: defaults } : { pluginDefaults: undefined }), preview: true });
  // width/height (the resolved `@size` box in px) ride along so the browser
  // hosts fit-scale + export against the real slide dimensions — a `size: 4K`
  // deck is a 3840-wide box, not the hardcoded 1280. `stats` (the perf overlay's
  // opt-in per-stage breakdown) rides along too when the engine collected it, and so does
  // `flatCss` (the flat-mode stylesheet) when the caller asked for `styles: 'flat'`.
  const base = { html: out.html, css: out.css, width: out.width, height: out.height };
  if (out.flatCss !== undefined) base.flatCss = out.flatCss;
  return out.stats ? { ...base, stats: out.stats } : base;
}

/**
 * Tokenize one fence body and report each token's RANGE — `[{from, to, cls}]`,
 * offsets into `code`. The Compose editor's fence highlighting reads this: its
 * `code_block` is plain ProseMirror text and cannot take HTML, and going through
 * the engine rather than a second highlight.js in the docs bundle is what makes
 * the editor's tokens the export's tokens (HARD RULE #1). Read-only.
 */
function highlightSpans(code, lang) {
  return latticeEngine.languages.spans(code, lang);
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

// Baked in by tools/build-playground.js (esbuild `define`). Absent when this module runs unbundled
// (a unit test importing it directly), and then the split is a no-op rather than a crash.
const SPLIT_CAPACITY = typeof __LATTICE_SPLIT_CAPACITY__ !== 'undefined' ? __LATTICE_SPLIT_CAPACITY__ : null;

/**
 * The structural auto-split, for a live preview (lib/core/structural-split.js). Split on
 * structure, never on measured fit (engineering/decisions/2026-09-01-autosplit-splits-on-structure.md),
 * so this needs no render of its own: it rewrites the `render()` result's document string before
 * the host writes it into the frame. `source` is the deck markdown the render took, front matter
 * included; `width`/`height` are that render's slide box.
 */
function splitForPreview(html, source, width, height, opts) {
  // `settle`: a live frame must paint the run's final layout, or its composed cover jumps when the
  // runtime lifts it after first paint (see `structuralSplit`).
  return structuralSplit(html, { deckSource: source, width, height, capacity: SPLIT_CAPACITY, firstSlide: opts?.firstSlide ?? 1, settle: true });
}

/**
 * Widen author CSS a host appends after the theme (the Studio's `extraCss`: saved components,
 * a saved finish) for the panes in a rendered document, so `section.<component>` reaches a pane
 * of that component as it reaches its slide. A document with no pane gets the CSS back as-is.
 * The host still sanitizes the result into its `<style>` (HARD RULE #22).
 */
function widenPaneCss(css, html) {
  const classes = paneCss.paneClasses(html);
  return classes.length ? paneCss.widenForPanes(css, classes, paneCss.paneComponents(html)) : css;
}

const api = {
  addThemes,
  hasTheme,
  render,
  setPluginDefaults,
  pluginAdmission,
  pluginDefaultsKey,
  splitForPreview,
  widenPaneCss,
  missingLanguages,
  drainLanguages,
  highlightSpans,
  /** The engine's language capability, for a host that wants `has`/`list` too. */
  languages: latticeEngine.languages,
  /** Every link reference definition's target — the package gallery gate's second read. */
  referenceTargets: latticeEngine.referenceTargets,
  // The render engine is always the owned lattice-engine (constant kept for any
  // surface that still reads it; marp-core was retired in P4).
  get engine() {
    return 'lattice';
  },
  // Export-to-Marp building blocks for the Drawing Board's in-browser export:
  // the split baker + the shared bundle spec (templates + static-asset manifest).
  marp: { bakeSplits, stripPaneMarkers, appendAutoGlossary, liftImageBgImages, ...marpBundle },
};

if (typeof window !== 'undefined') {
  window.LatticePlayground = api;
}
export default api;
