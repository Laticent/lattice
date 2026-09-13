import { describe, expect, it } from 'vitest';
import { SETTINGS_SYNONYMS, settingsMatch } from './settings-search';

// A slice of the LIVE panel: rows read off the running Studio (both scopes) exactly as
// `settingsMatch` sees them — label, then value, then description, space-joined. Kept
// verbatim rather than paraphrased, because every claim below is about how a real author's
// word lands on a real row's words.
const ROWS = {
	theme: 'Theme Auto — Cuoio This deck’s color palette. palette colors brand',
	pageNumbers: 'Page numbers Number every slide. pagination paginate',
	hidePageNumber: 'Hide page number This slide’s page number.',
	cardLift: 'Card lift A soft shadow under card surfaces. shadow elevation struck',
	headlineAlign: 'Headline alignment Auto — Component Auto, or pin left / center / right.',
	typeScale: 'Type scale M L XL 2XL Sizes all the text on this slide together.',
	slideFinish: 'Finish None The backdrop behind this slide.',
	speakerNote: 'Speaker note for this slide Yours alone: shown beside the slide while you present. Never read aloud, and never in the caption track.',
	caption: 'Caption what this slide reads aloud Override the exact words this slide narrates.',
	claim: 'Claim Framed How much frame content sits inside.',
	stampShape: 'Stamp shape Default — tab The shape a state badge renders in.',
	play: 'Play Animate charts in this deck.',
	motionStyle: 'Style Build How a chart moves in.',
	lexicon: 'Lexicon A tricky word or symbol to say a certain way. Add a row to teach a tricky word\u2019s pronunciation.',
	acronyms: 'Acronyms A term\u2019s spoken expansion — how it should be read aloud.',
	hideHeader: 'Hide header The running title along the top.',
	saysNothing: 'Says nothing',
	comments: 'Add comment No comments on this slide yet.',
	a11y: 'Description for screen readers An objective equivalent of what’s on the slide — the accessibility text alternative (WCAG A).',
} as const;

const hits = (query: string) => (Object.keys(ROWS) as (keyof typeof ROWS)[]).filter((k) => settingsMatch(query, ROWS[k]));

describe('settingsMatch — the rule that did not change', () => {
	it('matches every whitespace term, in any order, and an empty query matches everything', () => {
		expect(settingsMatch('page number', ROWS.hidePageNumber)).toBe(true);
		expect(settingsMatch('number page', ROWS.hidePageNumber)).toBe(true);
		expect(settingsMatch('', ROWS.theme)).toBe(true);
		expect(settingsMatch('   ', ROWS.theme)).toBe(true);
	});

	it('is a prefix match on the way in — a row appears before the word is finished', () => {
		for (const q of ['p', 'pa', 'pag', 'page']) expect(settingsMatch(q, ROWS.pageNumbers)).toBe(true);
	});

	it('folds case and diacritics both ways', () => {
		expect(settingsMatch('EYEBROW', 'Eyebrow Plain')).toBe(true);
		expect(settingsMatch('resume', 'Résumé finish')).toBe(true);
		expect(settingsMatch('résumé', 'Resume finish')).toBe(true);
	});

	it('keeps STOP WORDS, which a picker tokenizer would eat', () => {
		// `intent-search`'s `contentWords` drops "nothing", "something", "says", "no", "all".
		// This panel has rows whose ONLY distinguishing word is one of those.
		expect(settingsMatch('nothing', ROWS.saysNothing)).toBe(true);
		expect(settingsMatch('says nothing', ROWS.saysNothing)).toBe(true);
		expect(settingsMatch('no comments', ROWS.comments)).toBe(true);
	});

	it('still refuses a term the row has no business matching', () => {
		expect(settingsMatch('theme', ROWS.comments)).toBe(false);
		expect(settingsMatch('page dark', ROWS.pageNumbers)).toBe(false); // every term must land
	});
});

describe('settingsMatch — morphology', () => {
	it('reaches a row whose word is SHORTER than the query, which substring never could', () => {
		expect(settingsMatch('numbers', ROWS.hidePageNumber)).toBe(true); // "number"
		expect(settingsMatch('captions', ROWS.caption)).toBe(true); // "Caption"
		expect(settingsMatch('shadows', ROWS.cardLift)).toBe(true); // "shadow"
		expect(settingsMatch('colors', ROWS.theme)).toBe(true); // "color"
		expect(settingsMatch('aligned', ROWS.headlineAlign)).toBe(true); // "alignment"
	});

	it('folds the British spelling onto the house one, so an author finds what we index', () => {
		expect(settingsMatch('colour', 'Theme This deck\u2019s color palette.')).toBe(true);
		// The PLURAL is the arm that needs `americanize` on BOTH sides of the stemmer: its
		// rules are anchored to the end of the word, so the trailing `s` hides `-our` until
		// Porter2 has taken it off. Two edits from "color", so the typo repair cannot rescue
		// this one — which is the point of asserting it against the singular alone.
		expect(settingsMatch('colours', 'Theme This deck\u2019s color palette.')).toBe(true);
	});
});

describe('settingsMatch — vocabulary', () => {
	it('reaches a row through a word no row says', () => {
		expect(settingsMatch('font', ROWS.typeScale)).toBe(true);
		expect(settingsMatch('typography', ROWS.typeScale)).toBe(true);
		expect(settingsMatch('background', ROWS.slideFinish)).toBe(true);
		expect(settingsMatch('pagination', ROWS.hidePageNumber)).toBe(true);
		expect(settingsMatch('margin', ROWS.claim)).toBe(true);
		expect(settingsMatch('watermark', ROWS.stampShape)).toBe(true);
		expect(settingsMatch('a11y', ROWS.a11y)).toBe(true);
	});

	it('finds an entry by the PLURAL of its key', () => {
		expect(settingsMatch('fonts', ROWS.typeScale)).toBe(true);
	});

	it('keeps a multi-word expansion a PHRASE — `font` is not `type`', () => {
		// `font: 'type'` would drag in every row that says "as you type"; the entry names the
		// row actually called Type scale.
		expect(settingsMatch('font', 'Inline validation Flag unknown components as you type.')).toBe(false);
	});

	it('every entry still reaches a row, and none of them opens the panel', () => {
		// A synonym that reaches nothing is dead weight; one that reaches half the panel is
		// worse than absent. Both fail here rather than in someone's search.
		for (const key of Object.keys(SETTINGS_SYNONYMS)) {
			const n = hits(key).length;
			expect(n, `synonym "${key}" reaches ${n} of ${Object.keys(ROWS).length} rows`).toBeGreaterThan(0);
			expect(n, `synonym "${key}" reaches ${n} of ${Object.keys(ROWS).length} rows`).toBeLessThanOrEqual(4);
		}
	});
});

describe('settingsMatch — typo repair', () => {
	it('repairs a dropped, doubled or swapped letter', () => {
		expect(settingsMatch('numbre', ROWS.pageNumbers)).toBe(true); // transposition
		expect(settingsMatch('nubmer', ROWS.pageNumbers)).toBe(true); // transposition, earlier
		expect(settingsMatch('capiton', ROWS.caption)).toBe(true); // transposition
		expect(settingsMatch('algnment', ROWS.headlineAlign)).toBe(true); // dropped letter
		expect(settingsMatch('shaddow', ROWS.cardLift)).toBe(true); // doubled letter
	});

	it('will not repair across the first two characters — the anchor', () => {
		// The property that makes a PER-ROW repair safe without a global vocabulary.
		expect(settingsMatch('mark', 'Canvas Auto Light Dark')).toBe(false);
		expect(settingsMatch('accent', 'Ascent of the rail')).toBe(false);
		expect(settingsMatch('hint', 'Tint the slide')).toBe(false);
	});

	it('spends ONE edit, so two real words that share a prefix stay apart', () => {
		// At two edits "comment" reached the row about frame CONTENT, which is why the ladder
		// is one edit rather than the picker's two-at-seven.
		expect(settingsMatch('comment', ROWS.claim)).toBe(false);
		expect(settingsMatch('connect', ROWS.claim)).toBe(false);
	});

	it('does not repair a short word at all', () => {
		// Four letters is too few for an edit to be more likely a slip than a different word,
		// and these pairs SHARE the anchor — so it is the length floor refusing them, not the
		// first-two-characters rule the test above covers.
		expect(settingsMatch('lint', 'Header The line along the top.')).toBe(false);
		expect(settingsMatch('rail', 'Heading rule Auto — Hairline')).toBe(false);
	});
});

describe('settingsMatch — the pathological input', () => {
	it('survives a pasted blob without stemming a 20,000-character token', () => {
		const blob = 'x'.repeat(20_000);
		const t0 = Date.now();
		expect(settingsMatch(blob, ROWS.theme)).toBe(false);
		expect(settingsMatch(`page ${blob}`, ROWS.pageNumbers)).toBe(false);
		expect(Date.now() - t0).toBeLessThan(1000);
	});

	it('caps the term count, and the cap cannot RESCUE a query', () => {
		// Terms are ANDed, so anything past the cap could only ever remove more rows.
		const many = Array.from({ length: 40 }, (_, i) => `zzz${i}`).join(' ');
		expect(settingsMatch(many, ROWS.theme)).toBe(false);
		expect(settingsMatch(`page ${many}`, ROWS.pageNumbers)).toBe(false);
	});
});
