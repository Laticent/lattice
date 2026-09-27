// A split PANES slide in the preview (single-slide-render.ts `renderInto`, docs/src/components/
// studio/pane-pages.ts): where the shown source slide sits among the RENDERED sections, and which
// of its pages to show. Its own module, loaded only when a host hands over a pane map, because the
// Studio's eager bundle is budgeted (docs/route-budget.json) and a deck without panes needs none of
// it.

export type PaneRun = {
	/** The map, when it is usable: index-aligned with the host's slides, length `slideCount`. */
	paneCounts: number[] | undefined;
	/** How many rendered slides the shown source slide is (2 for a split panes slide). */
	paneRun: number;
	/** The shown slide's first rendered section, and the deck's rendered count. */
	renderedBase: number;
	renderedTotal: number | undefined;
	/** The page of a split slide to show: navigation's, else the caret's, else the one shown. */
	panePage: number;
};

export function paneRunFor(
	opts: { slideIndex?: number; slideCount?: number; paneCounts?: number[]; panePage?: number; pageIndex?: number; deckId?: string },
	prev: { deck: string; slide: number; page: number } | undefined,
): PaneRun {
	const counts = typeof opts.slideIndex === 'number' && Array.isArray(opts.paneCounts) && opts.paneCounts.length === opts.slideCount ? opts.paneCounts : undefined;
	const index = opts.slideIndex ?? 0;
	const paneRun = counts ? Math.max(1, counts[index] ?? 1) : 1;
	let panePage = 0;
	if (paneRun > 1) {
		const kept = prev && prev.slide === opts.slideIndex && prev.deck === (opts.deckId ?? '') ? prev.page : 0;
		const asked = typeof opts.pageIndex === 'number' ? (Number.isFinite(opts.pageIndex) ? opts.pageIndex : paneRun - 1) : null;
		const want = asked ?? (typeof opts.panePage === 'number' ? opts.panePage : kept);
		panePage = Math.max(0, Math.min(Math.trunc(want), paneRun - 1));
	}
	return {
		paneCounts: counts,
		paneRun,
		renderedBase: counts ? counts.slice(0, index).reduce((a, b) => a + b, 0) : index,
		renderedTotal: counts ? counts.reduce((a, b) => a + b, 0) : opts.slideCount,
		panePage,
	};
}

/** The page report for a split panes slide the frame now holds: the label is the number the frame
 *  PRINTS, so the pill and the slide cannot disagree. */
export function panePageReport(html: string, run: PaneRun): { index: number; count: number; label: string } {
	const printed = (html.match(/\sdata-lattice-pagination="([^"]+)"/) || [])[1];
	return { index: run.panePage, count: run.paneRun, label: printed ?? String(run.renderedBase + run.panePage + 1) };
}
