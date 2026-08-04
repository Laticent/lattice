import { describe, expect, it } from 'vitest';
import { prefetchFrontOf } from './read-aloud';

// The rail's prefetch edge. The invariant that matters is CONTIGUITY: the front is how far
// narration can play WITHOUT STALLING, which is not the same as how much audio happens to be
// cached. A slide cached behind a gap is unreachable — counting it would draw runway that
// does not exist, and that is exactly what made the first version look like patchwork.
describe('prefetchFrontOf', () => {
	it('advances a whole slide per fully-cached slide', () => {
		expect(prefetchFrontOf([1, 1, 1])).toBe(3);
	});

	it('adds the partial fraction of the first incomplete slide', () => {
		expect(prefetchFrontOf([1, 1, 0.5])).toBe(2.5);
		expect(prefetchFrontOf([0.25])).toBe(0.25);
	});

	it('STOPS at the first gap — a slide cached behind it does not count', () => {
		// You would stall at slide 3 before ever reaching slide 5, so the runway is 2.
		expect(prefetchFrontOf([1, 1, 0, 1, 1])).toBe(2);
	});

	it('a partial slide also terminates the front, however much follows it', () => {
		expect(prefetchFrontOf([1, 0.4, 1, 1, 1])).toBeCloseTo(1.4);
	});

	it('an empty deck, or nothing cached, is a zero front', () => {
		expect(prefetchFrontOf([])).toBe(0);
		expect(prefetchFrontOf([0, 0, 0])).toBe(0);
	});

	it('never renders BEHIND the progress edge', () => {
		// The LRU can evict audio for slides already played. True of the cache, but nonsense as
		// a runway — a buffer trailing the playhead would read as a fault.
		expect(prefetchFrontOf([0, 0, 0], 2.5)).toBe(2.5);
		expect(prefetchFrontOf([1, 1, 0], 0.5)).toBe(2);
	});

	it('clamps a nonsense fraction rather than propagating it into a width', () => {
		expect(prefetchFrontOf([1, 5])).toBe(2); // >1 counts as complete, not as 5 slides
		expect(prefetchFrontOf([1, -3])).toBe(1);
	});
});
