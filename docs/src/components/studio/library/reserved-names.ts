// Shipped names are reserved, per type (2026-09-23-portable-packages.md §3.7).
//
// A saved theme or component is found BY NAME, and the Studio checks the saved shelf
// before the shipped set. So a theme saved as `indaco` re-skinned every deck in the
// workspace that says `theme: indaco`, and a component saved as `kpi` restyled every
// shipped `kpi` slide in any deck that also used it. Finishes already had this guard
// (`RESERVED_FINISH_NAMES`, `safeSaveSlug`); themes and components did not.
//
// The rule is the finish rule, generalized: a clash is renamed to `<name>-custom`
// and the caller says so. Names are unique PER TYPE: a theme and a component may
// both be called `atrium`, because they never share a namespace.
//
// The reserved lists come from generated catalogs, not a hand-kept copy, so they
// can't drift the way `RESERVED_FINISH_NAMES` once did (it listed five of nine).

// The stage catalog, not `lib/core/resolve-component.js`: resolve-component is CommonJS
// with a `require`, which the docs DEV server can't serve over /@fs and takes the Studio
// island down with it (astro.config.mjs). The catalog is the same generated manifest set
// (its keys ARE `COMPONENT_NAMES`, pinned by resolve-component.test.js) and a leaf
// `module.exports` the dev shim can default-import.
import STAGE_CATALOG from '../../../../../lib/forms/cell/masthead/stage-catalog.generated.js';
import { SHIPPED_THEME_NAMES } from '../../../lib/theme-catalog.generated';

/** Every theme name the engine ships, `-dark` companions and `lattice` included. */
export const RESERVED_THEME_NAMES: ReadonlySet<string> = new Set(SHIPPED_THEME_NAMES);

/** Every component name the engine ships. */
export const RESERVED_COMPONENT_NAMES: ReadonlySet<string> = new Set(Object.keys(STAGE_CATALOG as Record<string, unknown>));

/** The suffix a reserved name gets. The same one finishes use. */
export const RESERVED_SUFFIX = '-custom';

/**
 * The name a saved asset may actually use: `name` itself, or `<name>-custom` when
 * `name` is a shipped name of the same type. Pure; the caller rewrites anything that
 * spells the name (a theme's `@theme`, a component's selectors and skeleton).
 */
export function unreservedName(reserved: ReadonlySet<string>, name: string): string {
	return reserved.has(name) ? `${name}${RESERVED_SUFFIX}` : name;
}

/**
 * Rewrite a component's class selector `.from` to `.to` in its CSS. A component's
 * CSS is scoped by its own class (`section.kpi …`, `.kpi .row`), so a rename that
 * left the selectors alone would save `kpi-custom` whose rules still target `.kpi`,
 * which is the exact shadowing this module exists to stop.
 *
 * The match is a whole class token: `.kpi` followed by anything that can't continue
 * an identifier, so `.kpi-row` and `.kpis` are left alone.
 */
export function renameComponentSelectors(css: string, from: string, to: string): string {
	if (!from || from === to) return css;
	const esc = from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	return (
		String(css ?? '')
			.replace(new RegExp(`\\.${esc}(?![A-Za-z0-9_-])`, 'g'), `.${to}`)
			// …and a class ATTRIBUTE selector whose value is exactly the name:
			// `[class~="kpi"]`, `[class=kpi]`, `[class*='kpi' i]`. Left alone, it would
			// still target the shipped class after the rename.
			.replace(new RegExp(`(\\[\\s*class\\s*[~|^$*]?=\\s*)(["']?)${esc}\\2(?=[\\s\\]])`, 'g'), `$1$2${to}$2`)
	);
}
