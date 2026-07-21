/**
 * Pure decisions for the responsive fluid-view behavior — extracted from the
 * browser runtime (lib/runtime/index.js) so they can be unit-tested with plain
 * values (the runtime IIFE itself needs a live DOM). One source of truth for
 * each policy (HARD RULE #1), consumed by the runtime; mirrors how
 * lib/core/overflow-probe.js is the tested kernel behind the overflow watcher.
 * Design: engineering/decisions/2026-07-20-adaptive-viewport-fill.md (P1).
 */

// The provisional upper-wide aspect boundary for defaulting the fluid viewer to
// FILL. Ultrawide (aspect > this) has no edge cap yet — that is the P2 slice —
// so it keeps the authored fixed deck rather than filling into a dead band.
// PROVISIONAL: P2 replaces this bare number with a families.js upper-wide
// boundary + the cap; fluid-view-policy.test.js pins it so it can't drift
// unobserved. engineering/decisions/2026-07-20-adaptive-viewport-fill.md.
const FILL_DEFAULT_MAX_ASPECT = 1.9;

/**
 * Does the fluid viewer default to FILL for a viewport of this size?
 * True for portrait / square / standard / 16:10 / 16:9 (aspect <= max), false
 * for ultrawide. The denominator is floored at 1 so a degenerate 0-height
 * viewport yields a finite aspect (→ fixed) instead of dividing by zero — either
 * degenerate resolution is harmless (such a viewport does not really render).
 */
function fluidDefaultFills(width, height, maxAspect = FILL_DEFAULT_MAX_ASPECT) {
  const aspect = width / Math.max(1, height);
  return aspect <= maxAspect;
}

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
  FILL_DEFAULT_MAX_ASPECT,
  fluidDefaultFills,
  overflowTabText,
  overflowTabAction,
};
