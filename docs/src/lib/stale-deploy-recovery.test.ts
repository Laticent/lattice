import { describe, expect, it, vi } from 'vitest';
import { FRESH_PARAM, installStaleDeployRecovery } from './stale-deploy-recovery.js';

const ORIGIN = 'https://lattice.style';
const STALE_CHUNK = '/_astro/StudioIsland.OLDHASH1.js';

function fakeWindow(
	opts: { href?: string; hydrated?: boolean; freshHtml?: string; online?: boolean; lastSwap?: number; noStorage?: boolean } = {},
) {
	const store = new Map<string, string>();
	if (opts.lastSwap) store.set(`lattice:stale-deploy-swap:/studio/${STALE_CHUNK}`, String(opts.lastSwap));
	let observe: ((records: unknown[]) => void) | null = null;
	class FakeObserver {
		constructor(cb: (records: unknown[]) => void) {
			observe = cb;
		}
		observe() {}
		takeRecords() {
			return [];
		}
		disconnect() {}
	}
	let onError: ((ev: unknown) => void) | null = null;
	const island = {
		getAttribute: () => STALE_CHUNK,
		hasAttribute: (n: string) => n === 'ssr' && !opts.hydrated,
	};
	const fetch = vi.fn((url: string, _init?: RequestInit) =>
		Promise.resolve({ ok: true, text: () => Promise.resolve(url.includes(FRESH_PARAM) ? (opts.freshHtml ?? '') : '') }),
	);
	const win = {
		document: { readyState: 'loading', documentElement: {}, addEventListener: () => {}, querySelectorAll: () => [island] },
		MutationObserver: FakeObserver,
		location: { href: opts.href ?? `${ORIGIN}/studio/`, origin: ORIGIN, replace: vi.fn() },
		history: { state: null, replaceState: vi.fn() },
		navigator: { onLine: opts.online ?? true },
		sessionStorage: {
			getItem: (k: string) => {
				if (opts.noStorage) throw new Error('SecurityError');
				return store.get(k) ?? null;
			},
			setItem: (k: string, v: string) => store.set(k, v),
		},
		fetch,
		addEventListener: (type: string, fn: (ev: unknown) => void, capture: boolean) => {
			if (type === 'error' && capture) onError = fn;
		},
	};
	// `parsed: false` is an element the page's scripts added after parsing (Vite's preload helper).
	const fail = (tag: string, attr: string, url: string, parsed = true) => {
		const el = { tagName: tag, getAttribute: (n: string) => (n === attr ? url : null) };
		if (parsed) observe?.([{ addedNodes: [el] }]);
		onError?.({ target: el });
	};
	const settle = () => new Promise((r) => setTimeout(r, 0));
	return { win, fetch, store, fail, settle };
}

const FRESH_PAGE = '<link rel="modulepreload" href="/_astro/StudioIsland.NEWHASH2.js">';

describe('installStaleDeployRecovery', () => {
	it('swaps onto the fresh page when a boot chunk 404s and the live page no longer names it', async () => {
		const f = fakeWindow({ freshHtml: FRESH_PAGE });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('LINK', 'href', STALE_CHUNK);
		await f.settle();
		await f.settle();
		expect(f.fetch).toHaveBeenCalledTimes(2);
		expect(f.fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
		expect(f.fetch.mock.calls[1]).toEqual(['/studio/', expect.objectContaining({ cache: 'reload' })]);
		expect(f.win.location.replace).toHaveBeenCalledOnce();
		expect(f.win.location.replace.mock.calls[0][0]).toMatch(/^\/studio\/\?__fresh=\d+$/);
		expect(f.store.get(`lattice:stale-deploy-swap:/studio/${STALE_CHUNK}`)).toBeTruthy();
	});

	it('does not swap when the live page still names the missing chunk (broken deploy, not a stale page)', async () => {
		const f = fakeWindow({ freshHtml: `<link rel="modulepreload" href="${STALE_CHUNK}">` });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('SCRIPT', 'src', STALE_CHUNK);
		await f.settle();
		await f.settle();
		expect(f.fetch).toHaveBeenCalledOnce();
		expect(f.win.location.replace).not.toHaveBeenCalled();
	});

	it('leaves a failure after hydration to chunk-load.ts', async () => {
		const f = fakeWindow({ hydrated: true, freshHtml: FRESH_PAGE });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('LINK', 'href', STALE_CHUNK);
		await f.settle();
		expect(f.fetch).not.toHaveBeenCalled();
	});

	it('ignores other origins, non-chunk assets, and an offline visitor', async () => {
		const f = fakeWindow({ freshHtml: FRESH_PAGE });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('SCRIPT', 'src', 'https://cdn.example.com/_astro/x.js');
		f.fail('LINK', 'href', '/_astro/outfit-300.abc.woff2');
		f.fail('LINK', 'href', '/playground/v/0123456789ab/lattice-playground.js');
		f.fail('IMG', 'src', STALE_CHUNK);
		await f.settle();
		expect(f.fetch).not.toHaveBeenCalled();

		const off = fakeWindow({ online: false, freshHtml: FRESH_PAGE });
		installStaleDeployRecovery(off.win as unknown as Window, { island: 'StudioIsland' });
		off.fail('LINK', 'href', STALE_CHUNK);
		await off.settle();
		expect(off.fetch).not.toHaveBeenCalled();
	});

	it('swaps at most once a minute per tab, so it cannot loop', async () => {
		const f = fakeWindow({ freshHtml: FRESH_PAGE, lastSwap: Date.now() - 5000 });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('LINK', 'href', STALE_CHUNK);
		await f.settle();
		expect(f.fetch).not.toHaveBeenCalled();
	});

	it('ignores a preload the page added at run time, which the HTML never named', async () => {
		const f = fakeWindow({ freshHtml: FRESH_PAGE });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('LINK', 'href', '/_astro/lazy-panel.ABC.js', false);
		await f.settle();
		expect(f.fetch).not.toHaveBeenCalled();
	});

	it('keys the guard by page and chunk, so a Playground swap never blocks the Studio', async () => {
		const f = fakeWindow({ freshHtml: FRESH_PAGE });
		f.store.set('lattice:stale-deploy-swap:/playground//_astro/PlaygroundIsland.OLD.js', String(Date.now()));
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('LINK', 'href', STALE_CHUNK);
		await f.settle();
		await f.settle();
		expect(f.win.location.replace).toHaveBeenCalledOnce();
	});

	it('never swaps without sessionStorage, since nothing could stop a loop', async () => {
		const f = fakeWindow({ freshHtml: FRESH_PAGE, noStorage: true });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		f.fail('LINK', 'href', STALE_CHUNK);
		await f.settle();
		expect(f.fetch).not.toHaveBeenCalled();
	});

	it('strips its own parameter on boot and keeps the others', () => {
		const f = fakeWindow({ href: `${ORIGIN}/studio/?new=1&${FRESH_PARAM}=123#s2` });
		installStaleDeployRecovery(f.win as unknown as Window, { island: 'StudioIsland' });
		expect(f.win.history.replaceState).toHaveBeenCalledWith(null, '', '/studio/?new=1#s2');
	});

	it('runs from its own source text, as the Astro component inlines it', async () => {
		const f = fakeWindow({ freshHtml: FRESH_PAGE });
		new Function('window', `(${installStaleDeployRecovery.toString()})(window, {"island":"StudioIsland"});`)(f.win);
		f.fail('LINK', 'href', STALE_CHUNK);
		await f.settle();
		await f.settle();
		expect(f.win.location.replace).toHaveBeenCalledOnce();
	});
});
