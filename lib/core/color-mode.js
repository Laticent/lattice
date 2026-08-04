/**
 * The color-mode canvas tokens — the section-class axis a deck's color mode
 * resolves into: `dark`, `light`, and (deck-wide only) `color-system` /
 * `color-inherited`.
 *
 * A per-slide `<!-- _class: dark -->` / `<!-- _class: light -->` (or, deck-wide,
 * the first-class `color-mode:` key — light/dark/system/inherited — or its legacy
 * `class: dark` / `class: light` alias) flips that section's `color-scheme` so the
 * palette's `light-dark()` surface tokens resolve to the chosen side
 * (base.modifiers.css `section.dark` / `section.light` / `section.color-system` /
 * `section.color-inherited`). The axis is mutually exclusive, and a per-slide token
 * wins over the deck-wide one. `dark`/`light` are the only PER-SLIDE values (system
 * and inherited are deck-wide intents that make no sense on one slide); all four are
 * listed here so the propagation guard treats the whole axis as one exclusive group.
 * The deck-wide value is resolved by lib/core/resolve-color-mode.js.
 *
 * This is the ONE source of truth shared by the deck-class propagation kernels
 * (lib/integrations/markdown-it/plugins.js + its runtime mirror lib/runtime/
 * index.js), which must NOT append the deck-wide color-mode token to a slide that
 * already carries its own. Keeping the token list here stops the two kernels from
 * drifting apart.
 *
 * Vocabulary note: `dark` is a universal variant (lib/components/index.js
 * UNIVERSAL_GROUPS.mood) while `light` is a base modifier (lib/authoring/lint.js
 * BASE_MODIFIERS) — split deliberately so `light` stays clear of the pre-existing
 * `divider.light` component variant (a manifest can't list a universal variant).
 * The linter accepts both everywhere, but they are NOT registered as an exclusive
 * axis, so a hand-authored `_class: dark light` is NOT flagged — it's an un-linted
 * footgun that CSS resolves deterministically (`section.light` follows `section.dark`,
 * so the light scheme wins). The real deck-wide-vs-per-slide case never produces the
 * conflict: the propagation guard drops the deck token when a slide pins its own.
 */

// `print` joins the axis (the B&W-safe paper band): it is mutually exclusive with the
// scheme values — a printed deck is ink-on-white, not light/dark — so the propagation
// guard drops any deck-wide scheme token on a slide that pins its own, and vice versa.
const COLOR_MODE_TOKENS = Object.freeze(['dark', 'light', 'color-light', 'color-system', 'color-inherited', 'print']);

/**
 * Does a slide's OWN color-mode token evict this deck-wide one?
 *
 * For every scheme value: yes. `_class: light` on a `color-mode: dark` deck renders
 * light, and appending the deck token alongside would leave two mutually exclusive
 * classes on one section, resolved by arbitrary CSS source order.
 *
 * FOR `print`: NO — and that exception is the whole reason this predicate exists.
 * Print is not a color scheme, it is a RENDER TARGET: `--print` / `color-mode: print`
 * says "this deck is going on paper", which cannot be outranked by a slide asking for
 * a dark canvas. `resolveDiagramBand` has always agreed (lib/core/diagram-band.js
 * rule 1: "PRINT WINS … nothing about light/dark can outrank it"), but the propagation
 * guard did not, and those two disagreeing is the seam that forced a reconciliation
 * device to exist:
 *
 *   deck `class: print` + slide `_class: dark`
 *     bake  → the PRINT band (dark ink on paper), per rule 1
 *     class → `section.dark` with `print` DROPPED, so the section is a dark canvas
 *             in a B&W handout AND its texture pin selects the dark-polarity chip set
 *             (built for white ink) under that dark print ink: ~2.7:1
 *
 * `data-lattice-slide-bake` and, before it, a `data-lattice-print` guard existed to
 * paper over exactly this. Making print non-droppable removes the disagreement
 * instead, so `section.print` really is on the section, the pins' `:not(.print)`
 * really is sufficient, and the CSS agrees with the bake by construction (#1332
 * step 4).
 *
 * ONE source of truth, called by BOTH propagation kernels
 * (lib/integrations/markdown-it/plugins.js and its runtime mirror in
 * lib/runtime/index.js) — HARD RULE #1. Two spellings of this rule is how it came
 * apart in the first place.
 */
function slidePinEvictsDeckToken(deckToken) {
  return deckToken !== 'print' && COLOR_MODE_TOKENS.includes(deckToken);
}

module.exports = { COLOR_MODE_TOKENS, slidePinEvictsDeckToken };
