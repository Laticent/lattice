/**
 * One page per step: the page-per-step export's kernel, kept OUT of step-state.mjs because only an export runs it.
 * step-state.mjs loads with every Present surface (the Studio, the Playground and the home page load it eagerly), and
 * this function would ride along on each for nothing (the route budget measured it at +813 gzip bytes, 2026-11-10).
 * The CLI (lattice.js `--steps`) and the Studio's capture frame (deck-export.js `createCaptureFrame`) import it here.
 */

/**
 * THE PAGE-PER-STEP EXPORT (engineering/decisions/2026-11-09-steps-as-a-behavior.md §4, S3; the owner's D1, 2026-11-09):
 * every stepping slide under `root` becomes one page per step, 1…N, each a copy of the slide painted at that step.
 * A build's step 0 shows nothing, so it is not a page; its step N is the whole slide. A focus walk's pages are its N
 * lit steps; its rest frame is not repeated.
 *
 * It runs on a document that has FINISHED rendering (the CLI's settled page, the Studio's capture frame), so no page
 * number, section count, rail or agenda reference ever sees the extra pages: each copy keeps its slide's stamps, so
 * every page of one slide prints that slide's number (S3). A hidden slide is left alone (exports drop it anyway).
 *
 * `paint` is `applyStepAt`, passed in so this function's source stays self-contained for inlining. Returns, per
 * top-level slide in document order, how many pages it became (1 for a slide that does not step), so a caller that
 * keys data by page (speaker notes, comments) can follow the expansion.
 *
 * @param {Document|Element} root @param {(section: Element, at: number|null) => void} paint
 * @returns {number[]}
 */
export function expandStepPages(root, paint) {
	const secs = Array.prototype.filter.call(root.querySelectorAll('section'), (s) => !s.parentElement?.closest('section'));
	const counts = [];
	for (const sec of secs) {
		const kind = sec.getAttribute('data-step-kind');
		const n = Number(sec.getAttribute('data-steps')) || 0;
		if ((kind !== 'build' && kind !== 'focus') || n < 1 || sec.getAttribute('data-lattice-hidden') === 'true') {
			counts.push(1);
			continue;
		}
		let after = sec;
		for (let k = 2; k <= n; k++) {
			const copy = sec.cloneNode(true);
			copy.setAttribute('data-step-page', String(k));
			paint(copy, k);
			after.after(copy);
			after = copy;
		}
		sec.setAttribute('data-step-page', '1');
		paint(sec, 1);
		counts.push(n);
	}
	return counts;
}
