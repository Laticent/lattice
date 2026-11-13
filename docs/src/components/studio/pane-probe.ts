/**
 * Whether a source could hold a pane slide: any pane marker in any spelling, or a `columns` / `rows` layout
 * (lib/core/pane-spec.js `mayHavePanes`). The cheap reject every other deck takes.
 *
 * Its own module because two places ask it and one of them is EAGER: StudioShell decides from it
 * whether to lazy-load `./pane-pages` (budgeted out of the Studio's eager bundle,
 * docs/route-budget.json), and `pane-pages` asks it per slide. When StudioShell asked
 * `source.includes('pane:')` instead, a deck of outline-form slides (`_class: columns` over two
 * `###`, no marker) never loaded the page map, so a narrow deck's caret-to-page map and page
 * counts were wrong on exactly those slides.
 */
// The marker spellings are the ones lib/core/meta-door.mjs `parsePaneMarker` reads (record note §5.4.1), and
// pane-probe.test.ts holds the two together: every comment that reader takes as a pane must pass here. This stays a
// regex, not a call to that reader, because it runs on every deck and every slide; pane-pages then reads exactly.
// The three arms: `_pane:` and the `pane:` alias; a `columns` / `rows` layout in a `_class`; a record
// (`<!-- {pane="bar"} -->`, `<!-- @meta{panes="60/40"} -->`, mixed with other fields) that names a pane, a pane
// layout or a `columns` / `rows` layout. A record's body ends at its comment's `-->`, so the scan stops there.
export const PANE_PROBE = /<!--\s*_?pane\s*:|<!--\s*_class\s*:[^>]*\b(?:columns|rows)\b|<!--\s*(?:@meta)?\{(?:(?!-->)[\s\S])*?(?:\bpanes?\s*=|\b(?:columns|rows)\b)/i;

export function mayHavePaneSlides(source: string): boolean {
	return PANE_PROBE.test(String(source ?? ''));
}
