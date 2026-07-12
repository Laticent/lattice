// The built-in palette NAMES + grouping — the source of truth for WHICH palettes
// exist and how they're grouped, extracted from ThemePicker so the pre-paint seed
// script in `studio.astro` (which can't import a React component module) can inject
// the SAME list instead of hand-copying a subset. Keeping these here, dependency-free,
// is what lets `studio.astro` honor every built-in palette at first paint; a returning
// visitor on a non-curated palette (ardesia, an a11y-* theme, …) would otherwise be
// dropped back to indaco and lose the instant-shell + flash the wrong color.
// ThemePicker re-exports these, so existing importers are unaffected.
//
// NOT the source of truth for palette COLORS: the accent swatch each name maps to still
// lives in ThemePicker's PALETTE_DOTS, and the on-disk CSS in themes/ is the true color.
// palettes.test.ts keeps this name list and PALETTE_DOTS in lockstep, so a palette added
// here can't ship a dot-less menu item (or a stale dot linger for a removed palette).

export const CURATED = ['indaco', 'cuoio', 'burgundy', 'laguna', 'crepuscolo', 'atelier', 'carbone', 'onyx'];
export const MORE_THEMES = ['ardesia', 'brina', 'carta', 'concrete', 'magnolia', 'mustard'];
export const A11Y_THEMES = ['a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];

/** Every palette the Studio can drive via `data-palette` — curated + more + the AA color-blind set. */
export const BUILTIN_PALETTES = [...CURATED, ...MORE_THEMES, ...A11Y_THEMES];
