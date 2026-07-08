/**
 * The color-mode canvas tokens — `dark` and `light`.
 *
 * A per-slide `<!-- _class: dark -->` / `<!-- _class: light -->` (or, deck-wide,
 * `class: dark` / `class: light`) flips that section's `color-scheme` so the
 * palette's `light-dark()` surface tokens resolve to the chosen side
 * (base.modifiers.css `section.dark` / `section.light`). The two are mutually
 * exclusive, and a per-slide token wins over the deck-wide one.
 *
 * This is the ONE source of truth shared by:
 *   - the deck-class propagation kernels (lib/integrations/markdown-it/plugins.js
 *     + its runtime mirror lib/runtime/index.js), which must NOT append the
 *     deck-wide color-mode token to a slide that already carries its own;
 *   - the authoring vocabulary (lib/components/index.js — UNIVERSAL_GROUPS.mood +
 *     EXCLUSIVE_AXES.mood), so the linter accepts `light` and flags `dark light`.
 * Keeping it here stops the two kernels + the vocab from drifting apart.
 */

const COLOR_MODE_TOKENS = Object.freeze(['dark', 'light']);

module.exports = { COLOR_MODE_TOKENS };
