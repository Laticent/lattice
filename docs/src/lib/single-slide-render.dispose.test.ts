// Behavior tests for the renderer teardown (PR #1031 leak fix + the adversarial-
// trio hardening). The existing DeckPreview test only proves DeckPreview *calls*
// dispose; these exercise the REAL createSingleSlideRenderer().dispose() body —
// that it actually disconnects the per-host ResizeObserver and the theme
// MutationObserver, and that a renderInto in flight when dispose() lands can't
// re-register the host afterward (the `disposed` latch — the trio's top finding).
//
// The engine + theme fetch are mocked (this isn't an engine test); everything on
// the teardown path — the ResizeObserver registration, scaleTargets, the disposed
// guard in renderInto's async continuation — is the real module.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn(async () => ({ html: '<section></section>', css: '' })) }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };

let observeSpy: ReturnType<typeof vi.fn>;
let disconnectSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
	observeSpy = vi.fn();
	disconnectSpy = vi.fn();
	class RO {
		observe = observeSpy;
		unobserve = vi.fn();
		disconnect = disconnectSpy;
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: '<section></section>', css: '' }));
});
afterEach(() => {
	(window as unknown as { LatticePlayground?: unknown }).LatticePlayground = undefined;
	document.body.innerHTML = '';
});

function mountHost() {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	return host;
}

describe('createSingleSlideRenderer().dispose()', () => {
	it('disconnects the per-host ResizeObserver registered by a render', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const status = await r.renderInto(host, '# a', false);
		expect(status.ok).toBe(true);
		expect(observeSpy).toHaveBeenCalledWith(host); // RO registered on the host
		expect(disconnectSpy).not.toHaveBeenCalled();

		r.dispose();
		expect(disconnectSpy).toHaveBeenCalledTimes(1); // released
		r.dispose(); // idempotent — no throw, no double-disconnect
		expect(disconnectSpy).toHaveBeenCalledTimes(1);
	});

	it('dispose() DURING the engine render bails before re-registering the host (disposed latch)', async () => {
		let release!: (v: { html: string; css: string }) => void;
		let renderStarted = false;
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
			renderStarted = true;
			return new Promise((res) => (release = res));
		});
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const pending = r.renderInto(host, '# a', false);

		// Let the async continuation run up to the (now-hung) engine render, so the
		// dispose lands genuinely mid-render — the exact tab-flip race the latch fixes.
		await new Promise((res) => setTimeout(res, 0));
		expect(renderStarted).toBe(true);

		r.dispose(); // unmount lands while renderMarkdown is in flight
		release({ html: '<section></section>', css: '' }); // the render now settles
		const status = await pending;

		// The settling continuation must bail before any DOM work: no RO observe, and a
		// not-ok status — so the host is never (re-)put into the module-level scaleTargets.
		expect(status.ok).toBe(false);
		expect(observeSpy).not.toHaveBeenCalled();
	});

	it('dispose() BEFORE the continuation runs skips the engine render entirely (first guard)', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		const pending = r.renderInto(host, '# a', false);
		r.dispose(); // lands before the themeReady.then continuation executes
		const status = await pending;
		expect(status.ok).toBe(false);
		expect(renderMarkdown).not.toHaveBeenCalled(); // didn't waste an engine render
		expect(observeSpy).not.toHaveBeenCalled();
	});

	it('onThemeChange returns an unsubscribe, and dispose() disconnects the theme observer', () => {
		const moDisconnect = vi.fn();
		const RealMO = globalThis.MutationObserver;
		class MO {
			observe = vi.fn();
			disconnect = moDisconnect;
			takeRecords = () => [];
		}
		(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = MO;
		try {
			const r = createSingleSlideRenderer(opts);
			const unsub = r.onThemeChange(() => {});
			expect(typeof unsub).toBe('function');
			r.dispose();
			expect(moDisconnect).toHaveBeenCalled(); // the documentElement observer is released
		} finally {
			(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = RealMO;
		}
	});
});
