// A spelled letter `A` must reach the voice as the letter NAME. Kokoro's phonemizer (espeak) reads a
// lone `A` before another word as the article "uh": `ten A M` was "ten uh em", `U A E` "you uh ee".
// So the clock reads `A-M`, and an initialism with an `A` in it is written joined (`UAE`).
import { describe, expect, it } from 'vitest';
import { toSpokenText } from './normalize';

describe('the letter A is never a lone word', () => {
	it('every clock form reads A-M / P-M', () => {
		expect(toSpokenText('Doors open at 10 a.m.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('Doors open at 10 A.M.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('Doors open at 10 AM.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('Doors open at 10 am.')).toBe('Doors open at ten A-M.');
		expect(toSpokenText('It ends at 9:30 pm sharp')).toBe('It ends at nine thirty P-M sharp');
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
	it('a dotted initialism with an A is joined; one without stays spaced', () => {
		expect(toSpokenText('The U.A.E. and A.I. teams met in D.C. today.')).toBe('The UAE and AI teams met in D C today.');
		expect(toSpokenText('She holds a B.A. now.')).toBe('She holds a BA now.');
		expect(toSpokenText('We met in the U.S. office.')).toBe('We met in the U S office.');
	});
	it('a joined run that is an English word takes a hyphen instead', () => {
		expect(toSpokenText('Filed by the A.S. team.')).toBe('Filed by the A-S team.');
	});
});
