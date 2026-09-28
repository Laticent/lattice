/**
 * The Playground's VIRTUAL FILMSTRIP: only the slides in view are real sections, every
 * other slide is an empty `<div data-lv-ph>` sized like a slide.
 *
 * These pin what the scroll path relies on: a placeholder keeps the slide's identity and
 * nothing else; the window mounts ahead and unmounts lazily behind; a mount is stamped
 * `reflow` and inherits the fit of the element it replaces (so it costs no whole-filmstrip
 * fit); and a scroll that stays inside the mounted run answers from cached geometry without
 * touching the DOM.
 */

import { describe, expect, it, vi } from 'vitest';
import { attachVirtual, mountAround, syncVirtual } from './deck-render.js';
import { LV_ATTR, placeholderOf, virtualHtml, visibleRange, windowRange, withIndex } from './virtual-window.js';

const N = 40;
const PITCH = 400;
const TOP = 20;
const slide = (i: number) => `<section class="form${i === 7 ? ' sketch' : ''}" data-lattice-slide="${i + 1}" id="s${i}"><h1>Slide ${i}</h1></section>`;
const sections = Array.from({ length: N }, (_, i) => slide(i));

/** A frame whose slides sit at a fixed pitch. jsdom lays nothing out, so each slide's rect is
 *  computed from its position among the filmstrip's children and the window's scroll. */
function virtualFrame(mounted: (i: number) => boolean) {
	const doc = document.implementation.createHTMLDocument('preview');
	doc.body.innerHTML = `<article class="lattice" data-lv="">${sections.map((s, i) => (mounted(i) ? withIndex(s, i) : placeholderOf(s))).join('')}</article>`;
	const win = {
		scrollY: 0,
		innerWidth: 800,
		innerHeight: 900,
		__latticeFit: vi.fn(),
		performance: { now: () => 0 },
		requestAnimationFrame: (fn: () => void) => {
			fn();
			return 1;
		},
		setTimeout: (fn: () => void) => {
			fn();
			return 1;
		},
		clearTimeout: () => {},
		addEventListener: vi.fn(),
	} as Record<string, unknown> & { scrollY: number };
	const lattice = doc.querySelector('.lattice') as HTMLElement;
	const rectOf = (el: Element) => {
		const i = Array.prototype.indexOf.call(lattice.children, el);
		const top = TOP + i * PITCH - win.scrollY;
		return { top, bottom: top + 360, height: 360, left: 0, right: 640, width: 640, x: 0, y: top } as DOMRect;
	};
	const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		return rectOf(this);
	});
	const frame = { contentDocument: doc, contentWindow: win } as unknown as HTMLIFrameElement;
	return { frame, doc, win, lattice, restore: () => spy.mockRestore() };
}

const realIndices = (lattice: Element) =>
	Array.from(lattice.children)
		.map((el, i) => (el.tagName === 'SECTION' ? i : -1))
		.filter((i) => i >= 0);

describe('placeholders keep a slide identity and nothing else', () => {
	it('carries the slide number, the anchor id and the sketch flag, and no content', () => {
		expect(placeholderOf(slide(7))).toBe(`<div ${LV_ATTR}="" data-lattice-slide="8" id="s7" data-lv-sketch=""></div>`);
		expect(placeholderOf(slide(3))).not.toContain('Slide');
	});

	it('drops an attribute value outside its strict shape', () => {
		const ph = placeholderOf('<section data-lattice-slide="1&quot;x" id="a b"><p>x</p></section>');
		expect(ph).toBe(`<div ${LV_ATTR}=""></div>`);
	});

	it('virtualHtml mounts only what keep() names, and leaves an unclosed deck whole', () => {
		const html = sections.slice(0, 4).join('\n');
		const out = virtualHtml(html, (i: number) => i === 1);
		expect(out.match(/<section/g)?.length).toBe(1);
		expect(out.match(/data-lv-ph/g)?.length).toBe(3);
		const broken = '<section><p>never closed';
		expect(virtualHtml(broken, () => false)).toBe(broken);
	});

	it('window arithmetic clamps to the deck', () => {
		expect(windowRange(0, 0, 10, 3)).toEqual({ lo: 0, hi: 3 });
		expect(windowRange(9, 9, 10, 3)).toEqual({ lo: 6, hi: 9 });
		expect(visibleRange(TOP + 10 * PITCH, 900, TOP, PITCH, N)).toEqual({ first: 10, last: 12 });
	});
});

describe('syncVirtual moves the window with the scroll', () => {
	it('mounts three ahead of the view, stamps reflow, and keeps the slide count', () => {
		const { frame, win, lattice, restore } = virtualFrame((i) => i < 3);
		win.scrollY = TOP + 20 * PITCH;
		expect(syncVirtual(frame, { lastSections: sections })).toBe(true);
		expect(lattice.children.length).toBe(N);
		expect(realIndices(lattice)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25]);
		expect(lattice.getAttribute('data-lattice-swap')).toBe('reflow');
		expect(lattice.children[20].getAttribute('data-lv-i')).toBe('20');
		restore();
	});

	it('a mount inherits the fit of the placeholder it replaces, so no whole fit pass runs', () => {
		const { frame, win, lattice, restore } = virtualFrame((i) => i < 3);
		for (const el of Array.from(lattice.children) as (HTMLElement & { __lfT?: string; __lfM?: string })[]) {
			el.style.transform = 'scale(0.5)';
			el.style.marginBottom = '-352px';
			el.__lfT = 'scale(0.5)';
			el.__lfM = '-352px';
		}
		win.scrollY = TOP + 20 * PITCH;
		syncVirtual(frame, { lastSections: sections });
		const mounted = lattice.children[20] as HTMLElement & { __lfT?: string };
		expect(mounted.style.transform).toBe('scale(0.5)');
		expect(mounted.__lfT).toBe('scale(0.5)');
		expect(win.__latticeFit).not.toHaveBeenCalled();
		restore();
	});

	it('a scroll inside the mounted run answers from cache without touching the DOM', () => {
		const { frame, win, doc, restore } = virtualFrame((i) => i < 3);
		win.scrollY = TOP + 20 * PITCH;
		syncVirtual(frame, { lastSections: sections });
		const query = vi.spyOn(doc, 'querySelector');
		win.scrollY = TOP + 21 * PITCH;
		expect(syncVirtual(frame, { lastSections: sections })).toBe(false);
		expect(query).not.toHaveBeenCalled();
		restore();
	});

	it('a refit with no resize (the splitter drag) drops the cache', () => {
		const { frame, win, doc, lattice, restore } = virtualFrame((i) => i < 3);
		win.scrollY = TOP + 20 * PITCH;
		syncVirtual(frame, { lastSections: sections });
		(lattice.children[0] as HTMLElement).style.transform = 'scale(0.7)';
		const query = vi.spyOn(doc, 'querySelector');
		win.scrollY = TOP + 21 * PITCH;
		syncVirtual(frame, { lastSections: sections });
		expect(query).toHaveBeenCalled();
		restore();
	});

	it('unmounts lazily behind the view, and a new section list drops the cache', () => {
		const { frame, win, lattice, restore } = virtualFrame((i) => i < 3);
		win.scrollY = TOP + 20 * PITCH;
		syncVirtual(frame, { lastSections: sections });
		win.scrollY = TOP + 23 * PITCH;
		expect(syncVirtual(frame, { lastSections: sections })).toBe(true);
		// View 23..25: mounts 20..28; the run 17..25 keeps 18..25 (within five behind).
		expect(realIndices(lattice)).toEqual([18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
		// A render replaced the list: the next frame re-reads the DOM rather than trusting the cache.
		const query = vi.spyOn(frame.contentDocument as Document, 'querySelector');
		syncVirtual(frame, { lastSections: sections.slice() });
		expect(query).toHaveBeenCalled();
		restore();
	});

	it('mountAround mounts the target and keeps the run the scroll will pass through', () => {
		const { frame, lattice, restore } = virtualFrame((i) => i < 3);
		expect(mountAround(frame, { lastSections: sections }, 30)).toBe(true);
		const real = realIndices(lattice);
		expect(real).toContain(30);
		expect(real).toContain(0);
		restore();
	});
});

describe('a landing stays mounted while the scroll to it travels', () => {
	it('a sync near the start of a smooth scroll does not unmount the slides mountAround just mounted', () => {
		const { frame, win, lattice, restore } = virtualFrame((i) => i < 3);
		mountAround(frame, { lastSections: sections }, 30);
		// The smooth scroll's first frame: the view is still at the top.
		win.scrollY = TOP + PITCH / 2;
		syncVirtual(frame, { lastSections: sections });
		expect(realIndices(lattice)).toContain(30);
		restore();
	});
});

describe('attachVirtual seeks through a fling', () => {
	it('mounts nothing while the scroll crosses the viewport faster than the seek line', () => {
		const { frame, win, lattice, restore } = virtualFrame((i) => i < 3);
		let t = 0;
		win.performance = { now: () => t };
		const timers: (() => void)[] = [];
		win.setTimeout = (fn: () => void) => timers.push(fn);
		const listeners: Record<string, () => void> = {};
		win.addEventListener = (type: string, fn: () => void) => {
			listeners[type] = fn;
		};
		const frames: (() => void)[] = [];
		win.requestAnimationFrame = (fn: () => void) => frames.push(fn);
		const flush = () => {
			for (const fn of frames.splice(0)) fn();
		};
		attachVirtual(frame, () => ({ lastSections: sections }), () => {});
		flush();
		const before = realIndices(lattice);
		// A 4000px jump in 16ms: far past one viewport per 150ms.
		t = 16;
		win.scrollY = TOP + 10 * PITCH;
		listeners.scroll();
		flush();
		expect(realIndices(lattice)).toEqual(before);
		// The fling comes to rest: the rest timer mounts where it landed.
		for (const fn of timers.splice(0)) fn();
		expect(realIndices(lattice)).toContain(10);
		restore();
	});
});
