/**
 * Pure decisions for the responsive fluid-view behavior — extracted from the
 * browser runtime (lib/runtime/index.js) so they can be unit-tested with plain
 * values (the runtime IIFE itself needs a live DOM). One source of truth for
 * each policy (HARD RULE #1), consumed by the runtime; mirrors how
 * lib/core/overflow-probe.js is the tested kernel behind the overflow watcher.
 * Design: engineering/decisions/2026-07-20-adaptive-viewport-fill.md (P1).
 */

// P2 supersedes P1's fill-vs-fixed band: the fluid viewer now fills EVERY screen
// by default, and an ultrawide box is handled by the CSS edge cap
// (base.fluid-view.css `--fill-max-aspect`) — a capped fill in a symmetric frame,
// not a dead band. So there is no longer a JS "should this fill?" decision to
// make here; the earlier fluidDefaultFills band is retired. The cap aspect lives
// in CSS (the box constraint is `min(100%, 100dvh * --fill-max-aspect)`).

/**
 * The overflow tab's label. Both are text, so the marker never relies on color
 * alone (WCAG 1.4.1).
 *
 * THE READER LABEL IS A STATEMENT OF FACT, NOT AN AFFORDANCE, and that correction
 * is the whole point of this comment. It used to read "More below ↓" — a scroll
 * cue. There is no below: `base.elements.css` sets `section { overflow: hidden }`
 * and the standard body cell sets `overflow: clip`, which does not create a scroll
 * container at all and cannot be scrolled by any means. In a PDF the content is not
 * printed; in the standalone HTML it cannot be reached; in the fluid viewer
 * `scroll-snap-type: y mandatory` at one slide per 100dvh means scrolling down goes
 * to the NEXT SLIDE. The content is gone, not below.
 *
 * So "More below" was a false claim, made on precisely the delivery surfaces this
 * register exists to serve — a reader would scroll, find nothing, and conclude the
 * deck was fine. That is a softer form of the concealment the register refuses to
 * do, and worse than `off`, which at least asserts nothing. "Content clipped" is
 * plain enough for a boardroom and true on every surface.
 */
function overflowTabText(authorTags) {
  return authorTags ? 'Overflows' : 'Content clipped';
}

/**
 * The `overflow-marker` level → what the watcher actually draws. One place, so
 * "what does `reader` mean" has a single answer that a unit test can pin and the
 * runtime cannot drift from.
 *
 * `authorTags` is kept as the internal primitive (it is what `overflowTabText`
 * above keys on and what the Fix-Me overlay branch reads); this function is the
 * translation from the author's word to that primitive plus the two decisions the
 * boolean never covered — whether to mark at all, and whether the type floor is
 * in scope.
 *
 *   author → red ring + "Overflows" + per-cell Fix-Me overlays + the type-floor alarm
 *   reader → the same tab, restyled by CSS into a calm "Content clipped" pill, and
 *            no ring. No QA chrome; the type floor has no reader answer (a reader
 *            cannot resize a figure), so it stays author-only.
 *   off    → nothing is drawn, and anything a previous pass or a build-time stamp
 *            left behind is swept.
 *
 * @param {string} level one of lib/core/resolve-overflow-marker.js's levels
 */
function overflowMarkerPolicy(level) {
  const authorTags = level === 'author';
  return {
    // `off` is the only level that draws nothing; both others keep the honest
    // TAB, because a clipped slide that looks finished is the failure mode the
    // marker exists to prevent. Only the tone differs, and that is CSS's half.
    mark: level !== 'off',
    authorTags,
    tabText: overflowTabText(authorTags),
    legibility: authorTags,
  };
}

/**
 * Remove every overflow / legibility marker from `root`.
 *
 * `off` is not "skip the watcher" — it is "leave no marker", and a marker can
 * already be in the DOM when the watcher starts: a re-render, or an earlier and
 * louder pass, can hand it an already-marked document. Skipping without sweeping
 * would leave exactly the chrome `off` was asked to remove.
 *
 * (An earlier version of this comment said lattice-emulator.js stamps `.overflow`
 * into exported HTML at BUILD time. It does not — it embeds an inline WATCHER that
 * stamps at runtime, and strips the class before printing. The distinction matters:
 * a build-time stamp is static and a one-shot sweep would settle it, whereas a
 * concurrent watcher re-stamps on font-settle and on every resize and cannot be
 * beaten by a sweep at all. That race is closed in CSS — see the
 * `[data-lattice-overflow-marker="off"]` rules in base.modifiers.css — and this
 * sweep only has to clear what is already there.)
 *
 * The list is EXHAUSTIVE by contract, so it names the Fix-Me overlay and its boxes
 * too: those are drawn by `drawFixMeTags`, not by the tab path, and an earlier cut
 * of this function left them behind while its docstring promised otherwise.
 *
 * Lives here rather than inline in the runtime IIFE so it can be tested against a
 * real DOM — the same reason the rest of this module exists.
 */
function sweepOverflowMarkers(root) {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : null;
  if (!scope) return;
  for (const s of scope.querySelectorAll('section.overflow')) s.classList.remove('overflow');
  for (const s of scope.querySelectorAll('section.illegible')) s.classList.remove('illegible');
  for (const t of scope.querySelectorAll(
    '.overflow-tab, .illegible-tab, .lattice-fixme-tab, .lattice-fixme-box, .lattice-fixme-overlay',
  )) t.remove();
}

/**
 * What to do with a section's overflow tab, given whether it currently
 * overflows and whether a tab is already present. Deliberately keyed on
 * (over, hasTab) and NOT on the `.overflow` class flip: the export stamps
 * `.overflow` at build time, so a pre-stamped slide never "flips" — yet a
 * clipped reader must still get the honest marker (never a silent loss). Pure
 * add-once / remove-once, so the watcher's mutation loop still settles.
 *   → 'add'    : overflows and has no tab yet
 *   → 'remove' : no longer overflows but a stale tab lingers
 *   → 'none'   : already in the right state
 */
function overflowTabAction({ over, hasTab }) {
  if (over && !hasTab) return 'add';
  if (!over && hasTab) return 'remove';
  return 'none';
}

/**
 * The LEGIBILITY tab's label (§8 rule 8). The ring is colour-only, so the
 * condition is named in text (WCAG 1.4.1) — and named with the NUMBERS, because
 * "too small" is only actionable next to the floor it missed.
 *
 * Shared by BOTH watchers that stamp `.illegible`: the live runtime
 * (lib/runtime/index.js, the VS Code preview + docs Playground) and the
 * emulator's inline export watcher, which injects this function's source
 * verbatim rather than re-typing the format string (HARD RULE #15 — the two
 * watchers must not drift in what they call the same measurement).
 */
function legibilityTabText(leg) {
  return 'Type ' + leg.minPx + 'px · floor ' + leg.floorPx + 'px';
}

/**
 * What to do with a section's legibility tab. Same (state, hasTab) shape as
 * `overflowTabAction` and for the same reason — the export can stamp the class
 * at build time, so the decision may never see a flip — with one addition:
 * the label carries live NUMBERS, so an already-present tab must be re-texted
 * when the measurement moves ('update'), not left showing a stale px reading.
 *   → 'add'    : below the floor, no tab yet
 *   → 'update' : below the floor, tab present — refresh its numbers
 *   → 'remove' : back above the floor but a stale tab lingers
 *   → 'none'   : already in the right state
 */
function legibilityTabAction({ under, hasTab }) {
  if (under) return hasTab ? 'update' : 'add';
  return hasTab ? 'remove' : 'none';
}

module.exports = {
  overflowTabText,
  overflowMarkerPolicy,
  sweepOverflowMarkers,
  overflowTabAction,
  legibilityTabText,
  legibilityTabAction,
  // Function source for verbatim injection into the emulator's inline watcher
  // string — same idiom as overflow-probe.js's PROBE_SRC / LEGIBILITY_SRC.
  LEGIBILITY_TAB_TEXT_SRC: legibilityTabText.toString(),
  LEGIBILITY_TAB_ACTION_SRC: legibilityTabAction.toString(),
};
