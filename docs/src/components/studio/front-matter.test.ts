import { describe, expect, it } from 'vitest';
import { frontMatterBlock, getFrontMatter, mergeClassTokens, parseFinishOverride, setFrontMatter, stripFrontMatter } from './front-matter';

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
