/**
 * lib/base/treatments.js — the `tint-*` and `mark-*` treatment vocabulary, as data.
 *
 * `lib/base/base.treatments.css` paints these. The linter used to accept any token that
 * merely STARTED with `tint-` or `mark-` (MODIFIER_PREFIXES in lib/authoring/lint-core.js),
 * so `tint-bogus` and `mark-nonsense` linted clean and painted nothing, and a `tint-corner`
 * with no placement painted nothing too, while engineering/treatments.md said a validator
 * caught it. lint-core's `treatment-*` rules read this table; test/unit/css/treatments-vocab.test.js
 * holds it equal to the selectors in base.treatments.css both ways, so a new treatment that
 * skips this file fails there, not silently in a deck.
 *
 * Pure and require-free: lint-core is bundled for the browser.
 */

/** Every `tint-*` treatment base.treatments.css paints. */
const TINTS = Object.freeze(['tint-corner', 'tint-edge', 'tint-vignette', 'tint-spotlight', 'tint-horizon', 'tint-ground', 'tint-duotone', 'tint-frame', 'tint-sweep', 'tint-ambient']);

/** Every `mark-*` treatment base.treatments.css paints. */
const MARKS = Object.freeze(['mark-micro', 'mark-ticks', 'mark-orbit', 'mark-slashes', 'mark-seeds', 'mark-pills', 'mark-threads', 'mark-chevron', 'mark-brackets', 'mark-grid', 'mark-asterisks']);

/**
 * The tints that paint nothing without a placement, and the placements each accepts. A
 * placement is written three ways, all equal: the universal `at-tl`, the bare `top-left`,
 * and the per-layer `tint-at-tl` (engineering/treatments.md §Placement).
 */
const PLACEMENT_REQUIRED = Object.freeze({
  'tint-corner': Object.freeze([
    Object.freeze(['at-tl', 'top-left', 'tint-at-tl']),
    Object.freeze(['at-tr', 'top-right', 'tint-at-tr']),
    Object.freeze(['at-bl', 'bottom-left', 'tint-at-bl']),
    Object.freeze(['at-br', 'bottom-right', 'tint-at-br']),
  ]),
  'tint-edge': Object.freeze([
    Object.freeze(['at-top', 'top', 'tint-at-top']),
    Object.freeze(['at-bottom', 'bottom', 'tint-at-bottom']),
    Object.freeze(['at-left', 'left', 'tint-at-left']),
    Object.freeze(['at-right', 'right', 'tint-at-right']),
  ]),
});

/** The per-layer placement tokens (`tint-at-tl` …) — valid `tint-` words that are not treatments. */
const TINT_PLACEMENTS = Object.freeze(Object.values(PLACEMENT_REQUIRED).flatMap((ps) => ps.map((p) => p[2])));

module.exports = { TINTS, MARKS, PLACEMENT_REQUIRED, TINT_PLACEMENTS };
