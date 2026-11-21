import { describe, expect, it } from 'vitest';
import { LINE_PX, type StripState, sidewaysTarget, type WheelInput } from './wheel-sideways';

const wheel = (o: Partial<WheelInput> = {}): WheelInput => ({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false, ...o });
const strip = (o: Partial<StripState> = {}): StripState => ({ scrollLeft: 0, maxLeft: 800, clientWidth: 400, scrollsY: false, ...o });

describe('sidewaysTarget', () => {
	it('turns a vertical wheel into a sideways scroll', () => {
		expect(sidewaysTarget(wheel(), strip())).toBe(100);
		expect(sidewaysTarget(wheel({ deltaY: -60 }), strip({ scrollLeft: 200 }))).toBe(140);
	});
	it('converts line and page deltas', () => {
		expect(sidewaysTarget(wheel({ deltaY: 3, deltaMode: 1 }), strip())).toBe(3 * LINE_PX);
		expect(sidewaysTarget(wheel({ deltaY: 1, deltaMode: 2 }), strip())).toBe(400);
	});
	it('clamps to the ends', () => {
		expect(sidewaysTarget(wheel({ deltaY: 5000 }), strip({ scrollLeft: 700 }))).toBe(800);
		expect(sidewaysTarget(wheel({ deltaY: -5000 }), strip({ scrollLeft: 100 }))).toBe(0);
	});
	it('lets the page scroll at the end of the strip', () => {
		expect(sidewaysTarget(wheel(), strip({ scrollLeft: 800 }))).toBeNull();
		expect(sidewaysTarget(wheel({ deltaY: -100 }), strip({ scrollLeft: 0 }))).toBeNull();
	});
	it('leaves a mostly-horizontal wheel, zoom, and strips with nothing to scroll alone', () => {
		expect(sidewaysTarget(wheel({ deltaX: 120, deltaY: 40 }), strip())).toBeNull();
		expect(sidewaysTarget(wheel({ ctrlKey: true }), strip())).toBeNull();
		expect(sidewaysTarget(wheel({ metaKey: true }), strip())).toBeNull();
		expect(sidewaysTarget(wheel(), strip({ maxLeft: 0 }))).toBeNull();
		expect(sidewaysTarget(wheel(), strip({ scrollsY: true }))).toBeNull();
	});
});
