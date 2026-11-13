import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordEngineUrl } from './engine-base';
import { ensurePluginData } from './ensure-plugin-data';

afterEach(() => {
	document.head.innerHTML = '';
	vi.useRealTimers();
});

describe('ensurePluginData', () => {
	it('stops polling once a load error rejects it', async () => {
		// The leak #3070 fixed in ensure-katex.ts and load-engine.ts: a poll left running after the error read `window` for
		// ~10 s and, timing out, deleted a later retry's loader. Count the timers instead of waiting on one.
		vi.useFakeTimers();
		recordEngineUrl(`${window.location.origin}/playground/v/leak/lattice-playground.js`);
		const p = ensurePluginData('A slide with @icon{star}.');
		const injected = document.querySelector<HTMLScriptElement>('script[data-lattice-plugin-data="icons"]');
		expect(injected).not.toBeNull();
		expect(vi.getTimerCount()).toBe(1);
		injected?.dispatchEvent(new Event('error'));
		await p; // best-effort: never rejects
		expect(vi.getTimerCount()).toBe(0);
	});
});
