import { describe, expect, it } from 'vitest';
import { liveMediaAttr } from './live-media-attr';

const docWith = (tier: string | null) => ({ documentElement: { getAttribute: (n: string) => (n === 'data-device-tier' ? tier : null) } });

describe('liveMediaAttr', () => {
	it('is "still" on a LITE device', () => {
		expect(liveMediaAttr(docWith('lite'))).toBe(' data-lattice-live-media="still"');
	});
	it('is the bare opt-in on FULL, with no tier yet, and with no document', () => {
		expect(liveMediaAttr(docWith('full'))).toBe(' data-lattice-live-media');
		expect(liveMediaAttr(docWith(null))).toBe(' data-lattice-live-media');
		expect(liveMediaAttr(undefined)).toBe(' data-lattice-live-media');
	});
	it('falls back to the bare opt-in when the document throws', () => {
		const bad = { documentElement: { getAttribute: () => { throw new Error('detached'); } } };
		expect(liveMediaAttr(bad)).toBe(' data-lattice-live-media');
	});
});
