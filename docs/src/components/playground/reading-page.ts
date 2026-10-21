import type { ViewLayout } from '@/lib/fuoco/align';

// THE PAGE THE READER IS ON, read from the preview frame: the slide with the most of itself in view.
// Shared by the focus sync (a scroll in Edit) and nothing else; the slide map no longer reads the frame.

/**
 * The page the reader is on: the slide with the most of itself in the view, the lower one on a tie.
 * This is `readingSlideIndex`'s rule (playground-controller.ts), computed from the first two sections'
 * geometry rather than every band, because the filmstrip's slides are one size and one pitch apart
 * and a scroll event is not the moment to measure five hundred of them.
 *
 * `current` is the page the focus already names. Like the walk's rule, it is kept while at least half
 * as much of it is in view as of the best page: a pick near the end of a deck cannot scroll its slide
 * to the top, and without this the preview would report the slide below it and overrule the pick.
 */
export function readingPage(frame: HTMLIFrameElement | null, count: number, current = -1): number | null {
	const win = frame?.contentWindow;
	const secs = frame?.contentDocument?.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]');
	if (!win || !secs?.length || !count) return null;
	const r0 = secs[0].getBoundingClientRect();
	const pitch = secs.length > 1 ? secs[1].getBoundingClientRect().top - r0.top : r0.height;
	if (!(pitch > 0) || !(r0.height > 0)) return null;
	const top = win.scrollY + r0.top;
	const from = Math.max(0, Math.floor((win.scrollY - top) / pitch));
	const to = Math.min(count - 1, Math.floor((win.scrollY + win.innerHeight - top) / pitch));
	const seenOf = (i: number) => {
		const start = top + i * pitch;
		return Math.max(0, Math.min(win.scrollY + win.innerHeight, start + r0.height) - Math.max(win.scrollY, start));
	};
	let best = from;
	let bestSeen = -1;
	for (let i = from; i <= to; i++) {
		const seen = seenOf(i);
		if (seen > bestSeen) {
			bestSeen = seen;
			best = i;
		}
	}
	if (current >= 0 && current < count && seenOf(current) * 2 >= bestSeen) return current;
	return Math.min(count - 1, best);
}

/** The selector for the preview's pages: a mounted slide, or the empty box standing for one the virtual filmstrip has not mounted. */
const PAGES = '.lattice > section, .lattice > div[data-lv-ph]';

/**
 * The preview's measurements for the section alignment (fuoco/align.ts): one section per deck PART, from its
 * first page's top to its last page's bottom, in the frame's scroll coordinates. Like `readingPage`, it reads the
 * first two pages and counts: the filmstrip's pages are one size and one pitch apart, and a scroll is not the
 * moment to measure five hundred of them. A part with no page (the engine and the outline disagree) is a
 * zero-height section where the one before it ends, so the others keep their places.
 */
export function previewLayout(frame: HTMLIFrameElement | null, groups: readonly (readonly number[])[]): (ViewLayout & { scroll: number }) | null {
	const win = frame?.contentWindow;
	const doc = frame?.contentDocument;
	const secs = doc?.querySelectorAll(PAGES);
	if (!win || !doc || !secs?.length || !groups.length) return null;
	const r0 = secs[0].getBoundingClientRect();
	const pitch = secs.length > 1 ? secs[1].getBoundingClientRect().top - r0.top : r0.height;
	if (!(pitch > 0) || !(r0.height > 0)) return null;
	const top0 = win.scrollY + r0.top;
	const tops: number[] = [];
	const bottoms: number[] = [];
	let end = top0;
	for (const pages of groups) {
		if (pages.length) {
			tops.push(top0 + pages[0] * pitch);
			end = top0 + pages[pages.length - 1] * pitch + r0.height;
			bottoms.push(end);
		} else {
			tops.push(end);
			bottoms.push(end);
		}
	}
	return { tops, bottoms, viewport: win.innerHeight, content: doc.documentElement.scrollHeight, scroll: win.scrollY };
}

/** Mark the preview pages `pages` as the slide in focus (`db-active`, outlined by `docStyleText`); none clears it. */
export function markPreviewPages(frame: HTMLIFrameElement | null, pages: readonly number[] | null): void {
	const secs = frame?.contentDocument?.querySelectorAll(PAGES);
	if (!secs) return;
	const on = new Set(pages ?? []);
	secs.forEach((el, i) => {
		if (el.classList.contains('db-active') !== on.has(i)) el.classList.toggle('db-active', on.has(i));
	});
}
