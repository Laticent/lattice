import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyPanel, type Warmable, warmPanels } from './lazy-panel';
import { startStudioWarmUp, warmable } from './studio-warm';

// The queue's branches, without fetching anything: a fake `warmPanels` records the queue it is
// handed. What each surface actually loads, and that it opens offline, is
// docs/e2e/studio-warm-offline.spec.ts on the built site.

function queueFor(inputs: { katexUrl?: string | null; fabricateUsed?: boolean }): ReadonlyArray<Warmable> {
	let queue: ReadonlyArray<Warmable> = [];
	startStudioWarmUp({
		warmPanels: (q) => {
			queue = q;
			return () => {};
		},
		katexUrl: inputs.katexUrl ?? null,
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
	it('warms Compose, Present and the reading view; not Fabricate for a browser that never opened it', () => {
		expect(queueFor({})).toHaveLength(3);
	});

	it('adds Fabricate once this browser has opened it', () => {
		expect(queueFor({ fabricateUsed: true })).toHaveLength(4);
	});

	it('adds the KaTeX provider for a deck with math, and fetches it without running it', async () => {
		const fetch = vi.fn(async () => new Response(''));
		vi.stubGlobal('fetch', fetch);
		const queue = queueFor({ katexUrl: '/playground/v/abc/lattice-katex.js' });
		expect(queue).toHaveLength(4);
		await queue[3].load();
		expect(fetch).toHaveBeenCalledWith('/playground/v/abc/lattice-katex.js');
	});

	it('skips every new surface under Save-Data, except Fabricate for a browser that asked for it', () => {
		Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
		expect(queueFor({ katexUrl: '/k.js' })).toHaveLength(0);
		expect(queueFor({ fabricateUsed: true })).toHaveLength(1);
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
