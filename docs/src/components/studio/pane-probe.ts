/**
 * Whether a source could hold a pane slide: any pane marker, or a `columns` / `rows` layout in a
 * `_class` (lib/core/pane-spec.js `mayHavePanes`). The cheap reject every other deck takes.
 *
 * Its own module because two places ask it and one of them is EAGER: StudioShell decides from it
 * whether to lazy-load `./pane-pages` (budgeted out of the Studio's eager bundle,
 * docs/route-budget.json), and `pane-pages` asks it per slide. When StudioShell asked
 * `source.includes('pane:')` instead, a deck of outline-form slides (`_class: columns` over two
 * `###`, no marker) never loaded the page map, so a narrow deck's caret-to-page map and page
 * counts were wrong on exactly those slides.
 */
export const PANE_PROBE = /<!--\s*_?pane\s*:|<!--\s*_class\s*:[^>]*\b(?:columns|rows)\b/;

export function mayHavePaneSlides(source: string): boolean {
	return PANE_PROBE.test(String(source ?? ''));
}
