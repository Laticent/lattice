// `adoptBake`: the renderer half of the Studio newcomer bake
// (engineering/decisions/2026-11-08-studio-newcomer-bake.md). A bake is the PARTS of one full write
// plus the host state it leaves; the renderer builds the document from them with its own nonce.
//
// jsdom does not parse a srcdoc into the frame, so whether the first live render then PATCHES the
// adopted document is a browser fact, pinned in e2e/studio-newcomer-bake.spec.ts. What is module
// logic, and tested here: what a bake must match to be adopted, that the document it writes carries
// this page load's nonce, the state it seeds, and that a render waits for an adopted document to load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/render-engine', () => ({ renderMarkdown: vi.fn(async () => ({ html: '<div class="lattice"><section><h1>Hi</h1></section></div>', css: '.x{}', width: 1280, height: 720 })) }));
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('./font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { PAGE_SCRIPT_NONCE } from './page-script-nonce.js';
import { type BakedWrite, bakeSourceKey, clearDeckMemo, clearSliceCache, createSingleSlideRenderer, type NewcomerBake } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js', scaleImages: true, liveLayout: true };
const DECK = '# One\n\n---\n\n# Two';

type Host = HTMLElement & { __latticeFrameSig?: string; __latticeRestyleSig?: string; __latticePendingLoad?: boolean; __latticeDocLoad?: Promise<void> };

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	document.documentElement.setAttribute('data-palette', 'cuoio');
	document.documentElement.setAttribute('data-mode', 'light');
	clearDeckMemo();
	clearSliceCache();
});
afterEach(() => {
	(window as unknown as { LatticePlayground?: unknown }).LatticePlayground = undefined;
	document.body.innerHTML = '';
});

function mountHost(): Host {
	const host = document.createElement('figure') as Host;
	document.body.appendChild(host);
	return host;
}

/** A bake made the way the build makes one: a real write through `captureWrite`, and the host state after it. */
async function makeBake(): Promise<NewcomerBake> {
	let write: BakedWrite | null = null;
	const r = createSingleSlideRenderer({ ...opts, captureWrite: (p) => (write = p) });
	const host = mountHost();
	try {
		const out = await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, { slideIndex: 0, slideCount: 2, slideMarkdown: '# One', deckId: 'd' });
		expect(out.writePath).toBe('write');
		const h = host as Host & { __latticeFrameCss?: NewcomerBake['host']['frameCss']; __latticeShownSlide?: NewcomerBake['host']['shownSlide'] };
		if (!write) throw new Error('no write captured');
		return {
			v: 1,
			src: bakeSourceKey(DECK),
			slideIndex: 0,
			palette: 'cuoio',
			flags: 'LI',
			runtimeUrl: opts.runtimeUrl,
			write,
			host: { frameSig: h.__latticeFrameSig as string, restyleSig: h.__latticeRestyleSig as string, frameCss: h.__latticeFrameCss as NewcomerBake['host']['frameCss'], shownSlide: h.__latticeShownSlide as NewcomerBake['host']['shownSlide'] },
		};
	} finally {
		r.dispose();
		host.remove();
	}
}

describe('adoptBake', () => {
	it('writes the bake into a fresh host, with this page load’s nonce, and seeds the write’s state', async () => {
		const bake = await makeBake();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			expect(r.adoptBake(host, bake, { markdown: DECK, slideIndex: 0 })).toBe(true);
			expect(host.getAttribute('data-lattice-bake')).toBe('adopted');
			const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
			expect(fr).not.toBeNull();
			const doc = fr?.srcdoc ?? '';
			expect(doc).toContain('<h1>Hi</h1>');
			expect(doc).toContain(`nonce="${PAGE_SCRIPT_NONCE}"`);
			expect(host.__latticeFrameSig).toBe(bake.host.frameSig);
			expect(host.__latticeRestyleSig).toBe(bake.host.restyleSig);
			expect(host.__latticePendingLoad).toBe(true);
			expect(host.__latticeDocLoad).toBeInstanceOf(Promise);
		} finally {
			r.dispose();
		}
	});

	it.each([
		['runtime', (b: NewcomerBake) => ({ ...b, runtimeUrl: 'https://x/other.js' })],
		['flags', (b: NewcomerBake) => ({ ...b, flags: 'I' })],
		['theme', (b: NewcomerBake) => ({ ...b, palette: 'indaco' })],
		['slide', (b: NewcomerBake) => ({ ...b, slideIndex: 1 })],
		['source', (b: NewcomerBake) => ({ ...b, src: bakeSourceKey(`${DECK}!`) })],
		['shape', (b: NewcomerBake) => ({ ...b, v: 2 }) as unknown as NewcomerBake],
	])('refuses a bake whose %s does not match, and writes nothing', async (why, mutate) => {
		const bake = mutate(await makeBake());
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			expect(r.adoptBake(host, bake, { markdown: DECK, slideIndex: 0 })).toBe(false);
			expect(host.getAttribute('data-lattice-bake')).toBe(`refused:${why}`);
			expect(host.querySelector('iframe.live')).toBeNull();
		} finally {
			r.dispose();
		}
	});

	it('refuses a bake for the other mode', async () => {
		const bake = await makeBake();
		document.documentElement.setAttribute('data-mode', 'dark');
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			expect(r.adoptBake(host, bake, { markdown: DECK, slideIndex: 0 })).toBe(false);
			expect(host.getAttribute('data-lattice-bake')).toBe('refused:theme');
		} finally {
			r.dispose();
		}
	});

	it('refuses a host the renderer has already written', async () => {
		const bake = await makeBake();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, { slideIndex: 0, slideCount: 2, slideMarkdown: '# One', deckId: 'd' });
			expect(r.adoptBake(host, bake, { markdown: DECK, slideIndex: 0 })).toBe(false);
			expect(host.getAttribute('data-lattice-bake')).toBe('refused:written');
		} finally {
			r.dispose();
		}
	});

	it('makes the first render wait for the adopted document to load, then clears the wait', async () => {
		const bake = await makeBake();
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			expect(r.adoptBake(host, bake, { markdown: DECK, slideIndex: 0 })).toBe(true);
			const fr = host.querySelector('iframe.live') as HTMLIFrameElement;
			const first = fr.srcdoc;
			let settled = false;
			const render = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, { slideIndex: 0, slideCount: 2, slideMarkdown: '# One', deckId: 'd' }).then((o) => {
				settled = true;
				return o;
			});
			// Fake time, 3 s of it, well under the bound: the render reaches its wait and stays parked there.
			await vi.advanceTimersByTimeAsync(3000);
			expect(settled).toBe(false);
			expect(fr.srcdoc).toBe(first);
			// The adopted document loads (the browser's onload, or the reveal poll's paint detection).
			fr.onload?.(new Event('load'));
			const bakeLoad = host.__latticeDocLoad;
			const out = await render;
			// The bake's wait is released. jsdom loads nothing, so the render's own full write now holds the frame's
			// pending load, for the next render to wait on (single-slide-render.ts, the document-load wait).
			expect(host.__latticeDocLoad).not.toBe(bakeLoad);
			// jsdom never parses the srcdoc, so there is no `.lattice` to patch and the render writes; in a
			// browser it patches (e2e/studio-newcomer-bake.spec.ts).
			expect(out.ok).toBe(true);
			expect(out.writePath).toBe('write');
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});
});

// The same wait, for an ordinary full write: a first Studio visit with no bake issued two renders with the same
// signature 8 to 21 ms apart, and the second wrote the whole document again because the first was still loading
// (engineering/decisions/2026-11-08-studio-newcomer-bake.md §7). In a browser the waiting render then patches the loaded document;
// jsdom parses nothing, so here it writes once the wait ends. What is module logic: it waits, and it is bounded.
describe('a full write still loading', () => {
	const SLIDE = { slideIndex: 0, slideCount: 2, slideMarkdown: '# One', deckId: 'd' };

	it('makes the next render wait for it to load before touching the frame', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			const first = await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			expect(first.writePath).toBe('write');
			const fr = host.querySelector('iframe.live') as HTMLIFrameElement;
			const written = fr.srcdoc;
			let settled = false;
			const second = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE).then((o) => {
				settled = true;
				return o;
			});
			await vi.advanceTimersByTimeAsync(3000);
			// Parked on the first write's load: no second document yet.
			expect(settled).toBe(false);
			expect(fr.srcdoc).toBe(written);
			fr.onload?.(new Event('load'));
			expect((await second).ok).toBe(true);
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});

	it('writes anyway once the bound passes, for a frame that never loads', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			const second = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			await vi.advanceTimersByTimeAsync(30_100);
			const out = await second;
			expect(out.ok).toBe(true);
			expect(out.writePath).toBe('write');
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});

	it('a render a newer write owns stands down, and leaves that write\'s waiters alone', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			const fr = host.querySelector('iframe.live') as HTMLIFrameElement;
			let bSettled = false;
			// B parks on the first write's load.
			const b = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE).then((o) => {
				bSettled = true;
				return o;
			});
			await vi.advanceTimersByTimeAsync(1000);
			// C starts later and needs another box, so it writes at once: a newer document, still loading.
			const rs = host.__latticeRestyleSig;
			host.__latticeRestyleSig = 'another box';
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			const cWrite = fr.srcdoc;
			const cLoad = host.__latticeDocLoad;
			// Put back the box B asked for, so C's document is one B can patch.
			host.__latticeRestyleSig = rs;
			await vi.advanceTimersByTimeAsync(10);
			// C owns the frame now, so B stands down without writing and without releasing C's waiters.
			expect(bSettled).toBe(true);
			expect((await b).ok).toBe(false);
			expect(fr.srcdoc).toBe(cWrite);
			expect(host.__latticeDocLoad).toBe(cLoad);
			// D, newer than C, finds C's document loading: it waits on it rather than writing behind it.
			let dSettled = false;
			const d = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE).then((o) => {
				dSettled = true;
				return o;
			});
			await vi.advanceTimersByTimeAsync(3000);
			expect(dSettled).toBe(false);
			expect(fr.srcdoc).toBe(cWrite);
			fr.onload?.(new Event('load'));
			expect((await d).ok).toBe(true);
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});

	it('waits again when an older render gives up and writes while it waits, instead of writing behind it', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			const fr = host.querySelector('iframe.live') as HTMLIFrameElement;
			// Count every write from here on (the mocked engine returns the same document each time, so the text
			// alone cannot tell two writes apart).
			let writes = 0;
			const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
			if (!d?.set) throw new Error('no srcdoc accessor');
			const { set } = d;
			Object.defineProperty(fr, 'srcdoc', { configurable: true, get: d.get, set(v: string) { writes++; set.call(this, v); } });
			const b = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			await vi.advanceTimersByTimeAsync(500);
			let cSettled = false;
			const c = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE).then((o) => {
				cSettled = true;
				return o;
			});
			// The first document never loads. B's bound passes first: it writes, which releases C.
			await vi.advanceTimersByTimeAsync(29_600);
			expect((await b).writePath).toBe('write');
			expect(writes).toBe(1);
			// C, newer than B, waits again on B's document instead of writing a second one behind it.
			await vi.advanceTimersByTimeAsync(3000);
			expect(cSettled).toBe(false);
			expect(writes).toBe(1);
			fr.onload?.(new Event('load'));
			expect((await c).ok).toBe(true);
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});

	it('releases a waiting render when the host leaves the page, instead of holding it for the whole bound', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			let settled = false;
			const second = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE).then((o) => {
				settled = true;
				return o;
			});
			await vi.advanceTimersByTimeAsync(50);
			expect(settled).toBe(false);
			host.remove();
			// The reveal poll's next tick (100 ms) sees the host gone, stops, and releases the waiter, which stands down.
			await vi.advanceTimersByTimeAsync(200);
			expect(settled).toBe(true);
			expect((await second).ok).toBe(false);
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});

	it('the bound itself releases a waiter when nothing else will (the poll already stopped)', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost() as Host & { __latticeRevealPoll?: ReturnType<typeof setInterval> };
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			// Stop the poll without letting it release anyone, so only the render's own timer can.
			clearInterval(host.__latticeRevealPoll);
			let settled = false;
			const second = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE).then((o) => {
				settled = true;
				return o;
			});
			await vi.advanceTimersByTimeAsync(29_000);
			expect(settled).toBe(false);
			await vi.advanceTimersByTimeAsync(1_100);
			expect(settled).toBe(true);
			expect((await second).writePath).toBe('write');
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});

	it('does not wait when the next render needs another frame box, which only a write can give', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			await r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE);
			host.__latticeRestyleSig = 'another box';
			let settled = false;
			const second = r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, SLIDE).then((o) => {
				settled = true;
				return o;
			});
			await vi.advanceTimersByTimeAsync(50);
			expect(settled).toBe(true);
			expect((await second).writePath).toBe('write');
		} finally {
			r.dispose();
			vi.useRealTimers();
		}
	});
});
