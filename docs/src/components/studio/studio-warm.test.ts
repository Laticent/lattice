import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyPanel, type Warmable, warmPanels } from './lazy-panel';
import { startStudioWarmUp, warmable } from './studio-warm';

// The queue's branches, without fetching anything: a fake `warmPanels` records the queue it is
// handed. What each surface actually loads, and that it opens offline, is
// docs/e2e/studio-warm-offline.spec.ts on the built site.

function queueFor(inputs: { katexUrl?: string | null; diagramRuntimeUrl?: string | null; fabricateUsed?: boolean }): ReadonlyArray<Warmable> {
	let queue: ReadonlyArray<Warmable> = [];
	startStudioWarmUp({
		warmPanels: (q) => {
			queue = q;
			return () => {};
		},
		katexUrl: inputs.katexUrl ?? null,
		diagramRuntimeUrl: inputs.diagramRuntimeUrl ?? null,
		fabricateUsed: inputs.fabricateUsed ?? false,
	});
	return queue;
}

afterEach(() => {
	Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('startStudioWarmUp', () => {
	it('warms the clip notice, Compose, Present and the reading view; not Fabricate for a browser that never opened it', () => {
		expect(queueFor({})).toHaveLength(4);
	});

	it('adds Fabricate once this browser has opened it', () => {
		expect(queueFor({ fabricateUsed: true })).toHaveLength(5);
	});

	it('adds the KaTeX provider for a deck with math, and fetches it without running it', async () => {
		const fetch = vi.fn(async () => new Response(''));
		vi.stubGlobal('fetch', fetch);
		const queue = queueFor({ katexUrl: '/playground/v/abc/lattice-katex.js' });
		expect(queue).toHaveLength(5);
		await queue[4].load();
		expect(fetch).toHaveBeenCalledWith('/playground/v/abc/lattice-katex.js');
	});

	it('adds the diagram library — the Mermaid plugin\'s payload, beside the runtime — and fetches it without running it', async () => {
		// The SAME file the preview frames' runtime loads (lib/plugins/host-browser.mjs
		// `ensureLibrary`), so the warm-up fills the cache the first diagram reads from.
		const fetch = vi.fn(async () => new Response(''));
		vi.stubGlobal('fetch', fetch);
		const queue = queueFor({ diagramRuntimeUrl: '/playground/v/abc/lattice-runtime.js' });
		expect(queue).toHaveLength(5);
		await queue[4].load();
		expect(fetch).toHaveBeenCalledWith('/playground/v/abc/mermaid.min.js');
	});

	it('under Save-Data keeps only the 1.7KB clip notice, plus Fabricate for a browser that asked for it', () => {
		Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
		expect(queueFor({ katexUrl: '/k.js', diagramRuntimeUrl: '/lattice-runtime.js' })).toHaveLength(1);
		expect(queueFor({ fabricateUsed: true })).toHaveLength(2);
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
