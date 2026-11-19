// The term matcher (terms.ts) through the public speech calls. Each case is a form a deck really
// writes that used to read as typed. engineering/decisions/2026-11-16-terms-registry.md §4.
import { describe, expect, it } from 'vitest';
import { toSpokenText, unmatchedAcronyms } from './normalize';
import { buildTrack } from './track';

const terms = new Map([
	['CRO', 'chief revenue officer'],
	['EBITDA', 'ee bit dah'],
	['Derby', 'Darby'],
	['kubectl', 'cube control'],
	['Twinkima G', 'Twinkee mah Gee'],
	['🎯', ''],
]);
const say = (text: string) => toSpokenText(text, { terms });

describe('term registry: forms a key matches', () => {
	it('matches the exact token, wrapped or followed by punctuation', () => {
		expect(say('The CRO said')).toBe('The chief revenue officer said');
		expect(say('(CRO), then')).toBe('chief revenue officer, then');
	});
	it('keeps a plural or possessive ending on the spoken form', () => {
		expect(say('CROs agree')).toBe('chief revenue officers agree');
		expect(say("the CRO's plan")).toBe("the chief revenue officer's plan");
		expect(say('the CRO’s plan')).toBe("the chief revenue officer's plan");
		expect(say("the CROs' plans")).toBe("the chief revenue officers' plans");
		expect(say("Derby's line")).toBe("Darby's line");
	});
	it('does not read an ALL-CAPS word ending in S as a plural', () => {
		expect(say('CROS')).toBe('CROS');
	});
	it('never puts an ending on a lower-case key, where it would make an ordinary word', () => {
		const words = new Map([['it', 'eye tee'], ['bu', 'bee you']]);
		expect(toSpokenText("its it's Bus", { terms: words })).toBe("its it's Bus");
	});
	it('folds case only for a lower-case or Capitalized key', () => {
		// A Capitalized key matches its ALL-CAPS title form, never the lower-case word (a derby hat).
		expect(say('DERBY RETURNS')).toBe('Darby RETURNS');
		expect(say('a derby hat')).toBe('a derby hat');
		// A lower-case key matches at a sentence start, never in ALL CAPS (`us` is not `US`).
		expect(say('Kubectl applies it. KUBECTL stays.')).toBe('cube control applies it. KUBECTL stays.');
		expect(toSpokenText('us and US', { terms: new Map([['us', 'oos']]) })).toBe('oos and US');
		// A key with other capitals matches only as written, so `IT`-style keys never fire on words.
		expect(say('cro Cro')).toBe('cro Cro');
	});
	it('speaks each part of a hyphen or slash compound that holds a key', () => {
		expect(say('CRO-led growth')).toBe('chief revenue officer led growth');
		expect(say('EBITDA-adjusted')).toBe('ee bit dah adjusted');
		expect(say('CRO/CFO')).toBe('chief revenue officer/chief financial officer');
		// No key in it: the compound reads exactly as before.
		expect(say('under-13')).toBe(toSpokenText('under-13'));
		// A hyphen between two parts with digits is a range or a date, never split.
		const periods = new Map([['FY24', 'fiscal twenty-four'], ['11', 'eleven!']]);
		expect(toSpokenText('FY24-FY26', { terms: periods })).toBe(toSpokenText('FY24-FY26'));
		expect(toSpokenText('2026-11-16', { terms: periods })).toBe(toSpokenText('2026-11-16'));
	});
	it('keeps a term beside a symbol', () => {
		expect(say('CRO→CFO')).toBe('chief revenue officer to chief financial officer');
		expect(toSpokenText('CRO→CFO', { acronyms: new Map([['CRO', 'chief revenue officer']]) })).toBe('chief revenue officer to chief financial officer');
	});
	it('matches a multi-word key across words, once, keeping the closing punctuation', () => {
		expect(say('Twinkima G rocks')).toBe('Twinkee mah Gee rocks');
		expect(say('We met Twinkima G.')).toBe('We met Twinkee mah Gee.');
		expect(say('TWINKIMA G wins')).toBe('Twinkee mah Gee wins');
		// A comma between the words breaks the phrase.
		expect(say('Twinkima, G rocks')).toBe('Twinkima, G rocks');
		expect(say("Twinkima G's set")).toBe("Twinkee mah Gee's set");
		// A key word that carries its own dot.
		const places = new Map([['St. Louis', 'Saint Louis'], ['U.S. Bank', 'U S Bank'], ['Acme Corp', '']]);
		expect(toSpokenText('From St. Louis, by U.S. Bank.', { terms: places })).toBe('From Saint Louis, by U S Bank.');
		// A silenced phrase drops its punctuation with it.
		expect(toSpokenText('Hello Acme Corp. Next', { terms: places })).toBe('Hello Next');
	});
	it('never substitutes a letter or digit key inside another word', () => {
		const letters = new Map([['e', 'EEK'], ['A', 'alpha'], ['G', 'gee'], ['↔', 'versus']]);
		expect(toSpokenText('revenue', { terms: letters })).toBe('revenue');
		expect(toSpokenText('A plan for the Area', { terms: letters })).toBe('alpha plan for the Area');
		expect(toSpokenText('red↔green', { terms: letters })).toBe('red versus green'); // a symbol key still does
		expect(toSpokenText('revenue', { lexicon: new Map([['e', 'EEK']]) })).toBe('revenue'); // the old lexicon trap, gone
	});
	it('peels a long run of marks around a phrase word linearly, and still matches it', () => {
		// The peel is an index scan (CodeQL js/polynomial-redos flagged the `[…]+$` regexes it replaced).
		const q = '"'.repeat(5000);
		expect(say(`Twinkima G${'!'.repeat(5000)}`).startsWith('Twinkee mah Gee')).toBe(true);
		expect(say(`${q}x${q}`)).toBe(toSpokenText(`${q}x${q}`));
	});
	it('silences an empty value', () => {
		expect(say('🎯 Goal')).toBe('Goal');
	});
	it('keeps every displayed word in a caption track while the voice says the phrase once', () => {
		const words = buildTrack('Twinkima G rocks.', { terms }).cues.flatMap((c) => c.words);
		expect(words.map((w) => w.display)).toEqual(['Twinkima', 'G', 'rocks.']);
		expect(words.map((w) => w.spoken)).toEqual(['Twinkee mah Gee', '', 'rocks.']);
	});
});

describe('term registry: precedence and aliases', () => {
	it('lets terms beat acronyms beat lexicon', () => {
		const lexicon = new Map([['ARR', 'lexicon']]);
		const acronyms = new Map([['ARR', 'acronyms']]);
		expect(toSpokenText('ARR', { lexicon })).toBe('lexicon');
		expect(toSpokenText('ARR', { lexicon, acronyms })).toBe('acronyms');
		expect(toSpokenText('ARR', { lexicon, acronyms, terms: new Map([['ARR', 'terms']]) })).toBe('terms');
	});
	it('gives an old acronyms: entry the same new forms', () => {
		expect(toSpokenText('CROs', { acronyms: new Map([['CRO', 'chief revenue officer']]) })).toBe('chief revenue officers');
	});
	it('cannot loop on a self-referencing value', () => {
		expect(toSpokenText('CRO', { terms: new Map([['CRO', 'CRO']]) })).toBe('CRO');
	});
	it('stops the lint coaching a term the registry covers in any of its forms', () => {
		expect(unmatchedAcronyms('CRO, EBITDA and the QZX', { terms })).toEqual(['QZX']);
		expect(unmatchedAcronyms('CRO, EBITDA and the QZX')).toEqual(['CRO', 'QZX']); // EBITDA is built in
	});
});

// The BUILT-IN terms (lexicon.ts) take the same endings and compounds as an author's, through the same
// matcher. Before, only the exact token matched: `API` expanded and `APIs`, `CEO’s`, `KPI-driven` read raw.
describe('built-in terms: endings and compounds', () => {
	const plain = (text: string) => toSpokenText(text);
	it('a plural or possessive of a built-in term says the term', () => {
		expect(plain('Two APIs ship.')).toBe('Two application programming interfaces ship.');
		expect(plain('the CEO’s plan')).toBe("the chief executive officer's plan");
		expect(plain('EMEA’s teams')).toBe("E M E A's teams");
	});
	it('a hyphen compound with a built-in term says each part', () => {
		expect(plain('a KPI-driven plan')).toBe('a key performance indicator driven plan');
		expect(plain('API-first.')).toBe('application programming interface first.');
	});
	it('leaves a compound with no term, a range and a date as they read', () => {
		expect(plain('under-13 users, 24/7, FY24-FY26, Q1-Q2')).toBe('under-13 users, 24/7, FY24-FY26, Q1-Q2');
	});
	it('an author entry still wins over the built-in one', () => {
		expect(toSpokenText('Two APIs', { terms: new Map([['API', 'A P I']]) })).toBe('Two A P Is');
	});
	it('a non-English deck gets no built-in ending either', () => {
		expect(toSpokenText('Zwei APIs', { lang: 'de' })).toBe('Zwei APIs');
	});
});

// A plural ending never doubles a plural the spoken form already has (`withEnding`).
describe('term endings: one plural, never two', () => {
	it('adds nothing after a spoken form that ends in s', () => {
		expect(toSpokenText('Set OKRs now.')).toBe('Set objectives and key results now.');
		expect(toSpokenText('FAQs')).toBe('frequently asked questions');
		expect(toSpokenText('CROs', { terms: new Map([['CRO', 'chief revenue officers']]) })).toBe('chief revenue officers');
	});
	it('adds es after ss, and s otherwise', () => {
		expect(toSpokenText('B2Bs win')).toBe('business to businesses win');
		expect(say('CROs met')).toBe('chief revenue officers met');
	});
});
