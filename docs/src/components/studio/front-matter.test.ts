import { describe, expect, it } from 'vitest';
import { acronymEntries, lexiconMap } from '@/lib/resolve-captions';
import { frontMatterBlock, getFrontMatter, mergeClassTokens, parseFinishOverride, removeClassTokens, setFrontMatter, setFrontMatterAcronyms, setFrontMatterBlock, stripFrontMatter } from './front-matter';

const BODY = '<!-- _class: title -->\n\n# Hello\n\n---\n\n## Second';

describe('front-matter', () => {
	it('round-trips a nested finish-override: block — a flat edit does NOT flatten it', () => {
		const src = '---\ntheme: indaco\nfinish: finish-shu\nfinish-override:\n  backdrop:\n    strength: 0.4\n    clearance: off\n---\n\n# Deck';
		// editing a FLAT key preserves the two-level nested block VERBATIM (regression: a
		// naive flat parser would flatten `backdrop:`/`strength:` into stray scalars)
		const out = setFrontMatter(src, 'paginate', 'true');
		expect(out).toMatch(/\nfinish-override:\n {2}backdrop:\n {4}strength: 0\.4\n {4}clearance: off\n/);
		expect(getFrontMatter(out, 'paginate')).toBe('true');
		expect(getFrontMatter(out, 'strength')).toBeUndefined(); // never a flat key
		expect(getFrontMatter(out, 'backdrop')).toBeUndefined();
	});

	it('parseFinishOverride reads the two-level map (layer → { attr: value })', () => {
		const src = '---\nfinish: finish-shu\nfinish-override:\n  backdrop:\n    strength: 0.4\n    clearance: off  # tune it down\n  wash:\n    intensity: 5\n---\n\n# D';
		expect(parseFinishOverride(src)).toEqual({ backdrop: { strength: '0.4', clearance: 'off' }, wash: { intensity: '5' } });
		// inline comments on a value are stripped; quotes unwrapped
		expect(parseFinishOverride('---\nfinish-override:\n  mark:\n    glyph: "AB"\n---\n\n# D')).toEqual({ mark: { glyph: 'AB' } });
	});

	it('parseFinishOverride returns {} when the block is absent or empty', () => {
		expect(parseFinishOverride('---\nfinish: finish-shu\n---\n\n# D')).toEqual({});
		expect(parseFinishOverride(BODY)).toEqual({});
		// a layer header with no attrs is dropped (no phantom empty layer)
		expect(parseFinishOverride('---\nfinish-override:\n  backdrop:\n---\n\n# D')).toEqual({});
	});

	it('parseFinishOverride also accepts the inline flow-map form (the docs shorthand)', () => {
		const src = '---\nfinish-override:\n  backdrop: { strength: 0.4, clearance: off }\n  wash: { intensity: 5 }  # note\n---\n\n# D';
		expect(parseFinishOverride(src)).toEqual({ backdrop: { strength: '0.4', clearance: 'off' }, wash: { intensity: '5' } });
		// mixed inline + expanded layers coexist
		const mixed = '---\nfinish-override:\n  backdrop: { clearance: on }\n  texture:\n    intensity: 4\n---\n\n# D';
		expect(parseFinishOverride(mixed)).toEqual({ backdrop: { clearance: 'on' }, texture: { intensity: '4' } });
		// an empty inline map yields nothing
		expect(parseFinishOverride('---\nfinish-override:\n  backdrop: {}\n---\n\n# D')).toEqual({});
	});

	it('parseFinishOverride carries a spotlight TRIPLE as a raw string (coerced downstream)', () => {
		const expanded = '---\nfinish-override:\n  backdrop:\n    spotlight: 84 30 40\n---\n\n# D';
		expect(parseFinishOverride(expanded)).toEqual({ backdrop: { spotlight: '84 30 40' } });
		const inline = '---\nfinish-override:\n  backdrop: { spotlight: 84 30 40 }\n---\n\n# D';
		expect(parseFinishOverride(inline)).toEqual({ backdrop: { spotlight: '84 30 40' } });
	});

	it('creates a block on the first directive', () => {
		const out = setFrontMatter(BODY, 'size', 'square');
		expect(out.startsWith('---\nsize: square\n---\n\n')).toBe(true);
		expect(stripFrontMatter(out)).toBe(BODY);
		expect(getFrontMatter(out, 'size')).toBe('square');
	});

	it('updates an existing key, preserves the others', () => {
		let out = setFrontMatter(BODY, 'size', '16:9');
		out = setFrontMatter(out, 'paginate', 'true');
		out = setFrontMatter(out, 'size', 'standard');
		expect(getFrontMatter(out, 'size')).toBe('standard');
		expect(getFrontMatter(out, 'paginate')).toBe('true');
		// Body is untouched (and not duplicated).
		expect(stripFrontMatter(out)).toBe(BODY);
	});

	it('removes the block when the last key is cleared', () => {
		const withFm = setFrontMatter(BODY, 'paginate', 'true');
		expect(frontMatterBlock(withFm)).not.toBe('');
		const cleared = setFrontMatter(withFm, 'paginate', null);
		expect(frontMatterBlock(cleared)).toBe('');
		expect(cleared).toBe(BODY);
	});

	it('quotes values that need it (header text with spaces)', () => {
		const out = setFrontMatter(BODY, 'header', 'Q3 Board Review');
		expect(out).toContain('header: "Q3 Board Review"');
		expect(getFrontMatter(out, 'header')).toBe('Q3 Board Review');
	});

	it('preserves meaningful leading indentation on the body (only blank lines collapse)', () => {
		const body = '  indented first line\n\n# Body';
		const out = setFrontMatter(body, 'size', 'square');
		expect(stripFrontMatter(out)).toBe(body); // the two leading spaces survive
	});

	it('the body separator `---` is not mistaken for front-matter', () => {
		// No leading block → the inter-slide `---` stays in the body.
		expect(frontMatterBlock(BODY)).toBe('');
		expect(stripFrontMatter(BODY)).toBe(BODY);
	});
});

describe('mergeClassTokens — finish class injection MERGES, never clobbers (MERGE-BLOCKER #1)', () => {
	it('unions a finish class onto an existing class:, preserving the author tokens', () => {
		// The bug: setFrontMatter REPLACES `class`, so `class: dark wide` + finish lost
		// `dark wide`. The fix unions them, deduped, in order.
		const src = '---\nclass: dark\n---\n\n# Deck';
		const out = mergeClassTokens(src, 'finish finish-mybrand');
		expect(getFrontMatter(out, 'class')).toBe('dark finish finish-mybrand');
	});

	it('preserves multiple author classes (class: dark wide)', () => {
		const src = '---\nclass: dark wide\n---\n\n# Deck';
		const out = mergeClassTokens(src, 'finish finish-x');
		expect(getFrontMatter(out, 'class')).toBe('dark wide finish finish-x');
	});

	it('creates class: when none exists', () => {
		const src = '---\nsize: hd\n---\n\n# Deck';
		const out = mergeClassTokens(src, 'finish finish-x');
		expect(getFrontMatter(out, 'class')).toBe('finish finish-x');
		expect(getFrontMatter(out, 'size')).toBe('hd'); // other directives intact
	});

	it('dedupes — an already-present token is not repeated', () => {
		const src = '---\nclass: finish dark\n---\n\n# Deck';
		const out = mergeClassTokens(src, 'finish finish-x');
		expect(getFrontMatter(out, 'class')).toBe('finish dark finish-x');
	});

	it('is a no-op with no incoming tokens', () => {
		const src = '---\nclass: dark\n---\n\n# Deck';
		expect(mergeClassTokens(src, '')).toBe(src);
		expect(mergeClassTokens(src, '   ')).toBe(src);
	});
});

describe('removeClassTokens — the inverse of mergeClassTokens', () => {
	it('drops a token, preserving the author tokens and their order', () => {
		const src = '---\nclass: dark no-progress wide\n---\n\n# Deck';
		expect(getFrontMatter(removeClassTokens(src, 'no-progress'), 'class')).toBe('dark wide');
	});

	it('removes the class: key entirely when the last token goes', () => {
		const src = '---\nclass: no-progress\n---\n\n# Deck';
		expect(getFrontMatter(removeClassTokens(src, 'no-progress'), 'class')).toBeUndefined();
	});

	it('is a no-op when the token is absent, or no class: / no tokens', () => {
		const src = '---\nclass: dark\n---\n\n# Deck';
		expect(removeClassTokens(src, 'no-progress')).toBe(src);
		expect(removeClassTokens('---\ntheme: indaco\n---\n\n# Deck', 'no-progress')).toBe('---\ntheme: indaco\n---\n\n# Deck');
		expect(removeClassTokens(src, '')).toBe(src);
	});

	it('round-trips with mergeClassTokens (stamp then clear leaves the original)', () => {
		const src = '---\nclass: dark\n---\n\n# Deck';
		expect(removeClassTokens(mergeClassTokens(src, 'no-progress'), 'no-progress')).toBe(src);
	});
});

describe('setFrontMatterBlock — nested child-map keys (lexicon:/acronyms:)', () => {
	it('writes a lexicon: block that the narration reader parses back', () => {
		const out = setFrontMatterBlock(BODY, 'lexicon', [
			['→', 'leads to'],
			['🎯', ''], // empty value → the "silence this token" form
			['Kubernetes', 'koober net eez'], // a whole word, not just a glyph
		]);
		const map = lexiconMap(out);
		expect(map.get('→')).toBe('leads to');
		expect(map.get('🎯')).toBe(''); // round-trips as silence, not dropped
		expect(map.get('Kubernetes')).toBe('koober net eez');
		expect(out).toContain('"🎯": ""'); // empty emitted explicitly
	});
	it('replaces an existing lexicon: block wholesale (no duplicate key)', () => {
		const once = setFrontMatterBlock(BODY, 'lexicon', [['→', 'to the']]);
		const twice = setFrontMatterBlock(once, 'lexicon', [['×', 'times']]);
		expect(twice.match(/^lexicon:/gm)?.length).toBe(1);
		expect(lexiconMap(twice).has('→')).toBe(false); // old entry gone
		expect(lexiconMap(twice).get('×')).toBe('times');
	});
	it('empty entries removes the block entirely', () => {
		const withBlock = setFrontMatterBlock(BODY, 'lexicon', [['→', 'to']]);
		const cleared = setFrontMatterBlock(withBlock, 'lexicon', []);
		expect(cleared).not.toContain('lexicon:');
		expect(lexiconMap(cleared).size).toBe(0);
	});
	it('preserves flat directives and other nested blocks', () => {
		const src = '---\ntheme: indaco\nfinish-override:\n  backdrop:\n    strength: 0.4\n---\n\n# Deck';
		const out = setFrontMatterBlock(src, 'lexicon', [['↔', 'and']]);
		expect(getFrontMatter(out, 'theme')).toBe('indaco');
		expect(out).toMatch(/finish-override:\n {2}backdrop:\n {4}strength: 0\.4/);
		expect(lexiconMap(out).get('↔')).toBe('and');
	});
});

describe('setFrontMatterAcronyms — structured term → { expansion, definition? }', () => {
	it('emits string shorthand with no definition, block-object WITH one, and round-trips both', () => {
		const out = setFrontMatterAcronyms(BODY, [
			['CRO', { expansion: 'chief revenue officer' }],
			['EBITDA', { expansion: 'ee bit dah', definition: 'Earnings before interest, taxes, and amortization.' }],
		]);
		// shorthand for the definition-less entry; block-object for the one with a definition
		expect(out).toMatch(/\n {2}CRO: /);
		expect(out).toMatch(/\n {2}EBITDA:\n {4}expansion: /);
		expect(out).toMatch(/\n {4}definition: "Earnings before interest, taxes, and amortization\."/); // comma-safe via quotes
		const map = acronymEntries(out);
		expect(map.get('CRO')).toEqual({ expansion: 'chief revenue officer' });
		expect(map.get('EBITDA')).toEqual({ expansion: 'ee bit dah', definition: 'Earnings before interest, taxes, and amortization.' });
	});
	it('replaces the block wholesale and removes it on empty', () => {
		const once = setFrontMatterAcronyms(BODY, [['ARR', { expansion: 'annual recurring revenue' }]]);
		expect(once.match(/^acronyms:/gm)?.length).toBe(1);
		const cleared = setFrontMatterAcronyms(once, []);
		expect(cleared).not.toContain('acronyms:');
		expect(acronymEntries(cleared).size).toBe(0);
	});
	it('drops an invalid term or an empty expansion (parser would skip them too)', () => {
		const out = setFrontMatterAcronyms(BODY, [
			['has space', { expansion: 'nope' }], // invalid term (space)
			['OK', { expansion: '' }], // empty expansion
			['GTM', { expansion: 'go to market' }],
		]);
		const map = acronymEntries(out);
		expect(map.has('has space')).toBe(false);
		expect(map.has('OK')).toBe(false);
		expect(map.get('GTM')).toEqual({ expansion: 'go to market' });
	});
	it('coexists with a lexicon: block — neither clobbers the other', () => {
		const withLex = setFrontMatterBlock(BODY, 'lexicon', [['→', 'leads to']]);
		const both = setFrontMatterAcronyms(withLex, [['CRO', { expansion: 'chief revenue officer' }]]);
		expect(lexiconMap(both).get('→')).toBe('leads to');
		expect(acronymEntries(both).get('CRO')?.expansion).toBe('chief revenue officer');
		// …and editing the lexicon again leaves acronyms intact
		const relex = setFrontMatterBlock(both, 'lexicon', [['×', 'times']]);
		expect(acronymEntries(relex).get('CRO')?.expansion).toBe('chief revenue officer');
	});
	it('last duplicate term wins, first-seen position kept', () => {
		const out = setFrontMatterAcronyms(BODY, [
			['X', { expansion: 'first' }],
			['X', { expansion: 'second' }],
		]);
		expect(out.match(/\n {2}X:/g)?.length).toBe(1);
		expect(acronymEntries(out).get('X')?.expansion).toBe('second');
	});
});

describe('setFrontMatterBlock — escaping', () => {
	it('escapes a backslash and a quote in a key (complete, backslash-first)', () => {
		// Glyph keys never carry these, but the escaping must be complete (CodeQL).
		const out = setFrontMatterBlock(BODY, 'lexicon', [['a\\b', 'x'], ['c"d', 'y']]);
		expect(out).toContain('"a\\\\b": x'); // backslash doubled
		expect(out).toContain('"c\\"d": y'); // quote escaped
	});
});
