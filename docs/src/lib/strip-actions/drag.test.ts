import { describe, expect, it } from 'vitest';
import { dropTarget } from './drag';

describe('where a drag drops (2026-10-27-slide-structure-strip.md §5)', () => {
	// Five slides 100px wide with 10px gaps: slide k spans [k*110, k*110+100].
	const spans = Array.from({ length: 5 }, (_, k) => ({ unit: k, start: k * 110, end: k * 110 + 100 }));

	it('lands before the first slide whose middle lies past the pointer, counted after the move', () => {
		expect(dropTarget(0, 10, spans, 5)).toBe(0); // over its own first half: stays
		expect(dropTarget(0, 290, spans, 5)).toBe(2); // past slide 2's middle: after slide 2
		expect(dropTarget(0, 260, spans, 5)).toBe(1); // before slide 2's middle: after slide 1
		expect(dropTarget(4, 10, spans, 5)).toBe(0); // to the very start
		expect(dropTarget(3, 170, spans, 5)).toBe(2); // past slide 1's middle, moving earlier: before slide 2
	});

	it('past the last slide lands at the end; a window of mounted slides works in deck numbers', () => {
		expect(dropTarget(0, 9999, spans, 5)).toBe(4);
		const window = spans.slice(2).map((s) => ({ ...s, unit: s.unit + 20 })); // slides 22..24 of 40 mounted
		expect(dropTarget(5, window[1].start + 80, window, 40)).toBe(23);
		expect(dropTarget(30, window[0].start + 10, window, 40)).toBe(22);
	});

	it('with nothing mounted, stays where it started', () => {
		expect(dropTarget(3, 50, [], 5)).toBe(3);
	});
});
