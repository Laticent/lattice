/**
 * The color-mode canvas tokens — `dark` and `light`.
 *
 * A per-slide `<!-- _class: dark -->` / `<!-- _class: light -->` (or, deck-wide,
 * `class: dark` / `class: light`) flips that section's `color-scheme` so the
 * palette's `light-dark()` surface tokens resolve to the chosen side
 * (base.modifiers.css `section.dark` / `section.light`). The two are mutually
 * exclusive, and a per-slide token wins over the deck-wide one.
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

const COLOR_MODE_TOKENS = Object.freeze(['dark', 'light']);

module.exports = { COLOR_MODE_TOKENS };
