import { describe, expect, it } from 'vitest';
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
