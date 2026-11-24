// THE SCREEN CANVAS in renderInto (lib/core/screen-canvas.mjs): a 4K deck shown small reaches the engine as an HD deck,
// and `withSize` (lib/core/sizes.js) loads only on that path, so the render waits for it. Two things must hold while
// it waits: the 4K deck never reaches the engine unrewritten (that frame reloaded an iPhone tab), and a render started
// during the wait wins: the deferred one stands down instead of drawing an older deck over it.
//
// jsdom lays nothing out, so every host is 0 px wide and screenCanvas answers 'hd', the safe side. The engine and the
// theme fetch are mocked; renderInto's screen-canvas block, the loader and the stand-down are the real module.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/render-engine', () => ({ renderMarkdown: vi.fn(async () => ({ html: '<section></section>', css: '' })) }));
// `ensure` is a spy: renderInto fetches the theme after the screen-canvas block, so a render that never asks for it
// stood down at renderInto's entry latch, before any other work.
const ensure = vi.fn(async () => {});
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('./font-embed.js', () => ({ previewFontFaceCss: () => '' }));

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const DECK_4K = '---\ntheme: indaco\nsize: 4k\n---\n\n# Four K\n';
const DECK_HD = '---\ntheme: indaco\n---\n\n# Newer\n';

type Mod = typeof import('./single-slide-render');
/** Every ResizeObserver callback the renderer registered: calling one is a resize of the host it observes. */
const roCallbacks: (() => void)[] = [];
let mod: Mod;
let renderMarkdown: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	// A fresh module per test: the `withSize` loader is module state, and each test needs it not yet loaded.
	vi.resetModules();
	vi.doUnmock('../../../lib/core/sizes.js');
	ensure.mockClear();
	roCallbacks.length = 0;
	class RO {
		constructor(cb: () => void) {
			roCallbacks.push(cb);
		}
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	renderMarkdown = (await import('../lib/render-engine')).renderMarkdown as unknown as ReturnType<typeof vi.fn>;
	renderMarkdown.mockReset();
	renderMarkdown.mockImplementation(async () => ({ html: '<section></section>', css: '' }));
	mod = await import('./single-slide-render');
	document.body.innerHTML = '';
});

function mountHost() {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	return host;
}

const sources = () => renderMarkdown.mock.calls.map((c) => String(c[1]));

describe('the screen canvas in renderInto', () => {
	it('a 4K deck shown small reaches the engine as HD, never as 4K', async () => {
		const r = mod.createSingleSlideRenderer(opts);
		const status = await r.renderInto(mountHost(), DECK_4K, false);
		expect(status.ok).toBe(true);
		expect(sources().length).toBeGreaterThan(0);
		for (const src of sources()) {
			expect(src).toMatch(/^size: hd$/m);
			expect(src).not.toMatch(/^size: 4k$/m);
		}
		r.dispose();
	});

	it('a render started while withSize loads wins; the deferred 4K render stands down', async () => {
		const r = mod.createSingleSlideRenderer(opts);
		const host = mountHost();
		const first = r.renderInto(host, DECK_4K, false); // waits for lib/core/sizes.js
		const second = r.renderInto(host, DECK_HD, false); // a newer edit, no wait
		const [a, b] = await Promise.all([first, second]);
		expect(b.ok).toBe(true);
		expect(a).toEqual({ ok: false, slides: 0, error: 'renderer disposed' });
		// The older deck never reached the engine after the newer one, in either size.
		expect(sources().some((s) => s.includes('# Four K'))).toBe(false);
		expect(sources().some((s) => s.includes('# Newer'))).toBe(true);
		r.dispose();
	});

	it('a 4K deck already waiting does not render once the renderer is disposed (renderInto\'s own latch, on re-entry)', async () => {
		const r = mod.createSingleSlideRenderer(opts);
		const pending = r.renderInto(mountHost(), DECK_4K, false);
		r.dispose();
		expect(await pending).toEqual({ ok: false, slides: 0, error: 'renderer disposed' });
		expect(renderMarkdown).not.toHaveBeenCalled();
		// Stopped at the entry latch: without it the re-entry joins the shared memo's refcount on a disposed renderer
		// and fetches the theme before a later latch catches it.
		expect(ensure).not.toHaveBeenCalled();
	});

	/** lib/core/sizes.js as a stand-in whose `default` answers `first` on its first read and the real module after. */
	async function sizesAnswering(first: unknown) {
		const real = await vi.importActual<{ default?: unknown }>('../../../lib/core/sizes.js');
		let reads = 0;
		vi.doMock('../../../lib/core/sizes.js', () => ({
			get default() {
				reads++;
				return reads === 1 ? first : (real.default ?? real);
			},
		}));
		mod = await import('./single-slide-render');
	}

	it('a load that finds no withSize fails that render, and the next 4K render loads it again', async () => {
		vi.resetModules();
		await sizesAnswering({});
		const r = mod.createSingleSlideRenderer(opts);
		const first = await r.renderInto(mountHost(), DECK_4K, false);
		expect(first).toEqual({ ok: false, slides: 0, error: 'the 4K screen canvas could not load lib/core/sizes.js' });
		expect(renderMarkdown).not.toHaveBeenCalled(); // never the 4K deck, unrewritten
		const second = await r.renderInto(mountHost(), DECK_4K, false);
		expect(second.ok).toBe(true);
		for (const src of sources()) expect(src).toMatch(/^size: hd$/m);
		r.dispose();
	});

	it('a resize across the line while withSize loads leaves the waiting render to land on the new canvas itself', async () => {
		// sizes.js held at a gate, so the 4K render below is still waiting when the host widens.
		vi.resetModules();
		const real = await vi.importActual<object>('../../../lib/core/sizes.js');
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		vi.doMock('../../../lib/core/sizes.js', async () => {
			await gate;
			return real;
		});
		mod = await import('./single-slide-render');
		let width = 400; // a phone-sized slide: 400 device px at jsdom's density of 1
		const host = mountHost();
		Object.defineProperty(host, 'clientWidth', { get: () => width });
		const r = mod.createSingleSlideRenderer(opts);
		expect((await r.renderInto(host, DECK_HD, false)).ok).toBe(true); // the frame scaleFrame needs
		renderMarkdown.mockClear();

		// scaleFrame schedules its re-render with a 150 ms timer; capture it and run it by hand, never by waiting.
		const scheduled: (() => void)[] = [];
		const realSetTimeout = window.setTimeout;
		const spy = vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
			if (ms === 150) {
				scheduled.push(fn);
				return 0;
			}
			return realSetTimeout(fn, ms, ...rest);
		}) as typeof window.setTimeout);
		try {
			const waiting = r.renderInto(host, DECK_4K, false); // HD at 400 px: waits for withSize
			width = 3000; // made full screen on a 4K display: over the line, the deck's own canvas
			for (const cb of roCallbacks) cb();
			for (const fn of scheduled) fn();
			open();
			const status = await waiting;
			// The waiting render read the new width when it resumed: it rendered, on 4K, and its caller got its result.
			expect(status.ok).toBe(true);
			expect(sources().length).toBeGreaterThan(0);
			for (const src of sources()) expect(src).toMatch(/^size: 4k$/m);
		} finally {
			spy.mockRestore();
			r.dispose();
		}
	});
});
