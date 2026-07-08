/**
 * Form default — the deck-wide `form:` toggle, live-DOM edition.
 *
 * Form is the DEFAULT composition model (design/forms.md §10; on by default since
 * 2026-06-26). The engine and the emulator stamp the `form` class on every
 * eligible top-level slide at render time (applyFormToggleToHtml → formToggleClass,
 * lib/integrations/markdown-it/plugins.js). Marp runs none of that, so a deck built
 * from `lattice.css` + the browser runtime + a theme and dropped into a Marp tool
 * (the marp-vscode preview, or the export-to-Marp bundle's HTML opened in a browser)
 * would otherwise render Form-BLIND: the whole chrome layer — masthead band, bay,
 * footer cell, progress rail, watermark — keys on a `form` class nothing ever adds.
 * The runtime (lib/runtime/index.js) reproduces the render-time default on the live
 * DOM through this shared helper, so the skip set and the `form`/`no-form` opt-outs
 * stay single-sourced across all three render paths (HARD RULE #1) — never a
 * hand-copied third implementation.
 *
 * Two stamps per eligible top-level slide (`section:not(section section)`, so a
 * literal <section> written inside slide content is never touched):
 *   1. `data-lattice-slide` — the slide marker the Form Tiles (progress, watermark)
 *      and the overflow probe scope on. The emulator adds it; Marp does not, so
 *      without it those passes silently no-op even once `form` is present. Safe to
 *      add here: `lattice.css` only styles `[data-lattice-slide]` under the fluid
 *      viewer root (`:root[data-lattice-view="fluid"]`), which this path never sets.
 *   2. the `form` class via the shared `formToggleClass` — honoring the
 *      sovereign-frame skip set (title/divider/closing/image/math/split-*) and the
 *      per-slide `form` / `no-form` opt-outs.
 *
 * Per-section + idempotent: formToggleClass returns the class unchanged when a slide
 * already opts in/out or is a sovereign frame, so a published export the engine
 * ALREADY formed (and which embeds the runtime) is untouched, and one hand-tagged
 * `_class: form` slide never suppresses the default on its siblings.
 *
 * Front-matter-blind by design. Marp strips YAML from the DOM and the marp-vscode
 * webview can't fetch the source `.md`, so a `form:`/`no-form` reader would no-op in
 * the very context this targets; the deck-wide `form: off` opt-out is therefore
 * honored at RENDER time (the engine / CLI), not here. See
 * engineering/decisions/2026-07-08-runtime-form-default.md.
 */

const { formToggleClass } = require('../integrations/markdown-it/plugins');

/**
 * Stamp `data-lattice-slide` + the default `form` class on every eligible top-level
 * slide of `root` (a document or element). Idempotent; safe to re-run on each
 * preview transform pass.
 */
function applyFormDefaultToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  let i = 0;
  for (const sec of root.querySelectorAll('section:not(section section)')) {
    i += 1;
    if (!sec.hasAttribute('data-lattice-slide')) sec.setAttribute('data-lattice-slide', String(i));
    const next = formToggleClass(sec.className, 'standard');
    if (next !== sec.className) sec.className = next;
  }
}

module.exports = { applyFormDefaultToDom };
