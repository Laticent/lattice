import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyPanel, type Warmable, warmPanels } from './lazy-panel';
import { startStudioWarmUp, WARM_FONT_FILES, warmable } from './studio-warm';

// The queue's branches, without fetching anything: a fake `warmPanels` records the queue it is
// handed. What each surface actually loads, and that it opens offline, is
// docs/e2e/studio-warm-offline.spec.ts on the built site.

function queueFor(inputs: { katexUrl?: string | null; diagramRuntimeUrl?: string | null; fabricateUsed?: boolean; themeBase?: string | null; firstSlide?: Promise<unknown> }): ReadonlyArray<Warmable> {
	let queue: ReadonlyArray<Warmable> = [];
	startStudioWarmUp({
		warmPanels: (q) => {
			queue = q;
			return () => {};
		},
		katexUrl: inputs.katexUrl ?? null,
		diagramRuntimeUrl: inputs.diagramRuntimeUrl ?? null,
		fabricateUsed: inputs.fabricateUsed ?? false,
		themeBase: inputs.themeBase ?? null,
		...(inputs.firstSlide ? { firstSlide: inputs.firstSlide } : {}),
	});
	return queue;
}

afterEach(() => {
	Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('startStudioWarmUp', () => {
	it('warms the clip notice, Hide/Show, Compose, Present and the reading view; not Fabricate for a browser that never opened it', () => {
		expect(queueFor({})).toHaveLength(5);
	});

	it('adds Fabricate once this browser has opened it', () => {
		expect(queueFor({ fabricateUsed: true })).toHaveLength(6);
	});

	it('adds the KaTeX provider for a deck with math, and fetches it without running it', async () => {
		const fetch = vi.fn(async () => new Response(''));
		vi.stubGlobal('fetch', fetch);
		const queue = queueFor({ katexUrl: '/playground/v/abc/lattice-katex.js' });
		expect(queue).toHaveLength(6);
		await queue[5].load();
		expect(fetch).toHaveBeenCalledWith('/playground/v/abc/lattice-katex.js');
	});

	it('adds the diagram library — the Mermaid plugin\'s payload, beside the runtime — and fetches it without running it', async () => {
		// The SAME file the preview frames' runtime loads (lib/plugins/host-browser.mjs
		// `ensureLibrary`), so the warm-up fills the cache the first diagram reads from.
		const fetch = vi.fn(async () => new Response(''));
		vi.stubGlobal('fetch', fetch);
		const queue = queueFor({ diagramRuntimeUrl: '/playground/v/abc/lattice-runtime.js' });
		expect(queue).toHaveLength(6);
		await queue[5].load();
		expect(fetch).toHaveBeenCalledWith('/playground/v/abc/mermaid.min.js');
	});

	it('under Save-Data keeps only the 1.7KB clip notice and Hide/Show\'s few hundred bytes, plus Fabricate for a browser that asked for it', () => {
		Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
		expect(queueFor({ katexUrl: '/k.js', diagramRuntimeUrl: '/lattice-runtime.js' })).toHaveLength(2);
		expect(queueFor({ fabricateUsed: true })).toHaveLength(3);
	});
});

// #3076: the fonts the preview frame skipped at startup (#3074), warmed into the HTTP cache after everything else.
describe('startStudioWarmUp — fonts', () => {
	const fetchStub = () => {
		const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('woff2'));
		vi.stubGlobal('fetch', fetch);
		return fetch;
	};

	it('lists every face the base sheet declares outside KaTeX: text, icons and the emoji slices', () => {
		expect(WARM_FONT_FILES).toContain('jetbrains-500');
		expect(WARM_FONT_FILES).toContain('caveat-400');
		expect(WARM_FONT_FILES).toContain('shantell-400');
		expect(WARM_FONT_FILES).toContain('lattice-icons-400');
		expect(WARM_FONT_FILES).toContain('noto-color-emoji-0');
		expect(WARM_FONT_FILES.some((f) => f.startsWith('KaTeX'))).toBe(false);
		expect(new Set(WARM_FONT_FILES).size).toBe(WARM_FONT_FILES.length);
	});

	it('appends one step per font, after every other warm-up, fetching the frame\'s own URL at low priority', async () => {
		const fetch = fetchStub();
		const queue = queueFor({ themeBase: '/playground/v/f1/themes/' });
		expect(queue).toHaveLength(5 + WARM_FONT_FILES.length);
		await queue[5].load();
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][0]).toBe(`/playground/v/f1/themes/fonts/${WARM_FONT_FILES[0]}.woff2`);
		expect(fetch.mock.calls[0][1]).toMatchObject({ priority: 'low' });
	});

	it('requests no font before the first slide is shown', async () => {
		const fetch = fetchStub();
		let show: () => void = () => {};
		const firstSlide = new Promise<void>((r) => {
			show = r;
		});
		const queue = queueFor({ themeBase: '/playground/v/f2/themes/', firstSlide });
		const loading = Promise.all(queue.slice(5).map((w) => w.load()));
		// Drain the microtasks the loaders queued: none may reach fetch while the slide is still pending.
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(fetch).not.toHaveBeenCalled();
		show();
		await loading;
		expect(fetch).toHaveBeenCalledTimes(WARM_FONT_FILES.length);
	});

	it('waits for a quiet moment before each font, after the first slide', async () => {
		const fetch = fetchStub();
		let quietNow: () => void = () => {};
		const quiet = vi.fn(
			() =>
				new Promise<void>((r) => {
					quietNow = r;
				}),
		);
		let queue: ReadonlyArray<Warmable> = [];
		startStudioWarmUp({
			warmPanels: (q) => {
				queue = q;
				return () => {};
			},
			katexUrl: null,
			diagramRuntimeUrl: null,
			fabricateUsed: false,
			themeBase: '/playground/v/f4/themes/',
			quiet,
		});
		const loading = queue[5].load();
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(quiet).toHaveBeenCalledTimes(1);
		expect(fetch).not.toHaveBeenCalled();
		quietNow();
		await loading;
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('warms no font under Save-Data', () => {
		Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
		expect(queueFor({ themeBase: '/playground/v/f3/themes/' })).toHaveLength(2);
	});

	it('warms no font without a themeBase', () => {
		expect(queueFor({ themeBase: null })).toHaveLength(5);
	});
});

describe('warmable', () => {
	it('loads once, and a failure neither rejects nor stops the warm-up', async () => {
		vi.useFakeTimers();
		const failing = vi.fn(() => Promise.reject(new Error('offline')));
		const after = vi.fn(async () => ({}));
		const w = warmable(failing);
		warmPanels([w, warmable(after), lazyPanel('A', async () => () => null)]);
		await vi.runAllTimersAsync();
		await expect(w.load()).resolves.toBeUndefined();
		expect(failing).toHaveBeenCalledTimes(1);
		expect(after).toHaveBeenCalledTimes(1);
	});
});
