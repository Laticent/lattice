// ALIGNMENT — two views of one document that scroll together.
//
// An editor and a preview show the same sections (slides, chapters, cues) at different sizes: a slide's
// source is 260 px of text and its picture is 400 px. A ratio of the two scroll positions drifts by a
// section or more in the middle; a jump at every section boundary is jarring. Alignment here is a map
// between the two scroll positions that keeps the SECTIONS level instead:
//
//   · the first section is aligned at the TOP: both views at scroll 0;
//   · the last section is aligned at the BOTTOM: both views at their end;
//   · every section between is CENTERED: the scroll position that puts its middle at the middle of the
//     view in one is paired with the one that does the same in the other.
//
// That is one rule, not three: a section's centered scroll position is clamped into the view's scroll
// range, and the first and last sections cannot be centered (there is not enough document above or below
// them), so they clamp to the top and to the bottom. The pairs are anchors, and the map joins them with
// straight lines, so it is continuous (no jump at a boundary), monotone (scrolling down in one never
// scrolls up in the other), and exact at both ends. Text and picture are never level line for line, only
// section for section, and only an anchor is exactly level.
//
// A view is described by a `ViewLayout`: where each section starts and ends in the view's own scroll
// coordinates, the size of its window, and the size of its content. Both views must describe the SAME
// sections in the SAME order. Everything here is pure arithmetic on those snapshots, so it works for any
// two views a host can measure, and a test can hold it to its properties without a browser.

/** One view's measurements, in its own scroll coordinates (pixels, or any unit both ends use consistently). */
export interface ViewLayout {
	/** Where each section starts. Ascending, one per section. */
	readonly tops: readonly number[];
	/** Where each section ends. One per section, each at or after its top. */
	readonly bottoms: readonly number[];
	/** The window's size: how much of the content shows at once. */
	readonly viewport: number;
	/** The content's total size. */
	readonly content: number;
}

/** The furthest a view can scroll. */
export function maxScroll(l: ViewLayout): number {
	return Math.max(0, l.content - l.viewport);
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The scroll position that centers section `i`, before the clamp into the scroll range. */
export function centeredAt(l: ViewLayout, i: number): number {
	return (l.tops[i] + l.bottoms[i]) / 2 - l.viewport / 2;
}

/** A monotone, piecewise-linear map between two scroll positions. */
export interface ScrollMap {
	/** Where B scrolls to when A is at `scrollA`. */
	toB(scrollA: number): number;
	/** Where A scrolls to when B is at `scrollB`. */
	toA(scrollB: number): number;
}

/** The anchors: (A scroll, B scroll) pairs, strictly ascending in A, never descending in B. */
export function anchorsOf(a: ViewLayout, b: ViewLayout): Array<[number, number]> {
	const n = Math.min(a.tops.length, b.tops.length);
	const maxA = maxScroll(a);
	const maxB = maxScroll(b);
	const points: Array<[number, number]> = [[0, 0]];
	for (let i = 0; i < n; i++) {
		const pa = clamp(centeredAt(a, i), 0, maxA);
		const pb = clamp(centeredAt(b, i), 0, maxB);
		const [la, lb] = points[points.length - 1];
		// A section clamped onto an earlier one's position adds nothing: the earlier (the first, at the top)
		// keeps it. One that would run B backwards is skipped for the same reason.
		if (pa > la && pb >= lb && pa < maxA) points.push([pa, pb]);
	}
	// The end pairs with the end, whatever the last section's own center says: that is the bottom alignment.
	const [la, lb] = points[points.length - 1];
	if (maxA > la || maxB > lb) points.push([Math.max(maxA, la), Math.max(maxB, lb)]);
	return points;
}

/** The map between two layouts of the same sections. */
export function createScrollMap(a: ViewLayout, b: ViewLayout): ScrollMap {
	const pts = anchorsOf(a, b);
	const through = (from: 0 | 1, to: 0 | 1) => (x: number): number => {
		const first = pts[0][from];
		const last = pts[pts.length - 1][from];
		if (pts.length < 2 || last <= first) return pts[0][to];
		if (x <= first) return pts[0][to];
		if (x >= last) {
			// The end of `from` may be a flat run (a preview stuck at its bottom while the editor scrolls through its
			// padding): take the START of the run, so the last step down onto the end does not jump across it.
			let k = pts.length - 1;
			while (k > 0 && pts[k - 1][from] === last) k--;
			return pts[k][to];
		}
		// The last segment whose start is at or before x; a flat run on the `from` side (B stuck while A moves)
		// resolves to its start going one way and its end going the other, which is the stable choice.
		let lo = 0;
		let hi = pts.length - 2;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (pts[mid][from] <= x) lo = mid;
			else hi = mid - 1;
		}
		const [f0, t0] = [pts[lo][from], pts[lo][to]];
		const [f1, t1] = [pts[lo + 1][from], pts[lo + 1][to]];
		return f1 === f0 ? t0 : t0 + ((x - f0) / (f1 - f0)) * (t1 - t0);
	};
	return { toB: through(0, 1), toA: through(1, 0) };
}

/**
 * The section a view is "on" at scroll position `scroll`: the one whose centered position is nearest. That is
 * the same anchor the map pairs, so a section centered in one view is current in the other too. The ends are
 * the exceptions the alignment makes: at the top (scroll 0) the first section is current whatever follows it on
 * screen, and at the end the last. -1 for a view with no sections.
 */
export function sectionAt(l: ViewLayout, scroll: number): number {
	const n = l.tops.length;
	if (!n) return -1;
	const max = maxScroll(l);
	if (scroll <= 0) return 0;
	if (scroll >= max) return n - 1;
	// Centered positions rise with the sections: find the last one at or before `scroll`, then the nearer neighbor.
	let lo = 0;
	let hi = n - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (centeredAt(l, mid) <= scroll) lo = mid;
		else hi = mid - 1;
	}
	const next = Math.min(n - 1, lo + 1);
	return scroll - centeredAt(l, lo) <= centeredAt(l, next) - scroll ? lo : next;
}
