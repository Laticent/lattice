/**
 * backdrop.js — the `.backdrop` wrapper injector, the HTML-stage half of the finish compositor.
 *
 * Lives in lib/core rather than beside its old home in lib/integrations/markdown-it/plugins.js
 * because TWO stages have to run it and one of them cannot import that file: the engine runs it
 * once per render, and the splitter (lib/core/auto-split.js) runs it again over the pages it
 * RE-AUTHORS — a cover, a carousel page — which are built from the masthead and the members,
 * not from the source section's children, so they come out with a `finish` class and no wrapper
 * (#2305). plugins.js transitively requires the splitter, so importing back is a cycle; the
 * kernel moving down a layer is what lets both callers share one implementation (HARD RULE #1).
 * plugins.js re-exports it, so every existing caller is unchanged. Pure & fs-free.
 */

const { sectionIsFinish, normalizeSectionFinishClasses } = require('./resolve-finish');

// The deck logo, when a section carries one, is its FIRST child (lib/integrations/markdown-it/
// plugins.js `applyDeckLogoToHtml` runs after this pass and prepends it). Captured through a
// lookahead so the match is ATOMIC: an optional group followed by a negative lookahead would
// backtrack to the empty match on a `logo · backdrop` section, read the logo as "not a
// backdrop" and inject a second wrapper ahead of it.
//
// WHITESPACE IS STEPPED OVER TOO, on both sides of the logo. The engine emits none there, but
// the splitter now runs this over a document the engine already processed, and a
// `<section …>\n<div class="backdrop">` would read as unwrapped and grow a second one (found by
// the HARD RULE #25 checker on synthetic input).
const OPEN_RE = /<section\b([^>]*)>(?=(\s*(?:<img\b[^>]*\sclass="[^"]*\bdeck-logo\b[^"]*"[^>]*>\s*)?))\2(?!<div class="backdrop")/g;

/**
 * HTML-stage helper: inject the `.backdrop` wrapper as the FIRST child of every
 * `finish` section. The finish compositor lives on this wrapper (base.finish.css),
 * so one `opacity` (backdrop strength) and the `.backdrop-mask` overlay
 * (clearance / spotlight) can address the WHOLE finish as a single layer — and the
 * mark/edge pseudos move off the section, freeing `section::after` for the
 * paginator. Mirrors applyDeckLogoToHtml; the runtime (DOM) + emulator carry the
 * same injection so all three render paths agree.
 * (engineering/decisions/2026-07-01-finish-restraint-controls.md, slice 1.)
 */
function applyBackdropToHtml(html, markdown) {
  // Backdrop restraint (strength / clearance) is a BAKED layer of the finish now — it
  // rides the finish's generated CSS as `--fin-backdrop-*` (docs finish-generate), which
  // the compositor below reads. So the wrapper carries no deck-level inline style; the
  // deck author tunes it through the Studio's `finish-override:` map (regenerated CSS).
  void markdown;
  const el = `<div class="backdrop" aria-hidden="true"><i class="backdrop-mask"></i></div>`;
  // Idempotent: the negative lookahead skips a section whose backdrop is already
  // injected, so re-processing engine-rendered HTML (the emulator does, and so does the
  // splitter) is a no-op.
  //
  // A leading `<img class="deck-logo">` is stepped over, in both directions. Skipping it in
  // the guard keeps a `logo · backdrop` section from growing a second wrapper — the same
  // shape of positional-guard bug that shipped two stacked logos. Injecting AFTER it keeps
  // the logo first on a section that has a logo and no backdrop yet, which is the shape a
  // re-authored split page arrives in: the mark is the section's first child on every render
  // path, and that is the contract the CSS and the parity test are written against.
  return String(html || '').replace(OPEN_RE, (match, attrs, logo) => {
    const c = attrs.match(/\sclass="([^"]*)"/);
    const cls = c ? c[1].split(/\s+/).filter(Boolean) : [];
    if (!sectionIsFinish(cls)) return match;
    // A per-slide `finish-<name>` implies the bare `finish` compositor class — stamp
    // it into the class attr so `section.finish > .backdrop` (below) + the token rules
    // match, then inject the wrapper. Deck-wide finishes already carry `finish`.
    let tag = `<section${attrs}>`;
    if (!cls.includes('finish')) {
      const normalized = normalizeSectionFinishClasses(cls).join(' ');
      tag = tag.replace(/(\sclass=")[^"]*(")/, `$1${normalized}$2`);
    }
    return `${tag}${logo}${el}`;
  });
}

module.exports = { applyBackdropToHtml };
