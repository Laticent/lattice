import { describe, expect, it } from 'vitest';
import { fitSize } from './spark-fit';

// The size-fit math behind the Studio's `spark-too-big` warning (docs/src/lib/spark-fit.ts).
// The DOM pass needs a real layout, so it is exercised in the real Studio, not here.
describe('fitSize — the largest size that fits', () => {
	it('returns null when the spark already fits', () => {
		expect(fitSize(100, 120, 'lg', 'framed')).toBeNull();
		expect(fitSize(100, 99.5, 'md', 'framed')).toBeNull(); // within the 1px tolerance
	});

	it('steps a framed :lg down to :md, then :sm, by the tile ratios (0.85 / 1 / 1.6)', () => {
		expect(fitSize(160, 110, 'lg', 'framed')).toEqual({ to: 'md', stillOver: false }); // md = 100
		expect(fitSize(160, 90, 'lg', 'framed')).toEqual({ to: 'sm', stillOver: false }); // sm = 85
	});

	it('uses the bare em widths (3 / 4.5 / 7.5em) for a bare spark', () => {
		// A bare lg of 150px means md 90, sm 60.
		expect(fitSize(150, 95, 'lg', 'bare')).toEqual({ to: 'md', stillOver: false });
		expect(fitSize(150, 65, 'lg', 'bare')).toEqual({ to: 'sm', stillOver: false });
	});

	it('says so when even :sm is too wide, and never suggests growing', () => {
		expect(fitSize(160, 40, 'lg', 'framed')).toEqual({ to: 'sm', stillOver: true });
		expect(fitSize(85, 40, 'sm', 'framed')).toBeNull(); // already the smallest: nothing to offer
	});
});

describe('fitSize by height — a spark that spreads its row', () => {
	it('uses the bare heights (0.8 / 1 / 1.7em) and the framed tile steps', () => {
		// A bare lg 34px tall in a 16px line: 1.5 lines is 24px, and md (20px) fits.
		expect(fitSize(34, 24, 'lg', 'bare', 'height')).toEqual({ to: 'md', stillOver: false });
		// A framed lg tile of 51.8px in a 27px line (1.5 lines = 40.5): md (32.4) fits.
		expect(fitSize(51.8, 40.5, 'lg', 'framed', 'height')).toEqual({ to: 'md', stillOver: false });
	});
});

describe('fitSize — the outer gap does not scale', () => {
	it('subtracts the fixed gap before stepping, so the smaller size is not under-estimated', () => {
		// A framed lg 80px wide, 6px of it the fixed gap: md is 6 + 74 / 1.6 = 52.25.
		expect(fitSize(80, 53, 'lg', 'framed', 'width', 6)).toEqual({ to: 'md', stillOver: false });
		// Without the gap it would claim md is 50px and fit at 51 — which it does not.
		expect(fitSize(80, 51, 'lg', 'framed', 'width', 6)).toEqual({ to: 'sm', stillOver: false });
	});
});
