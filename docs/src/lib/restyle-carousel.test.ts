// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { nextIndex, wrapIndex } from '@/lib/restyle-carousel';

describe('wrapIndex', () => {
	it('leaves an in-range index unchanged', () => {
		expect(wrapIndex(2, 5)).toBe(2);
	});

	it('wraps past the end back to the start', () => {
		expect(wrapIndex(5, 5)).toBe(0);
		expect(wrapIndex(6, 5)).toBe(1);
	});

	it('wraps a negative index (manual back / underflow)', () => {
		expect(wrapIndex(-1, 5)).toBe(4);
	});

	it('is safe for an empty list', () => {
		expect(wrapIndex(3, 0)).toBe(0);
	});
});

describe('nextIndex', () => {
	it('advances by one', () => {
		expect(nextIndex(0, 5)).toBe(1);
	});

	it('cycles from the last back to the first', () => {
		expect(nextIndex(4, 5)).toBe(0);
	});

	it('stays at 0 for a single-palette list', () => {
		expect(nextIndex(0, 1)).toBe(0);
	});
});
