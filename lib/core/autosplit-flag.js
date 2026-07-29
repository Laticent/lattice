/**
 * autosplit-flag — the ONE reader of the deck-level `autosplit:` directive.
 *
 * There were two: a regex in `lattice-emulator.js` deciding whether the engine
 * splits, and another in `lib/authoring/lint-core.js` deciding what the author is
 * told about it. Two copies of one rule is the shape HARD RULE #1 exists to stop,
 * and it becomes load-bearing the moment the DEFAULT changes — which it just did.
 *
 * ── The default is ON for non-landscape decks (2026-07-28, #1234) ─────────────
 *
 * It shipped opt-in, and `lattice-emulator.js` said why in its own comment:
 * "existing decks and the curated galleries — whose stress slides demonstrate
 * overflow on PURPOSE — stay byte-unchanged. Default-on is a later decision, once
 * the catalog is audited."
 *
 * That audit is done. Rendering one gallery slide per family-reflowing component at
 * every registered @size, split off against split on, counting COMPONENTS that still
 * clip (page counts shift once a slide splits, so they are not comparable):
 *
 *     square     4 -> 2
 *     portrait  21 -> 5
 *     story      9 -> 3
 *     mobile     2 -> 2
 *
 * Splitting resolves 16 of the 21 components that clip at portrait. The residue is
 * not random: `logo-wall`, `matrix-2x2`, `pricing` and `split-compare` are exactly
 * the components `check-family-tiers.js --ladder` already reports as NOT ENROLLED —
 * they have no seam to split on — plus `roadmap`, whose transposed cards do not fit
 * a strip box even one per page. So the remaining work is enrollment, not fit.
 *
 * The deeper reason this is the right default, and not a tuning choice: the Fit
 * Spine has no shrink move (2026-06-22-the-fit-spine.md §3 — "there is no fifth
 * move, and crucially no shrink move"). When content does not fit, the only honest
 * answers are SPLIT or the overflow ring. Leaving split opt-in made the ring the
 * default answer for an author who never heard of the flag, so the engine's stated
 * policy and its out-of-the-box behavior disagreed. A cover, an atomic body, and a
 * carried continuation signal is what the design says should happen — so it should
 * happen without being asked for.
 *
 * `autosplit: off` remains, for the decks that demonstrate overflow deliberately.
 *
 * Pure + fs-free, so lint-core keeps its browser bundle contract.
 */

// Accepted spellings, both directions. `off` has to be recognized explicitly now:
// under the old default an unrecognized value read as "not on", which was also the
// default, so a typo was invisible. It is not invisible any more — a deck meaning
// `autosplit: off` that writes `autosplit: no` must still be obeyed.
const ON_RE = /^\s*autosplit:\s*(?:on|true|yes)\s*$/im;
const OFF_RE = /^\s*autosplit:\s*(?:off|false|no)\s*$/im;

/**
 * The deck's explicit choice, or null when it made none.
 * `source` may be the whole deck or just its front matter.
 */
function autosplitDirective(source) {
  const s = String(source || '');
  if (OFF_RE.test(s)) return false;
  if (ON_RE.test(s)) return true;
  return null;
}

/**
 * Does this deck want auto-split? DEFAULT ON — a deck that says nothing gets the
 * Fit Ladder's split move.
 *
 * This is the DECK's intent only. Whether the move actually runs is a second
 * question the caller answers from geometry: split is a non-landscape behavior (in a
 * wide box collapse + shed resolve overflow before split is reached), so the engine
 * gates on `orientationFor(geometry).name !== 'landscape'`. Keeping the two separate
 * is what lets lint say "you wrote `autosplit: on` on a landscape deck and it does
 * nothing" — a claim about the DIRECTIVE, not about the resolved behavior.
 */
function autosplitEnabled(source) {
  return autosplitDirective(source) !== false;
}

module.exports = { autosplitDirective, autosplitEnabled, ON_RE, OFF_RE };
