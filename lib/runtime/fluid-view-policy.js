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
function overflowTabText(authorTags, cutOnly) {
  // "Overflows" is a claim about GEOMETRY, and once the register learned to detect a
  // cut with no overflow it started making that claim on slides where nothing overflows:
  // an ellipsed label at `author` drew a red "OVERFLOWS" flag with no ring beside it
  // (correctly absent — `.overflow` is pure geometry), so the author went looking for a
  // spill that was not there. The author gets the accurate word for the condition, and
  // it is deliberately the SAME word the stderr channel and the reader pill use, so one
  // vocabulary covers the whole register. (HARD RULE #25 round 3, both lenses.)
  if (!authorTags) return 'Content clipped';
  return cutOnly ? 'Content clipped' : 'Overflows';
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
    // Two words for two conditions, resolved by the caller from `over`: the geometry
    // one, and the cut-with-no-overflow one. At `reader` both are the same calm string.
    tabText: overflowTabText(authorTags, false),
    tabTextCut: overflowTabText(authorTags, true),
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
 * The list is EXHAUSTIVE by contract, so it names the Fix-Me signal too — that is
 * drawn outside the tab path, and an earlier cut of this function left it behind
 * while its docstring promised otherwise.
 *
 * IT EMPTIES THE TABS RATHER THAN REMOVING THEM. The three tabs are berths the
 * markup carries (lib/core/fit-berth.js), not nodes a watcher minted, so removing
 * one would delete part of the slide and the next `berth()` call would just mint
 * it back — churn, and a document that no longer matches what the engine emitted.
 * A berth holding no text draws nothing: every reveal rule is gated on a class
 * this function also clears, and there is no ink in an empty tab either way.
 *
 * Lives here rather than inline in the runtime IIFE so it can be tested against a
 * real DOM — the same reason the rest of this module exists.
 */
function sweepOverflowMarkers(root) {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : null;
  if (!scope) return;
  for (const s of scope.querySelectorAll('section.overflow')) s.classList.remove('overflow');
  // The marker-treatment class was missing here while the docstring above promised the
  // list was "EXHAUSTIVE by contract" — so `off` cleared the ring and left the class that
  // gates the tab stamped. Fixed rather than documented-around because a stale-state
  // carrier is a defect waiting for its second reader, and a docstring that reads false
  // about its own list is worse than no docstring (#1300 item 3). The test for THIS line
  // is in resolve-overflow-marker.test.js and its fixture carries the class — an earlier
  // cut added the line and left that fixture untouched, so deleting the line again kept
  // the suite green, which is a test that cannot fail for the thing it exists to catch.
  for (const s of scope.querySelectorAll('section.clip-marked')) s.classList.remove('clip-marked');
  for (const s of scope.querySelectorAll('section.illegible')) s.classList.remove('illegible');
  // The Fix-Me signal: the section-level label class and the per-cell outline it
  // points at. Both are plain classes now — there is no overlay layer to tear
  // down, which is the other half of why this list got shorter rather than longer.
  for (const s of scope.querySelectorAll('section.fit-marked')) s.classList.remove('fit-marked');
  for (const el of scope.querySelectorAll('.fit-culprit')) {
    el.classList.remove('fit-culprit');
    el.removeAttribute('data-fit-label');
    el.removeAttribute('data-fit-hint');
  }
  for (const t of scope.querySelectorAll('.overflow-tab, .illegible-tab, .fixme-tab')) {
    if (t.textContent !== '') t.textContent = '';
    if (t.hasAttribute?.('title')) t.removeAttribute('title');
  }
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

module.exports = {
  overflowTabText,
  overflowMarkerPolicy,
  sweepOverflowMarkers,
  legibilityTabText,
  // Function source for verbatim injection into the emulator's inline watcher
  // string — same idiom as overflow-probe.js's PROBE_SRC / LEGIBILITY_SRC. The two
  // watchers must not drift in what they call the same condition (HARD RULE #15).
  OVERFLOW_TAB_TEXT_SRC: overflowTabText.toString(),
  LEGIBILITY_TAB_TEXT_SRC: legibilityTabText.toString(),
};
