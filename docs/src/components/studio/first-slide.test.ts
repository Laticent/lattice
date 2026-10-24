import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module keeps one promise per page, so each test loads a fresh copy.
async function fresh() {
	vi.resetModules();
	return import('./first-slide');
}

describe('first-slide', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('resolves when the Studio marks the first slide, and only waits for that', async () => {
		const m = await fresh();
		let done = false;
		void m.firstSlideShown.then(() => {
			done = true;
		});
		await Promise.resolve();
		expect(done).toBe(false);
		m.markFirstSlideShown();
		await Promise.resolve();
		expect(done).toBe(true);
		expect(m.isFirstSlideShown()).toBe(true);
	});

	it('resolves on the backstop when no slide ever paints', async () => {
		const m = await fresh();
		let done = false;
		void m.firstSlideShown.then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(m.FIRST_SLIDE_BACKSTOP_MS - 1);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(done).toBe(true);
	});

	it('runs the work only after the first slide AND a pause in input; a keystroke restarts the pause', async () => {
		const m = await fresh();
		const fn = vi.fn();
		m.afterFirstSlideAndPause(fn, 3000);
		await vi.advanceTimersByTimeAsync(5000);
		expect(fn).not.toHaveBeenCalled(); // no slide yet
		m.markFirstSlideShown();
		await vi.advanceTimersByTimeAsync(2000);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		await vi.advanceTimersByTimeAsync(2000);
		expect(fn).not.toHaveBeenCalled(); // the keystroke restarted the 3 s pause
		await vi.advanceTimersByTimeAsync(1000);
		expect(fn).toHaveBeenCalledTimes(1);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
		await vi.advanceTimersByTimeAsync(5000);
		expect(fn).toHaveBeenCalledTimes(1); // once, and it stopped listening
	});

	it('a cancel before the pause ends means the work never runs', async () => {
		const m = await fresh();
		const fn = vi.fn();
		const cancel = m.afterFirstSlideAndPause(fn, 3000);
		m.markFirstSlideShown();
		await vi.advanceTimersByTimeAsync(1000);
		cancel();
		await vi.advanceTimersByTimeAsync(5000);
		expect(fn).not.toHaveBeenCalled();
	});

	it('useFirstSlideShown is false until the slide is marked, then true', async () => {
		const m = await fresh();
		const { renderHook, act } = await import('@testing-library/react');
		const { result } = renderHook(() => m.useFirstSlideShown());
		expect(result.current).toBe(false);
		await act(async () => {
			m.markFirstSlideShown();
			await Promise.resolve();
		});
		expect(result.current).toBe(true);
	});

	it('useFirstSlideShown starts true when the slide was already shown', async () => {
		const m = await fresh();
		m.markFirstSlideShown();
		const { renderHook } = await import('@testing-library/react');
		const { result } = renderHook(() => m.useFirstSlideShown());
		expect(result.current).toBe(true);
	});
});
