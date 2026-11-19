// An abbreviation's period is not a full stop, and a deck-declared phrase is never cut in two.
// The voice treats a spoken period as a sentence end and pauses, so "Oct. 10" read "October. ten";
// and the sentence split ran before terms matched, so `"Oct. Tenth": October Tenth` could never apply.
import { describe, expect, it } from 'vitest';
import { splitSentences } from './segment';
import { buildTrack } from './track';

const said = (text: string, terms?: Map<string, string>) =>
	buildTrack(text, terms ? { terms } : {}).cues.map((c) => c.words.map((w) => w.spoken).filter(Boolean).join(' '));

describe('an abbreviation period is not spoken as a stop', () => {
	it('a month abbreviation before a day reads as one date', () => {
		expect(said('Launch is Oct. 10. Then we scale.')).toEqual(['Launch is October ten.', 'Then we scale.']);
		expect(said('Meet at 10 a.m. on Oct. 10.')).toEqual(['Meet at ten A M on October ten.']);
	});
	it('a sentence that really ends on one still ends there', () => {
		expect(said('We ship in Oct. Then we rest.')).toEqual(['We ship in October.', 'Then we rest.']);
	});
	it('an abbreviation the voice is handed as written keeps its period', () => {
		expect(said('Dr. Patel joins.')).toEqual(['Dr. Patel joins.']);
	});
});

describe('dotted abbreviations with one meaning', () => {
	it('reads the Latin connectives, versus and approximately', () => {
		expect(said('Use tools, e.g. Excel, i.e. sheets.')).toEqual(['Use tools, for example Excel, that is sheets.']);
		expect(said('Costs etc. rise. Ours vs. theirs.')).toEqual(['Costs et cetera rise.', 'Ours versus theirs.']);
		expect(said('approx. 40 sites')).toEqual(['approximately forty sites']);
	});
	it('spells capitals joined by periods, and the degree', () => {
		expect(said('Made in the U.S., then D.C.')).toEqual(['Made in the U S, then D C']);
		expect(said('She holds a Ph.D. now, a PhD.')).toEqual(['She holds a P H D now, a P H D.']);
	});
	it('reads a courtesy title only in its own case', () => {
		expect(said('Mr. Lee met Ms. Park.')).toEqual(['mister Lee met miz Park.']);
		expect(said('Built for MS. Then more.').join(' ')).not.toContain('miz');
	});
	it('a term keyed with its own period matches before a comma', () => {
		expect(said('the U.S., two.', new Map([['U.S.', 'you ess']]))).toEqual(['the you ess, two.']);
	});
});

describe('a declared phrase with a period is one cue', () => {
	const terms = new Map([['Oct. Tenth', 'October Tenth']]);
	it('is said as the deck declares it, in any case', () => {
		expect(said('Launch is Oct. Tenth. Then we scale.', terms)).toEqual(['Launch is October Tenth.', 'Then we scale.']);
		expect(said('LAUNCH IS OCT. TENTH. Then we scale.', terms)[0]).toBe('LAUNCH IS October Tenth.');
	});
	it('without the term, the structure decides, as before', () => {
		expect(said('Launch is Oct. Tenth. Then we scale.')).toEqual(['Launch is October.', 'Tenth.', 'Then we scale.']);
	});
	it('the splitter joins only the exact declared words', () => {
		expect(splitSentences('Oct. Tenth. Oct. Eleventh.', ['Oct. Tenth'])).toEqual(['Oct. Tenth.', 'Oct.', 'Eleventh.']);
	});
});
