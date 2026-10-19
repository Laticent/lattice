import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettled } from './use-settled';

describe('useSettled', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('returns the first value at once and a later one only after it has stopped changing', () => {
		const { result, rerender } = renderHook(({ v }) => useSettled(v, 300), { initialProps: { v: 'a' } });
		expect(result.current).toBe('a');
		rerender({ v: 'b' });
		act(() => vi.advanceTimersByTime(200));
		rerender({ v: 'c' });
		act(() => vi.advanceTimersByTime(200));
		expect(result.current).toBe('a'); // still typing: each change restarted the clock
		act(() => vi.advanceTimersByTime(150));
		expect(result.current).toBe('c');
	});

	it('does not loop on a stable value', () => {
		const stable = { n: 1 };
		const { result } = renderHook(() => useSettled(stable, 100));
		act(() => vi.advanceTimersByTime(1000));
		expect(result.current).toBe(stable);
		expect(vi.getTimerCount()).toBe(0);
	});
});
