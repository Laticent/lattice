import { describe, expect, it } from 'vitest';
import { exportInFlight, isLiteDevice, LITE } from './device-lite.js';

const docWith = (tier: string | null) => ({ documentElement: { getAttribute: (n: string) => (n === 'data-device-tier' ? tier : null) } });

describe('isLiteDevice', () => {
	it('is true only on LITE', () => {
		expect(isLiteDevice(docWith('lite'))).toBe(true);
		for (const t of ['full', 'unsupported', null]) expect(isLiteDevice(docWith(t))).toBe(false);
		expect(isLiteDevice(undefined)).toBe(false);
	});
	it('is false when the document throws', () => {
		expect(isLiteDevice({ documentElement: { getAttribute: () => { throw new Error('detached'); } } })).toBe(false);
	});
	it("carries §4's numbers", () => {
		expect(LITE).toEqual({ workers: 1, exportInFlight: 1, baseSlots: 6, maxSlots: 12 });
	});
	it('queues two export slides on FULL and one on LITE', () => {
		expect(exportInFlight(false)).toBe(2);
		expect(exportInFlight(true)).toBe(1);
	});
});
