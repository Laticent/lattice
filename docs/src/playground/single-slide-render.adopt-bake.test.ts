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

type Host = HTMLElement & { __latticeFrameSig?: string; __latticeRestyleSig?: string; __latticePendingLoad?: boolean; __latticeBakeLoad?: Promise<void> };

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
			expect(host.__latticeBakeLoad).toBeInstanceOf(Promise);
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
			// Fake time, 3 s of it, under the 4 s bound: the render reaches its wait and stays parked there.
			await vi.advanceTimersByTimeAsync(3000);
			expect(settled).toBe(false);
			expect(fr.srcdoc).toBe(first);
			// The adopted document loads (the browser's onload, or the reveal poll's paint detection).
			fr.onload?.(new Event('load'));
			const out = await render;
			expect(host.__latticeBakeLoad).toBeUndefined();
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
