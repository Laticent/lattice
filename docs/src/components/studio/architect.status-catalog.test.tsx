// useArchitectStatus names the picked OpenRouter model from the catalog, which the model module prefetches at boot.
// A status read before that fetch lands used to keep the id-derived name ("test/model" as "Model") until the author
// opened the chip, since nothing read the catalog again. Found by e2e/model-spine.spec.ts:155 under load
// (followups.d/3087-p4-mobile-load-only-flakes.md).

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let catalog: { id: string; name: string }[] | null = null;
let land: () => void = () => {};
const listed = new Promise<void>((resolve) => {
	land = () => {
		catalog = [{ id: 'test/model', name: 'Test Model' }];
		resolve();
	};
});
const listCalls = vi.fn((): Promise<void> => listed);
const accountCalls = vi.fn(async () => null);

vi.mock('@/components/studio/ai/architect-model.js', () => ({
	loadOpenRouterKey: async () => {},
	loadProviderKey: async () => {},
	createArchitectModel: () => ({
		availability: () => ({ generation: 'openrouter', readiness: { source: 'cloud', provider: 'openrouter', model: 'test/model', state: 'ready' }, openRouterReady: true, provider: 'openrouter' }),
		openRouterModel: () => 'test/model',
		openRouterModelName: () => catalog?.find((m) => m.id === 'test/model')?.name ?? 'test/model',
		openRouterModelPrice: () => (catalog ? { promptPerM: 3, completionPerM: 15 } : null),
		listOpenRouterModels: listCalls,
		openRouterAccount: accountCalls,
		openRouterCredits: async () => null,
		openRouterKeySettingsUrl: () => null,
	}),
}));

import { useArchitectStatus } from './architect';

describe('useArchitectStatus and a catalog that lands after the status read', () => {
	it('names and prices the picked model once the prefetched catalog arrives', async () => {
		const { result } = renderHook(() => useArchitectStatus());
		// Read before the catalog: the id stands in.
		await waitFor(() => expect(result.current.modelId).toBe('test/model'));
		expect(result.current.modelName).toBe('test/model');
		expect(listCalls).toHaveBeenCalled();
		await act(async () => {
			land();
			await listed;
		});
		await waitFor(() => expect(result.current.modelName).toBe('Test Model'));
		expect(result.current.price).toEqual({ promptPerM: 3, completionPerM: 15 });
	});

	it('does not hold the spend readout behind the catalog', async () => {
		// The catalog above has landed; a fresh read of a model it does not name would wait on it again. What matters
		// here is the order: the account and credits reads start without waiting for any catalog promise.
		accountCalls.mockClear();
		listCalls.mockImplementationOnce(() => new Promise(() => {})); // a catalog that never lands
		catalog = null;
		renderHook(() => useArchitectStatus());
		await waitFor(() => expect(accountCalls).toHaveBeenCalled());
	});

	// Last in the file: the backoff is module state, and this case leaves it set.
	it('after a failed catalog fetch, waits out a backoff and then still names the model', async () => {
		let now = 1_000_000;
		const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
		try {
			catalog = null;
			listCalls.mockReset();
			listCalls.mockImplementation(() => Promise.reject(new Error('offline')));
			accountCalls.mockClear();
			const { result, rerender } = renderHook(({ p }) => useArchitectStatus(p), { initialProps: { p: 0 } });
			await waitFor(() => expect(listCalls).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(accountCalls).toHaveBeenCalledTimes(1));
			// Another refresh inside the backoff (eight panels refresh on every change): no second fetch.
			rerender({ p: 1 });
			await waitFor(() => expect(accountCalls).toHaveBeenCalledTimes(2));
			expect(listCalls).toHaveBeenCalledTimes(1);
			expect(result.current.modelName).toBe('test/model');
			// The network is back and the backoff has passed: the next refresh asks again and names the model.
			now += 30_001;
			listCalls.mockImplementation(async () => {
				catalog = [{ id: 'test/model', name: 'Test Model' }];
			});
			rerender({ p: 2 });
			await waitFor(() => expect(result.current.modelName).toBe('Test Model'));
			expect(listCalls).toHaveBeenCalledTimes(2);
		} finally {
			clock.mockRestore();
		}
	});

	// Also last: module state. The case the grader found: after a failure, a read that nothing follows still fills the
	// name when the backoff ends, because the read schedules that fill instead of dropping it.
	it('after a failed catalog fetch with no later refresh, fills the name when the backoff ends', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		let now = 50_000_000;
		const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
		try {
			catalog = null;
			listCalls.mockReset();
			listCalls.mockImplementation(() => Promise.reject(new Error('offline')));
			const { result } = renderHook(() => useArchitectStatus());
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(listCalls).toHaveBeenCalledTimes(1);
			expect(result.current.modelName).toBe('test/model');
			// The network comes back; nothing refreshes the status. The scheduled fill runs when the backoff ends.
			listCalls.mockImplementation(async () => {
				catalog = [{ id: 'test/model', name: 'Test Model' }];
			});
			now += 29_000;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(29_000);
			});
			expect(listCalls).toHaveBeenCalledTimes(1);
			now += 1_100;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(1_100);
			});
			expect(listCalls).toHaveBeenCalledTimes(2);
			expect(result.current.modelName).toBe('Test Model');
		} finally {
			clock.mockRestore();
			vi.useRealTimers();
		}
	});

	// Also last: the timer a read sets INSIDE the backoff. The first read fails and schedules its retry; a second read
	// within the backoff (a pulse) replaces it with a fill timed to the backoff's end, and that fill names the model.
	it('a read inside the backoff schedules a fill for when the backoff ends', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		let now = 90_000_000;
		const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
		try {
			catalog = null;
			listCalls.mockReset();
			listCalls.mockImplementation(() => Promise.reject(new Error('offline')));
			const { result, rerender } = renderHook(({ p }) => useArchitectStatus(p), { initialProps: { p: 0 } });
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(listCalls).toHaveBeenCalledTimes(1);
			// 10 s later, inside the backoff, the status refreshes: no fetch now, one scheduled for 20 s from here.
			now += 10_000;
			rerender({ p: 1 });
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(listCalls).toHaveBeenCalledTimes(1);
			listCalls.mockImplementation(async () => {
				catalog = [{ id: 'test/model', name: 'Test Model' }];
			});
			now += 19_000;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(19_000);
			});
			expect(listCalls).toHaveBeenCalledTimes(1);
			now += 1_100;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(1_100);
			});
			expect(listCalls).toHaveBeenCalledTimes(2);
			expect(result.current.modelName).toBe('Test Model');
		} finally {
			clock.mockRestore();
			vi.useRealTimers();
		}
	});
});
