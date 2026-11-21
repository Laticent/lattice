// THE SCREEN CANVAS in renderInto (lib/core/screen-canvas.mjs): a 4K deck shown small reaches the engine as an HD deck,
// and `withSize` (lib/core/sizes.js) loads only on that path, so the render waits for it. Two things must hold while
// it waits: the 4K deck never reaches the engine unrewritten (that frame reloaded an iPhone tab), and a render started
// during the wait wins: the deferred one stands down instead of drawing an older deck over it.
//
// jsdom lays nothing out, so every host is 0 px wide and screenCanvas answers 'hd', the safe side. The engine and the
// theme fetch are mocked; renderInto's screen-canvas block, the loader and the stand-down are the real module.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/render-engine', () => ({ renderMarkdown: vi.fn(async () => ({ html: '<section></section>', css: '' })) }));
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('./font-embed.js', () => ({ previewFontFaceCss: () => '' }));

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const DECK_4K = '---\ntheme: indaco\nsize: 4k\n---\n\n# Four K\n';
const DECK_HD = '---\ntheme: indaco\n---\n\n# Newer\n';

type Mod = typeof import('./single-slide-render');
let mod: Mod;
let renderMarkdown: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	// A fresh module per test: the `withSize` loader is module state, and each test needs it not yet loaded.
	vi.resetModules();
	class RO {
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
	});
});
