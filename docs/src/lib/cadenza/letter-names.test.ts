// A spelled letter `A` must reach the voice as the letter NAME. Kokoro phonemizes the text between
// each pair of punctuation marks on its own, and its phonemizer (espeak) reads a spaced `A` before
// another word as the article: `ten A M` was "ten uh em", `U A E` "you uh ee". So the clock reads
// `A-M`, and an initialism's `A` is written `A-` (`U A- E`), which espeak reads as the letter in every
// position, alone between commas included. engineering/decisions/2026-11-19-segment-acronyms.md §4.
import { describe, expect, it } from 'vitest';
import { syllableCount } from './cadence';
import { toSpokenText } from './normalize';

describe('the letter A is never a lone word', () => {
	it('every clock form reads A-M / P-M', () => {
		expect(toSpokenText('Doors open at 10 a.m.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('Doors open at 10 A.M.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('Doors open at 10 AM.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('Doors open at 10 am.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('It ends at 9:30 pm sharp')).toBe('It ends at nine thirty P-M sharp');
	});
	it('the hour may open a bracket or end a range', () => {
		expect(toSpokenText('Lunch (12 PM) is served.')).toBe('Lunch twelve P-M is served.');
		expect(toSpokenText('Open 9–10 AM daily.')).toContain('A-M');
	});
	it('an undotted am / pm is a clock only right after an hour', () => {
		expect(toSpokenText('Ten AM works.')).toBe('Ten AM works.');
		expect(toSpokenText('Our 3 PMs ship.')).toBe('Our three PMs ship.');
		expect(toSpokenText('We hired 40 PM leads')).toBe('We hired forty PM leads');
		expect(toSpokenText('It was 10, am I right?')).toBe('It was ten, am I right?');
	});
	it('a deck term for AM wins over the clock rule', () => {
		expect(toSpokenText('Tune to 9 AM.', { terms: new Map([['AM', 'A M radio']]) })).toBe('Tune to nine A M radio.');
	});
	it("an initialism's A is written A- in every position; other letters stay spaced", () => {
		expect(toSpokenText('The U.A.E. and A.I. teams met in D.C. today.')).toBe('The U A- E and A- I teams met in D C today.');
		expect(toSpokenText('She holds a B.A. now.')).toBe('She holds a B A- now.');
		// Alone between commas, where a joined `BA` read "bah".
		expect(toSpokenText('Degrees: B.A., M.A., and Ph.D.')).toBe('Degrees, B A-, M A-, and P H D.');
		expect(toSpokenText('We met in the U.S. office.')).toBe('We met in the U S office.');
	});
	it('a spelled run keeps one syllable per letter, so caption timing holds', () => {
		expect(toSpokenText('the U.A.E. team').split(' ').slice(1, 4).map(syllableCount)).toEqual([1, 1, 1]);
	});
});
