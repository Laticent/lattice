/**
 * Form default — applying the composition model on the live DOM.
 *
 * Form is the composition model and cannot be turned off (design/forms.md;
 * engineering/decisions/2026-09-20-form-is-not-configurable.md). The engine and
 * the emulator stamp the `form` class on every eligible top-level slide at render
 * time (applyFormToHtml → formToggleClass,
 * lib/integrations/markdown-it/plugins.js). Marp runs none of that, so a deck built
 * from `lattice.css` + the browser runtime + a theme and dropped into a Marp tool
 * (the marp-vscode preview, or the export-to-Marp bundle's HTML opened in a browser)
 * would otherwise render Form-BLIND: the whole chrome layer — masthead band, bay,
 * footer cell, progress rail, watermark — keys on a `form` class nothing ever adds.
 * The runtime (lib/runtime/index.js) reproduces the render-time behavior on the live
 * DOM through this shared helper, so the sovereign-Frame set stays single-sourced
 * across all three render paths (HARD RULE #1) — never a hand-copied third
 * implementation.
 *
 * Two stamps per eligible top-level slide (`section:not(section section)`, so a
 * literal <section> written inside slide content is never touched):
 *   1. `data-lattice-slide` — the slide marker the Form Tiles (progress, watermark)
 *      and the overflow probe scope on. The emulator adds it; Marp does not, so
 *      without it those passes silently no-op even once `form` is present. Safe to
 *      add here: `lattice.css` only styles `[data-lattice-slide]` under the fluid
 *      viewer root (`:root[data-lattice-view="fluid"]`), which this path never sets.
 *   2. `data-form="2d"` + `data-frame="<id>"` — the MODEL, on every slide: that it
 *      composes as Form, in the 2D medium, under a named Frame. This is where
 *      sovereignty is stated POSITIVELY rather than as an absent class.
 *   3. the `form` class via the shared `formToggleClass` — the chrome-hosting
 *      Frame's CSS hook, so the sovereign Frames (title/divider/closing/image/
 *      premise/scene/split-*; `math` left the set in 2026-09) do not take it.
 *
 * Per-section + idempotent: formToggleClass returns the class unchanged when a slide
 * already carries `form` or is a sovereign Frame, so a published export the engine
 * ALREADY formed (and which embeds the runtime) is untouched.
 *
 * THIS FILE USED TO TAKE A `mode`, and the whole apparatus behind it is gone. The
 * deck-wide `form: off` opt-out meant the runtime had to know the answer BEFORE the
 * first stamp, which is why the export bakes its front matter into the document and
 * why `deckFormMode()` read it synchronously. With the opt-out retired there is no
 * question to answer early, and this helper does the same thing on every surface.
 */

const { formToggleClass, frameIdFor, FORM_MEDIUM } = require('../integrations/markdown-it/plugins');

/**
 * Stamp `data-lattice-slide` + the `form` class on every eligible top-level slide
 * of `root` (a document or element). Idempotent; safe to re-run on each preview
 * transform pass.
 */
function applyFormDefaultToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  let i = 0;
  for (const sec of root.querySelectorAll('section:not(section section)')) {
    i += 1;
    if (!sec.hasAttribute('data-lattice-slide')) sec.setAttribute('data-lattice-slide', String(i));
    // The model, on every slide — the DOM twin of the engine's `stampFormAttrs`, and
    // AUTHORITATIVE for the same reason: both values are derived, so the engine's answer
    // is not something a stale or authored one gets to override. Setting unconditionally
    // also keeps the twins byte-identical on an input carrying a forged attribute, which
    // a `hasAttribute` guard did not.
    //
    // Re-deriving cannot fight a later pass. The one pass that rewrites a slide's class
    // after this is auto-split, whose re-authored cover carries `form` and therefore
    // derives `standard` — the same answer `roleOpenTag` re-stamps there.
    sec.setAttribute('data-form', FORM_MEDIUM);
    sec.setAttribute('data-frame', frameIdFor(sec.className));
    // ...and the chrome-hosting Frame's CSS hook, on the slides that host chrome.
    // Read AFTER the line above deliberately: `form` is never a sovereign id, so the
    // Frame is the same either way, and the order is pinned by a test rather than luck.
    const next = formToggleClass(sec.className);
    if (next !== sec.className) sec.className = next;
  }
}

module.exports = { applyFormDefaultToDom };
