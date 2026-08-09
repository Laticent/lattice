// The built-in palette NAMES + grouping + swatches, re-exported from the generated
// catalog so the pre-paint seed script in `studio.astro` (which can't import a React
// component module) gets the SAME list instead of hand-copying a subset. That is what
// lets `studio.astro` honor every built-in palette at first paint; a returning visitor
// on a non-curated palette (ardesia, an a11y-* theme, …) would otherwise be dropped
// back to indaco and lose the instant-shell + flash the wrong color.
//
// THE SOURCE IS `themes/<name>.manifest.json`. These lists used to be hand-maintained
// here, with the swatches hand-maintained separately in ThemePicker, and a test
// (palettes.test.ts) keeping the two in lockstep because adding a palette to one and
// forgetting the other shipped a dot-less menu item or a stale entry. Both now derive
// from one manifest field each — `tier`/`order`/`cvd` for the grouping, `swatch` for
// the dot — so they cannot disagree, and `checkThemeRoles` fails the build if a
// picker-listed palette declares no swatch.
//
// The generated module lives in `@/lib/` rather than beside this file because the SITE
// chrome (`components/site/PaletteSelectItems`) reads it too, and site code importing
// from `components/studio/` would be backwards. This file stays the Studio's entry
// point, so existing importers are unaffected.
//
// Still NOT the source of truth for palette COLORS: the on-disk CSS in themes/ is the
// true color; `swatch` is only the menu dot.
//
// Regenerate with `npm run build`; `theme-catalog:check` gates freshness.
// See engineering/decisions/2026-08-09-theme-token-contract.md.

export {
	A11Y_THEMES,
	BUILTIN_PALETTES,
	CURATED,
	isA11yPalette,
	MORE_THEMES,
	PALETTE_DOTS,
	THEME_FAMILY,
} from '@/lib/theme-catalog.generated';
