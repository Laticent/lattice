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
const { mapSections } = require('./section-walk');

// The deck logo, when a section carries one, is its FIRST child (lib/integrations/markdown-it/
// plugins.js `applyDeckLogoToHtml` runs after this pass and prepends it). The wrapper goes AFTER
// it, and a wrapper already sitting after it means the section is done — so a `logo · backdrop`
// section never grows a second one.
//
// WHITESPACE IS STEPPED OVER TOO, on both sides of the logo. The engine emits none there, but
// the splitter runs this over a document the engine already processed, and a
// `<section …>\n<div class="backdrop">` would read as unwrapped and grow a second one (found by
// the HARD RULE #25 checker on synthetic input).
const LEAD_RE = /^\s*(?:<img\b[^>]*\sclass="[^"]*\bdeck-logo\b[^"]*"[^>]*>\s*)?/;
const WRAPPER_OPEN = '<div class="backdrop"';

/**
 * HTML-stage helper: inject the `.backdrop` wrapper as the FIRST child of every
 * top-level `finish` section (every finish SLIDE). The finish compositor lives on this wrapper (base.finish.css),
 * so one `opacity` (backdrop strength) and the `.backdrop-mask` overlay
 * (clearance / spotlight) can address the WHOLE finish as a single layer — and the
 * mark/edge pseudos move off the section, freeing `section::after` for the
 * paginator. Mirrors applyDeckLogoToHtml; the runtime's `injectBackdrops`
 * (lib/runtime/index.js) carries the same injection for the DOM, and the emulator
 * reaches this function through the engine, so every render path agrees.
 * (engineering/decisions/2026-07-01-finish-restraint-controls.md, slice 1.)
 */
function applyBackdropToHtml(html, markdown) {
  // Backdrop restraint (strength / clearance) is a BAKED layer of the finish now — it
  // rides the finish's generated CSS as `--fin-backdrop-*` (docs finish-generate), which
  // the compositor below reads. So the wrapper carries no deck-level inline style; the
  // deck author tunes it through the Studio's `finish-override:` map (regenerated CSS).
  void markdown;
  const el = `<div class="backdrop" aria-hidden="true"><i class="backdrop-mask"></i></div>`;
  // TOP-LEVEL SECTIONS ONLY, through the engine's walker (`mapSections`). A finish is a
  // slide's surface, and this pass used to find slides with a global `<section…>` regex, which
  // is not a walk: it stamped a wrapper INSIDE an HTML comment that quoted a finish section,
  // and inside a hand-authored `<section class="finish">` nested in a slide. The walker reads
  // a comment as text and visits only the slides. The DOM twin (`injectBackdrops`,
  // lib/runtime/index.js) skips nested sections for the same reason, so both paths agree.
  //
  // A NEVER-CLOSED `<section>` an author leaves in a slide ends the walk there
  // (lib/core/split-sections.mjs: an unclosed open tag yields no section), so no later slide
  // is wrapped — where the regex used to stamp every finish open tag. Accepted on purpose:
  // that deck is already broken on every path. Every other `mapSections` pass stops at the
  // same byte, and in a browser the later slides parse as children of the unclosed one, where
  // the DOM twin skips them as nested. Pinned in test/unit/core/backdrop-walk.test.js.
  //
  // Idempotent: a section whose wrapper is already in place passes through byte-identical, so
  // re-processing engine-rendered HTML (the emulator does, and so does the splitter) is a
  // no-op.
  //
  // A leading `<img class="deck-logo">` is stepped over, in both directions. Skipping it in
  // the guard keeps a `logo · backdrop` section from growing a second wrapper — the same
  // shape of positional-guard bug that shipped two stacked logos. Injecting AFTER it keeps
  // the logo first on a section that has a logo and no backdrop yet, which is the shape a
  // re-authored split page arrives in: the mark is the section's first child on every render
  // path, and that is the contract the CSS and the parity test are written against.
  return mapSections(String(html || ''), (openTag, classAttr, inner) => {
    const cls = classAttr.split(/\s+/).filter(Boolean);
    if (!sectionIsFinish(cls)) return null;
    const lead = LEAD_RE.exec(inner)[0];
    if (inner.startsWith(WRAPPER_OPEN, lead.length)) return null;
    // A per-slide `finish-<name>` implies the bare `finish` compositor class — stamp
    // it into the class attr so `section.finish > .backdrop` (below) + the token rules
    // match, then inject the wrapper. Deck-wide finishes already carry `finish`.
    let tag = openTag;
    if (!cls.includes('finish')) {
      const normalized = normalizeSectionFinishClasses(cls).join(' ');
      tag = tag.replace(/(\sclass=")[^"]*(")/, `$1${normalized}$2`);
    }
    return { openTag: tag, inner: lead + el + inner.slice(lead.length) };
  });
}

module.exports = { applyBackdropToHtml };
