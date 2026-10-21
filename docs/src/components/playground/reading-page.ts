import type { ViewLayout } from '@/lib/fuoco/align';

// THE PREVIEW FRAME, AS THE FOCUS SYNC SEES IT: its pages' geometry for the section alignment, and the mark
// on the slide in focus. (This file used to hold `readingPage`, the slide with most of itself in view; the
// alignment's `sectionAt` answers that now, from the same geometry.)

/** What one measurement of the preview's pages found: valid until the frame is resized, rescaled or re-rendered. */
interface PageGeometry {
	key: string;
	top0: number;
	pitch: number;
	height: number;
}
const geometry = new WeakMap<HTMLIFrameElement, PageGeometry>();

/**
 * The preview's measurements for the section alignment (fuoco/align.ts): one section per deck PART, from its
 * first page's top to its last page's bottom, in the frame's scroll coordinates. Like `readingPage`, it reads the
 * first two pages and counts: the filmstrip's pages are one size and one pitch apart, and a scroll is not the
 * moment to measure five hundred of them. A part with no page (the engine and the outline disagree) is a
 * zero-height section where the one before it ends, so the others keep their places.
 *
 * It runs on every scroll frame of either pane, and a scroll moves none of those numbers, so the geometry is
 * measured once per size of the frame, of its content and of its page count, and a scroll reads only `scrollY`.
 */
export function previewLayout(frame: HTMLIFrameElement | null, groups: readonly (readonly number[])[]): (ViewLayout & { scroll: number }) | null {
	const win = frame?.contentWindow;
	const doc = frame?.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	if (!frame || !win || !doc || !lattice || !groups.length) return null;
	const count = lattice.childElementCount;
	if (!count) return null;
	const content = doc.documentElement.scrollHeight;
	const key = `${win.innerWidth}|${win.innerHeight}|${content}|${count}`;
	let g = geometry.get(frame);
	if (!g || g.key !== key) {
		const r0 = lattice.children[0].getBoundingClientRect();
		const pitch = count > 1 ? lattice.children[1].getBoundingClientRect().top - r0.top : r0.height;
		if (!(pitch > 0) || !(r0.height > 0)) return null;
		g = { key, top0: win.scrollY + r0.top, pitch, height: r0.height };
		geometry.set(frame, g);
	}
	const tops: number[] = [];
	const bottoms: number[] = [];
	let end = g.top0;
	for (const pages of groups) {
		if (pages.length) {
			tops.push(g.top0 + pages[0] * g.pitch);
			end = g.top0 + pages[pages.length - 1] * g.pitch + g.height;
			bottoms.push(end);
		} else {
			tops.push(end);
			bottoms.push(end);
		}
	}
	return { tops, bottoms, viewport: win.innerHeight, content, scroll: win.scrollY };
}

/** The pages marked last in each frame, so a new mark touches those and the new ones, not every page. */
const marked = new WeakMap<HTMLIFrameElement, { doc: Document; pages: readonly number[] }>();

/** Mark the preview pages `pages` as the slide in focus (`db-active`, a bar down its left edge); none clears it. */
export function markPreviewPages(frame: HTMLIFrameElement | null, pages: readonly number[] | null): void {
	const doc = frame?.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	if (!frame || !doc || !lattice) return;
	const next = pages ?? [];
	const last = marked.get(frame);
	// A new document (a full write) has none of the old marks; start from what it actually carries.
	const before = last && last.doc === doc ? last.pages : Array.from(lattice.querySelectorAll(':scope > .db-active'), (el) => Array.prototype.indexOf.call(lattice.children, el));
	for (const i of before) if (!next.includes(i)) lattice.children[i]?.classList.remove('db-active');
	for (const i of next) lattice.children[i]?.classList.add('db-active');
	marked.set(frame, { doc, pages: next });
}
