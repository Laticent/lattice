import { describe, expect, it } from 'vitest';
import { prefetchFrontOf } from './read-aloud';

// The rail's prefetch edge. Two invariants matter.
//
// CONTIGUITY: the front is how far narration can play WITHOUT STALLING, which is not the same
// as how much audio happens to be cached. A slide cached behind a gap is unreachable — counting
// it would draw runway that does not exist, and that is what made the first version look like
// patchwork.
//
// ORIGIN: the scan starts AT THE PLAYHEAD, not at slide 0. "How far from the top of the deck"
// is not a question anyone asks mid-delivery, and answering it collapsed the signal in two
// everyday cases — see the jump and the early-gap tests below.
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

	// ── The two cases that made the whole indicator dead on arrival ────────────────────
	// Both found by the adversarial trio's red team (#1352). In each, scanning from index 0
	// left the prefetch edge sitting exactly on the frozen progress edge — so a stall looked
	// identical to a crash, which is the one thing this indicator exists to tell apart.

	it('reports the runway ahead of a JUMP, not from the top of the deck', () => {
		// Presenter opens on slide 10 (a deep link, a rail click, a resumed deck). Slides 0–9
		// were never warmed and never will be; 10–14 are fully cached. There is five slides of
		// runway here and the old scan drew none of it.
		const fractions = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
		expect(prefetchFrontOf(fractions, 10)).toBe(15);
	});

	it('one sentence that never landed early on does not pin the front for the rest of the deck', () => {
		// Slide 1 lost a sentence to a 4xx and will never complete. Everything from the playhead
		// on is warm. Scanning from 0 stopped dead at that gap, so from slide 4 onward the front
		// equaled the playhead on every remaining slide of the deck.
		const fractions = [1, 0.6, 1, 1, 1, 1, 1];
		expect(prefetchFrontOf(fractions, 4)).toBe(7);
		expect(prefetchFrontOf(fractions, 1)).toBeCloseTo(1.6); // still honest AT the bad slide
	});

	it('a gap AHEAD of the playhead still stops the front — contiguity is unchanged', () => {
		expect(prefetchFrontOf([1, 1, 1, 0, 1, 1], 2)).toBe(3);
	});
});
