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
 * The overflow tab's label. The author live-preview names the defect
 * ("Overflows"); a reader gets a calm "content continues" cue. Both are text,
 * so the marker never relies on color alone (WCAG 1.4.1).
 */
function overflowTabText(authorTags) {
  return authorTags ? 'Overflows' : 'More below';
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
  overflowTabAction,
  legibilityTabText,
  legibilityTabAction,
  // Function source for verbatim injection into the emulator's inline watcher
  // string — same idiom as overflow-probe.js's PROBE_SRC / LEGIBILITY_SRC.
  LEGIBILITY_TAB_TEXT_SRC: legibilityTabText.toString(),
  LEGIBILITY_TAB_ACTION_SRC: legibilityTabAction.toString(),
};
