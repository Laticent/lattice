import { describe, expect, it } from 'vitest';
import { prefetchFrontOf } from './read-aloud';
import { mergeReadiness, readinessWindow } from './readiness-window';

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

// WINDOWED readiness (#1392) — driven through the SHIPPING window, not a transcription of it.
//
// The first version of this block hand-built its arrays with the window bounds written in as
// literals ("window 8..16 (2 back + current + lookahead 2 + margin 2 + 1)"). Setting
// READINESS_BACK to 0 and READINESS_MARGIN to -1 in the component left every case green: the
// window was never imported, so nothing here could see it move. Two of the four assertions were
// tautologies besides — `prefetchFrontOf` ends in `Math.max(front, progressFront)`, so it cannot
// return less than the playhead for ANY input.
describe('the readiness window (#1392)', () => {
	/** Whole-deck readiness: `n` slides, all fully cached — a deck prepared in an earlier session. */
	const whole = (n: number): number[] => Array.from({ length: n }, () => 1);
	/** What ONE windowed poll measures, spliced over what was already known. */
	const poll = (prev: number[], clamped: number, len: number, lookahead: number, store: number[]): number[] => {
		const { from, to } = readinessWindow(clamped, len, lookahead);
		return mergeReadiness(prev, store.slice(from, to), from, len);
	};

	it('bounds the repeating poll at the lookahead depth, not at the deck length', () => {
		expect(readinessWindow(10, 60, 2)).toEqual({ from: 8, to: 15 });
		expect(readinessWindow(30, 60, 4)).toEqual({ from: 28, to: 37 });
	});

	it('clamps at both ends of the deck, and collapses to the whole deck for an unbounded lookahead', () => {
		expect(readinessWindow(0, 60, 2)).toEqual({ from: 0, to: 5 });
		expect(readinessWindow(59, 60, 2)).toEqual({ from: 57, to: 60 });
		expect(readinessWindow(0, 0, 2)).toEqual({ from: 0, to: 0 });
		expect(readinessWindow(30, 60, Number.POSITIVE_INFINITY)).toEqual({ from: 28, to: 60 });
	});

	// THE ONE THAT MATTERS. A prepared deck is cached end to end; a window that zero-fills
	// outside itself reported a 5-slide runway on a fully-ready 60-slide deck, because
	// `prefetchFrontOf` stops at the first unmeasured slide. That is the "prepared deck looks
	// unprepared" regression — on the indicator whose whole job is telling buffering from broken.
	it('a fully prepared deck draws its FULL runway, not just the window', () => {
		const store = whole(60);
		const swept = mergeReadiness([], store, 0, 60); // the one full sweep on open
		expect(prefetchFrontOf(swept, 0)).toBe(60);
		// …and every later windowed poll MERGES, so the runway survives navigation.
		const after = poll(swept, 30, 60, 2, store);
		expect(prefetchFrontOf(after, 30)).toBe(60);
		const backwards = poll(after, 5, 60, 2, store);
		expect(prefetchFrontOf(backwards, 5)).toBe(60);
	});

	it('without the merge, the same window reports a 5-slide runway on that deck', () => {
		// The defect, stated as an expectation, so the fix cannot be quietly undone: replacing the
		// merge with a zero-fill is what this number goes back to.
		const { from, to } = readinessWindow(0, 60, 2);
		const zeroFilled = Array.from({ length: 60 }, (_, i) => (i >= from && i < to ? 1 : 0));
		expect(prefetchFrontOf(zeroFilled, 0)).toBe(5);
	});

	it('a windowed poll still lowers a slide that has fallen out of the cache', () => {
		// Merging must not mean "readiness only ever grows": an eviction inside the window has to
		// land, or the rail would keep drawing runway that is gone.
		const swept = mergeReadiness([], whole(60), 0, 60);
		const evicted = whole(60);
		evicted[3] = 0.5;
		expect(prefetchFrontOf(poll(swept, 2, 60, 2, evicted), 2)).toBe(3.5);
	});

	it('a deck that FITS inside the window is measured whole by one poll', () => {
		expect(readinessWindow(0, 5, 2)).toEqual({ from: 0, to: 5 });
		expect(prefetchFrontOf(poll([], 0, 5, 2, whole(5)), 0)).toBe(5);
		// One slide past that and the window no longer covers the deck — which is exactly why the
		// full sweep on open exists rather than "short decks are fine".
		expect(readinessWindow(0, 6, 2)).toEqual({ from: 0, to: 5 });
	});
});
