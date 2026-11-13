// @vitest-environment-options { "url": "https://example.test/" }
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureEngine } from './load-engine';

afterEach(() => {
	document.head.innerHTML = '';
	vi.useRealTimers();
	window.LatticePlayground = undefined;
});

describe('ensureEngine', () => {
	it('stops polling once a load error rejects it', async () => {
		// The twin of ensure-katex.ts's leak (PR #3070): a poll left running after the reject read `window` for ~10 s and,
		// timing out, deleted a later retry's loader. Count the timers instead of waiting on one.
		vi.useFakeTimers();
		const url = 'https://example.test/playground/v/leak/lattice-playground.js';
		const p = ensureEngine(url);
		const before = vi.getTimerCount();
		const injected = document.querySelector<HTMLScriptElement>('script[data-lattice-engine]');
		expect(injected?.src).toBe(url);
		injected?.dispatchEvent(new Event('error'));
		await expect(p).rejects.toThrow(/failed to load/);
		expect(vi.getTimerCount()).toBe(before - 1);
	});

	it('stops polling once the load event resolves it', async () => {
		// The load listener resolved the promise but left the poll running until its next tick, which read `window`
		// after a test environment had gone (the same leak ensure-katex.ts had on its load path).
		vi.useFakeTimers();
		const url = 'https://example.test/playground/v/loaded/lattice-playground.js';
		const p = ensureEngine(url);
		const before = vi.getTimerCount();
		const injected = document.querySelector<HTMLScriptElement>('script[data-lattice-engine]');
		window.LatticePlayground = {} as typeof window.LatticePlayground;
		injected?.dispatchEvent(new Event('load'));
		await expect(p).resolves.toBeUndefined();
		expect(vi.getTimerCount()).toBe(before - 1);
	});
});
