import { describe, expect, it } from 'vitest';
import { clampFadeMs } from './envelope';

describe('clampFadeMs', () => {
	it('returns the requested fade when the clip is comfortably longer than 2× it', () => {
		expect(clampFadeMs(500, 8)).toBe(8);
		expect(clampFadeMs(20, 8)).toBe(8);
	});

	it('clamps to half the clip so head + tail fades never overlap', () => {
		expect(clampFadeMs(10, 8)).toBe(5); // 8 would overlap on a 10ms clip
		expect(clampFadeMs(4, 8)).toBe(2);
	});

	it('returns 0 when fade is disabled or the duration is non-positive', () => {
		expect(clampFadeMs(500, 0)).toBe(0);
		expect(clampFadeMs(500, -1)).toBe(0);
		expect(clampFadeMs(0, 8)).toBe(0);
		expect(clampFadeMs(-5, 8)).toBe(0);
	});

	it('returns 0 for non-finite duration/fade (a fabricated Clip must not throw in ramp scheduling)', () => {
		expect(clampFadeMs(Number.POSITIVE_INFINITY, 8)).toBe(0);
		expect(clampFadeMs(Number.NaN, 8)).toBe(0);
		expect(clampFadeMs(500, Number.POSITIVE_INFINITY)).toBe(0);
		expect(clampFadeMs(500, Number.NaN)).toBe(0);
	});
});
