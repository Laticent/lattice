// @vitest-environment node
// withinMs: a preview's bounded wait for an optional chunk (#2988). A load that never settles must
// give way after its bound, and a quick one must pass its value through untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withinMs } from './within-ms';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withinMs', () => {
	it('gives up with undefined once the bound passes on a promise that never settles', async () => {
		let settled = false;
		const waiting = withinMs(new Promise<string>(() => undefined), 8000).then((v) => {
			settled = true;
			return v;
		});
		await vi.advanceTimersByTimeAsync(7999);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await expect(waiting).resolves.toBeUndefined();
	});

	it('passes a quick value through, and a rejection still rejects', async () => {
		await expect(withinMs(Promise.resolve('chunk'), 8000)).resolves.toBe('chunk');
		await expect(withinMs(Promise.reject(new Error('offline')), 8000)).rejects.toThrow('offline');
	});
});
