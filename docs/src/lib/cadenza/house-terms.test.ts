// The built-in list in the `terms:` shape (lexicon.ts `houseTerms`). It is DATA the glossary and the
// Studio can offer, so it must never disagree with what the voice actually says.
import { describe, expect, it } from 'vitest';
import { houseTerms, lookupLexicon } from './lexicon';
import { toSpokenText } from './normalize';

describe('houseTerms', () => {
	const list = houseTerms();

	it('says each term exactly as the voice does', () => {
		for (const t of list) expect(lookupLexicon(t.term), t.term).toBe(t.pronounce ?? t.expansion);
	});

	it('keeps meaning and pronunciation apart for a term said as a word or spelled', () => {
		const by = new Map(list.map((t) => [t.term, t]));
		expect(by.get('EBITDA')).toEqual({ term: 'EBITDA', expansion: 'earnings before interest, taxes, depreciation and amortization', pronounce: 'ee bit dah' });
		expect(by.get('SaaS')).toEqual({ term: 'SaaS', expansion: 'software as a service', pronounce: 'sass' });
		expect(by.get('ARR')).toEqual({ term: 'ARR', expansion: 'annual recurring revenue' });
		// A spelled-out pronunciation ("U I") is never left standing in as the meaning.
		for (const t of list) expect(/^(?:[A-Z] )+[A-Z]$/.test(t.expansion), t.term).toBe(false);
	});

	it('lists terms only: no quarters, durations, months or glyphs', () => {
		const terms = list.map((t) => t.term);
		for (const x of ['Q3', 'MO', 'Feb', '§§']) expect(terms).not.toContain(x);
		expect(new Set(terms).size).toBe(terms.length);
	});

	it('a deck term still beats the house reading', () => {
		expect(toSpokenText('EBITDA', { terms: new Map([['EBITDA', 'e b i t d a']]) })).toBe('e b i t d a');
	});
});
