import { describe, expect, it } from 'vitest';
import { SENTENCE_PAUSE_MS } from '../../playground/voice-model.js';
import { estimateWordMs, FINAL_LENGTHEN_MS, pauseAfter, SYLLABLE_MS, syllableCount } from './cadence';
import { buildTrack } from './track';

// The prosody-grounded pace model (2026-07-12-narration-pace-model.md): word duration rides a
// SYLLABLE count (not character length), pauses are GRADED by boundary depth, and the word
// before a boundary lengthens. These pin the model's shape, not exact ms (calibration tunes those).

describe('syllableCount — lightweight English heuristic', () => {
	it('counts vowel-group syllables', () => {
		expect(syllableCount('up')).toBe(1);
		expect(syllableCount('the')).toBe(1);
		expect(syllableCount('revenue')).toBe(3);
		expect(syllableCount('components')).toBe(3);
	});
	it('drops a silent trailing e but keeps syllabic -le', () => {
		expect(syllableCount('make')).toBe(1); // silent e
		expect(syllableCount('table')).toBe(2); // -le stays
	});
	it('sums across a multi-word spoken expansion', () => {
		// "$4.2M" → "four point two million dollars": four+point+two+mil+lion+dol+lars
		expect(syllableCount('four point two million dollars')).toBe(7);
	});
	it('spells out an ALL-CAPS initialism letter-by-letter', () => {
		// The voice says "P D F" (3 beats), not one — an all-caps vowelless token is an initialism.
		expect(syllableCount('PDF')).toBe(3);
		expect(syllableCount('HTML')).toBe(4);
		expect(syllableCount('x')).toBe(1); // a lone consonant is still one beat
	});
	it('does NOT spell out lowercase vowelless interjections / rare words', () => {
		// Case is the signal: "hmm"/"nth" are one beat, not 3 spelled-out letters.
		expect(syllableCount('hmm')).toBe(1);
		expect(syllableCount('nth')).toBe(1);
		expect(syllableCount('tsk')).toBe(1);
	});
	it('keeps a contraction as ONE token (the apostrophe does not split it into a fake initialism)', () => {
		// Regression: splitting on the apostrophe left "ll"/"t" remnants that the initialism
		// rule counted as spelled-out letters, so "I'll" read as 3 beats and stalled the highlight.
		expect(syllableCount("I'll")).toBe(1);
		expect(syllableCount("we'll")).toBe(1);
		expect(syllableCount("you'll")).toBe(1);
		expect(syllableCount("don't")).toBe(1);
		expect(syllableCount("it's")).toBe(1);
		expect(syllableCount('it’s')).toBe(1); // curly apostrophe too
	});
	it('never returns less than 1', () => {
		expect(syllableCount('')).toBe(1);
		expect(syllableCount('!!!')).toBe(1);
	});
});

describe('estimateWordMs — syllable-based, not char-length', () => {
	it('scales with syllables at the pace preset', () => {
		expect(estimateWordMs('up')).toBe(SYLLABLE_MS.moderate * 1);
		expect(estimateWordMs('revenue')).toBe(SYLLABLE_MS.moderate * 3);
	});
	it('a long single-syllable word is NOT longer than a short 3-syllable one (char length is gone)', () => {
		// "strength" (8 chars, 1 syllable) < "revenue" (7 chars, 3 syllables)
		expect(estimateWordMs('strength')).toBeLessThan(estimateWordMs('revenue'));
	});
	it('faster pace shortens, slower lengthens', () => {
		expect(estimateWordMs('revenue', 'fast')).toBeLessThan(estimateWordMs('revenue', 'moderate'));
		expect(estimateWordMs('revenue', 'slow')).toBeGreaterThan(estimateWordMs('revenue', 'moderate'));
	});
	it('rateScale stretches/compresses for a per-voice calibration (default 1 = unchanged)', () => {
		const base = estimateWordMs('revenue', 'moderate');
		expect(estimateWordMs('revenue', 'moderate', 1)).toBe(base);
		expect(estimateWordMs('revenue', 'moderate', 1.5)).toBe(Math.round(base * 1.5));
		expect(estimateWordMs('revenue', 'moderate', 0.8)).toBe(Math.round(base * 0.8));
		// A garbage scale falls back to 1, never zero/negative duration.
		expect(estimateWordMs('revenue', 'moderate', 0)).toBe(base);
		expect(estimateWordMs('revenue', 'moderate', Number.NaN)).toBe(base);
	});
});

describe('pauseAfter — graded by boundary depth', () => {
	it('comma < clause (;/:) < sentence (./?/!) < ellipsis', () => {
		const comma = pauseAfter('a,');
		const clause = pauseAfter('a;');
		const sentence = pauseAfter('a.');
		const ellipsis = pauseAfter('a…');
		expect(comma).toBeLessThan(clause);
		expect(clause).toBeLessThan(sentence);
		expect(sentence).toBeLessThan(ellipsis);
		expect(pauseAfter('a:')).toBe(clause);
		expect(pauseAfter('a?')).toBe(sentence);
	});
	it('no trailing punctuation → no pause', () => {
		expect(pauseAfter('word')).toBe(0);
	});
});

describe('race-safety: the audio breath never exceeds the estimate pause (two hand-kept tables)', () => {
	// voice-model.js can't import cadence.ts (it's node-loadable, no TS import), so the breath
	// table is a deliberate second copy at a 0.3 discount. If a future edit lets a breath grow
	// past its estimate pause, the highlight would race into the silence — the #940 regression.
	// This pins the invariant across the two files so the copies can't silently drift.
	it('SENTENCE_PAUSE_MS[k] ≤ pauseAfter(k) for every punctuation class', () => {
		for (const ch of Object.keys(SENTENCE_PAUSE_MS)) {
			const breath = SENTENCE_PAUSE_MS[ch as keyof typeof SENTENCE_PAUSE_MS];
			const estimate = pauseAfter(`a${ch}`);
			expect(estimate, `pauseAfter for "${ch}"`).toBeGreaterThan(0);
			expect(breath, `breath ≤ estimate for "${ch}"`).toBeLessThanOrEqual(estimate);
		}
	});
});

describe('phrase-final lengthening — the pre-boundary word ends later', () => {
	it("a word before a boundary carries +FINAL_LENGTHEN_MS vs the same word mid-phrase", () => {
		// Two identical words: one sentence-final, one not.
		const t = buildTrack('go go. go go', {});
		const finalWord = t.cues[0].words[1]; // "go." — before the sentence boundary
		const midWord = t.cues[1].words[0]; // "go" — no boundary
		const finalDur = finalWord.endMs - finalWord.startMs;
		const midDur = midWord.endMs - midWord.startMs;
		expect(finalDur - midDur).toBe(FINAL_LENGTHEN_MS);
	});
});
