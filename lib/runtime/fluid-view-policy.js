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

module.exports = {
  overflowTabText,
  overflowTabAction,
};
