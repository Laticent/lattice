/**
 * The virtual filmstrip's mounted slides must stay ONE contiguous run.
 *
 * A window move mounts three slides either side of the view and unmounts only what is more than five
 * away, so a jump that leaves an old mounted slide inside the new keep range, with a slide that was
 * never mounted between it and the new run, used to leave a one-slide HOLE of placeholders: settle at
 * slide 5, land at 12: the old run's last slide is still inside the new keep range, and the slide
 * between it and the new run was never mounted. Nothing is wrong on screen, since the hole is four slides from the view, but
 * `contiguous` stays false, so every later scroll frame leaves the cached fast path and queries the
 * DOM until the hole fills. It was found in the audit (engineering/decisions/2026-10-16-preview-as-library-audit.md,
 * section 11b spike 2): 976 of 2,000 random walks with 20% jump frames hit one.
 */
import { describe, expect, it, vi } from 'vitest';
import { syncVirtual } from './deck-render.js';
import { placeholderOf, withIndex } from './virtual-window.js';

const N = 60;
const PITCH = 400;
const TOP = 20;
const sections = Array.from({ length: N }, (_, i) => `<section data-lattice-slide="${i + 1}" id="s${i}"><h1>Slide ${i}</h1></section>`);

function makeFrame(mounted: (i: number) => boolean) {
	const doc = document.implementation.createHTMLDocument('preview');
	doc.body.innerHTML = `<article class="lattice" data-lv="">${sections.map((s, i) => (mounted(i) ? withIndex(s, i) : placeholderOf(s))).join('')}</article>`;
	const win = {
		scrollY: 0,
		innerWidth: 800,
		innerHeight: 900,
		__latticeFit: vi.fn(),
		performance: { now: () => 0 },
		requestAnimationFrame: (fn: () => void) => (fn(), 1),
		setTimeout: (fn: () => void) => (fn(), 1),
		clearTimeout: () => {},
		addEventListener: vi.fn(),
	} as Record<string, unknown> & { scrollY: number };
	const lattice = doc.querySelector('.lattice') as HTMLElement;
	const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		const i = Array.prototype.indexOf.call(lattice.children, this);
		const top = TOP + i * PITCH - win.scrollY;
		return { top, bottom: top + 360, height: 360, left: 0, right: 640, width: 640, x: 0, y: top } as DOMRect;
	});
	return { frame: { contentDocument: doc, contentWindow: win } as unknown as HTMLIFrameElement, win, lattice, restore: () => spy.mockRestore() };
}

const mountedSet = (lattice: Element) =>
	Array.from(lattice.children)
		.map((el, i) => (el.tagName === 'SECTION' ? i : -1))
		.filter((i) => i >= 0);
const holes = (m: number[]) => (m.length ? m[m.length - 1] - m[0] + 1 - m.length : 0);
const scrollTo = (win: { scrollY: number }, slide: number) => {
	win.scrollY = TOP + slide * PITCH;
};

describe('a window move leaves one contiguous run', () => {
	it('slides 0..7 mounted, land at 12: slide 7 stays only if mounted slides connect it to the new run', () => {
		// The state the random walk below reaches: the view sat at slide 4, so 0..7 are real.
		const { frame, win, lattice, restore } = makeFrame((i) => i <= 7);
		scrollTo(win, 12);
		syncVirtual(frame, { lastSections: sections });
		expect(holes(mountedSet(lattice)), JSON.stringify(mountedSet(lattice))).toBe(0);
		// Before the fix this was [7, 9..17]: slide 7 inside the keep range, slide 8 never mounted.
		expect(mountedSet(lattice)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
		restore();
	});

	it('a seeded random walk with jumps never leaves a hole', () => {
		const { frame, win, lattice, restore } = makeFrame((i) => i < 3);
		let a = 20260719;
		const r = () => {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		let at = 0;
		let worst = 0;
		const seen: string[] = [];
		for (let step = 0; step < 4000; step++) {
			const prevAt = at;
			const before = JSON.stringify(mountedSet(lattice));
			at = r() < 0.2 ? Math.floor(r() * (N - 2)) : Math.max(0, Math.min(N - 3, at + (r() < 0.5 ? -1 : 1)));
			scrollTo(win, at);
			syncVirtual(frame, { lastSections: sections });
			const h = holes(mountedSet(lattice));
			if (h > worst) {
				worst = h;
				seen.push(`step ${step}: from ${prevAt} (${before}) to ${at}: ${JSON.stringify(mountedSet(lattice))}`);
			}
		}
		expect(worst, seen.slice(0, 2).join('\n')).toBe(0);
		restore();
	});
});

