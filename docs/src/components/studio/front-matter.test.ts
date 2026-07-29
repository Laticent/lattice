import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLensRegistry, upsertLensRegistry } from '@/lib/lente';
import { acronymEntries, lexiconMap } from '@/lib/resolve-captions';
import { frontMatterBlock, getFrontMatter, innerFrontMatter, mergeClassTokens, parseFinishOverride, removeClassTokens, setFrontMatterAcronyms, setFrontMatterBlock, stripFrontMatter, writeFrontMatterLine } from './front-matter';

const BODY = '<!-- _class: title -->\n\n# Hello\n\n---\n\n## Second';

// The exact reconstruction the shell uses to persist a registry edit: extract the inner front matter,
// let Lente (the sole registry serializer) rewrite the `lenses:` block, re-wrap in `---` delimiters.
function withRegistry(source: string, reg: ReturnType<typeof parseLensRegistry>): string {
	const nextInner = upsertLensRegistry(innerFrontMatter(source), reg);
	const rest = stripFrontMatter(source).replace(/^(?:[ \t]*\r?\n)+/, '');
	return nextInner.trim() ? `---\n${nextInner}\n---\n\n${rest}` : rest;
}

describe('innerFrontMatter + registry write-back (the shell↔Lente seam)', () => {
	it('returns the body BETWEEN the delimiters, or "" for a source with no block', () => {
		expect(innerFrontMatter('---\ntheme: indaco\nsize: 16:9\n---\n\n# Deck')).toBe('theme: indaco\nsize: 16:9');
		expect(innerFrontMatter('# No front matter here')).toBe('');
	});

	it('adds a lenses: block to a deck that had front matter, preserving the other keys AND the body', () => {
		const src = `---\ntheme: indaco\n---\n\n${BODY}`;
		const reg = parseLensRegistry('lenses:\n  brief: { label: "Bottom line", base: none }');
		const out = withRegistry(src, reg);
		expect(getFrontMatter(out, 'theme')).toBe('indaco'); // unrelated key survives
		expect(stripFrontMatter(out)).toBe(BODY); // body untouched
		// The written block re-parses to the same registry (round-trip through Lente).
		expect(parseLensRegistry(frontMatterBlock(out)).lenses.map((l) => l.id)).toEqual(['full', 'brief']);
	});

	it('creates a fresh front-matter block for a deck that had none', () => {
		const reg = parseLensRegistry('lenses:\n  story: { label: "The story", base: none }');
		const out = withRegistry(BODY, reg);
		expect(out.startsWith('---\n')).toBe(true);
		expect(stripFrontMatter(out)).toBe(BODY);
		expect(parseLensRegistry(frontMatterBlock(out)).lenses.some((l) => l.id === 'story')).toBe(true);
	});

	it('an approval hash written into the block re-parses intact', () => {
		const reg = parseLensRegistry('lenses:\n  brief: { label: "B", base: none, approved: "sha256:abc123" }');
		const out = withRegistry(`---\nsize: 16:9\n---\n\n${BODY}`, reg);
		const brief = parseLensRegistry(frontMatterBlock(out)).lenses.find((l) => l.id === 'brief');
		expect(brief?.approved).toBe('sha256:abc123');
	});
});

describe('front-matter', () => {
	it('round-trips a nested finish-override: block — a flat edit does NOT flatten it', () => {
		const src = '---\ntheme: indaco\nfinish: finish-shu\nfinish-override:\n  backdrop:\n    strength: 0.4\n    clearance: off\n---\n\n# Deck';
		// editing a FLAT key preserves the two-level nested block VERBATIM (regression: a
		// naive flat parser would flatten `backdrop:`/`strength:` into stray scalars)
		const out = writeFrontMatterLine(src, 'paginate', 'true');
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
		const out = writeFrontMatterLine(BODY, 'size', 'square');
		expect(out.startsWith('---\nsize: square\n---\n\n')).toBe(true);
		expect(stripFrontMatter(out)).toBe(BODY);
		expect(getFrontMatter(out, 'size')).toBe('square');
	});

	it('updates an existing key, preserves the others', () => {
		let out = writeFrontMatterLine(BODY, 'size', '16:9');
		out = writeFrontMatterLine(out, 'paginate', 'true');
		out = writeFrontMatterLine(out, 'size', 'standard');
		expect(getFrontMatter(out, 'size')).toBe('standard');
		expect(getFrontMatter(out, 'paginate')).toBe('true');
		// Body is untouched (and not duplicated).
		expect(stripFrontMatter(out)).toBe(BODY);
	});

	it('removes the block when the last key is cleared', () => {
		const withFm = writeFrontMatterLine(BODY, 'paginate', 'true');
		expect(frontMatterBlock(withFm)).not.toBe('');
		const cleared = writeFrontMatterLine(withFm, 'paginate', null);
		expect(frontMatterBlock(cleared)).toBe('');
		expect(cleared).toBe(BODY);
	});

	it('quotes values that need it (header text with spaces)', () => {
		const out = writeFrontMatterLine(BODY, 'header', 'Q3 Board Review');
		expect(out).toContain('header: "Q3 Board Review"');
		expect(getFrontMatter(out, 'header')).toBe('Q3 Board Review');
	});

	it('preserves meaningful leading indentation on the body (only blank lines collapse)', () => {
		const body = '  indented first line\n\n# Body';
		const out = writeFrontMatterLine(body, 'size', 'square');
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
		// The bug: a plain write REPLACES `class`, so `class: dark wide` + finish lost
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
	it('a quote or backslash in an expansion / definition round-trips losslessly (no leaked escapes)', () => {
		const out = setFrontMatterAcronyms(BODY, [
			['RR', { expansion: 'the "run rate"', definition: 'A back\\slash and a "quote".' }],
		]);
		const entry = acronymEntries(out).get('RR');
		expect(entry?.expansion).toBe('the "run rate"'); // not the\"run rate\"
		expect(entry?.definition).toBe('A back\\slash and a "quote".');
		// …and it stays stable across a re-serialize (escapes must not compound)
		const twice = setFrontMatterAcronyms(out, [...acronymEntries(out)]);
		expect(acronymEntries(twice).get('RR')).toEqual(entry);
	});
	it('rejects the reserved field names `expansion` / `definition` as terms (parser would drop them)', () => {
		const out = setFrontMatterAcronyms(BODY, [
			['definition', { expansion: 'nope' }],
			['expansion', { expansion: 'nope' }],
			['OK', { expansion: 'fine' }],
		]);
		const map = acronymEntries(out);
		expect(map.has('definition')).toBe(false);
		expect(map.has('expansion')).toBe(false);
		expect(map.get('OK')?.expansion).toBe('fine');
	});
	it('a block-object acronym survives an unrelated front-matter edit verbatim', () => {
		const withAcr = setFrontMatterAcronyms(BODY, [
			['EBITDA', { expansion: 'ee bit dah', definition: 'Earnings before interest, taxes.' }],
		]);
		// edit a DIFFERENT key — the two-level acronyms block must not be flattened or dropped
		const edited = setFrontMatterBlock(writeFrontMatterLine(withAcr, 'paginate', 'true'), 'lexicon', [['→', 'to']]);
		expect(edited).toMatch(/\n {2}EBITDA:\n {4}expansion: /);
		const e = acronymEntries(edited).get('EBITDA');
		expect(e).toEqual({ expansion: 'ee bit dah', definition: 'Earnings before interest, taxes.' });
		expect(lexiconMap(edited).get('→')).toBe('to');
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

// ─────────────────────────────────────────────────────────────────────────────
// #1256 — every flat-scalar write is a LINE SPLICE, on every deck-scope key.
//
// #1254 made `title:` lossless and left 24 other directives on the whole-block
// rebuild, on the theory that the Deck-setup drawer "owns" those keys. It does not:
// an author hand-writes `theme:`, `size:` and `header:` all the time, and the deck
// that carries them is the same deck that carries the YAML comment, the `_class:`,
// and the `style: |` block the rebuild deleted. The acceptance deck below is the one
// from the card — every construct `parseFm`'s grammar does not model, in one block.
// ─────────────────────────────────────────────────────────────────────────────

const RICH = [
	'---',
	'# legal signed off on this footer',
	'theme: indaco',
	'_class: lead',
	'style: |',
	'  section.title h1 { color: red; }',
	'tags: [alpha, beta]',
	'---',
	'',
	'# Q4',
	'',
].join('\n');

/** Every line EXCEPT the one that carries `key` — the bytes a lossless write must leave
 *  untouched, in order. Comparing these across a write is byte-identity of the whole file
 *  minus the one line the caller came to change. */
function linesExcept(source: string, key: string): string[] {
	const re = new RegExp(`^\\s*${key}\\s*:`);
	return source.split('\n').filter((l) => !re.test(l));
}

// Every flat directive a deck-scope control writes: the 23 in StudioShell + `class`
// (the class-token helpers) + `finish`, which the EXPORT path also clears.
const DECK_SCOPE_KEYS = [
	'theme', 'color-mode', 'finish', 'mode', 'motion', 'motion-style', 'motion-speed',
	'spectrum', 'spectrum-edge', 'spectrum-card', 'spectrum-card-edge', 'rule', 'eyebrow',
	'headline', 'spectrum-trim', 'debug', 'lang', 'size', 'paginate', 'lift', 'header',
	'footer', 'title', 'class',
];

describe('every deck-scope directive writes losslessly (#1256)', () => {
	it.each(DECK_SCOPE_KEYS)('setting `%s` leaves every other byte identical', (key) => {
		const out = writeFrontMatterLine(RICH, key, 'x-value');
		// The write really happened — otherwise "nothing else changed" is vacuously true.
		expect(getFrontMatter(out, key)).toBe('x-value');
		// …and nothing else did: the comment, `_class:`, the block scalar AND its indented
		// body, the flow sequence, and the key order all survive byte-for-byte.
		expect(linesExcept(out, key)).toEqual(linesExcept(RICH, key));
	});

	it.each(DECK_SCOPE_KEYS)('setting then clearing `%s` restores the deck exactly', (key) => {
		// The round trip is the strongest form of the claim: set-then-clear is the identity,
		// so neither direction can leak a normalization. `theme:` is the one key the deck
		// ALREADY carries, so clearing it removes the author's own line — the round trip lands
		// on the deck minus that line, which is still byte-exact everywhere else.
		const expected = key === 'theme' ? RICH.replace('theme: indaco\n', '') : RICH;
		expect(writeFrontMatterLine(writeFrontMatterLine(RICH, key, 'x-value'), key, null)).toBe(expected);
	});

	it('the four constructs the whole-block rebuild destroyed are named explicitly', () => {
		// The it.each above proves this generically; this one names the losses from the card
		// so a failure reads as "the YAML comment is gone", not "arrays differ at index 1".
		const out = writeFrontMatterLine(RICH, 'header', 'Acme — Q3');
		expect(out).toContain('# legal signed off on this footer'); // the YAML comment
		expect(out).toContain('_class: lead'); // the `_`-prefixed key parseFm cannot see
		expect(out).toContain('style: |'); // …and NOT the corrupted `style: "|"`
		expect(out).toContain('  section.title h1 { color: red; }'); // the block scalar's BODY
		expect(out).toContain('tags: [alpha, beta]'); // the flow sequence, not a string
		expect(out).not.toContain('"[alpha, beta]"');
		// key ORDER is unchanged — the new line lands at the end of the block, and the
		// existing keys stay exactly where the author put them.
		expect(out.indexOf('theme: indaco')).toBeLessThan(out.indexOf('tags: [alpha, beta]'));
	});

	it('a CRLF deck stays CRLF — every line, including the new one', () => {
		const crlf = RICH.replace(/\n/g, '\r\n');
		const out = writeFrontMatterLine(crlf, 'size', '16:9');
		expect(getFrontMatter(out, 'size')).toBe('16:9');
		// No bare LF anywhere: a mixed-EOL file is the regression this pins.
		expect(/[^\r]\n/.test(out)).toBe(false);
		expect(linesExcept(out, 'size')).toEqual(linesExcept(crlf, 'size'));
		expect(writeFrontMatterLine(out, 'size', null)).toBe(crlf);
	});

	it('a deck whose leading `---` is a slide separator keeps that slide', () => {
		// FM_RE cannot tell a separator from front matter, so slide 1 is "inside the block".
		// A splice can at worst edit the wrong line; the rebuild deleted the slide outright.
		const sep = '---\n\n<!-- _class: title -->\n\n# Cover slide\n\nRevenue up 12 percent.\n\n---\n\n# Second slide\n';
		for (const key of DECK_SCOPE_KEYS) {
			const out = writeFrontMatterLine(sep, key, 'x-value');
			expect(out, key).toContain('# Cover slide');
			expect(out, key).toContain('Revenue up 12 percent.');
			expect(out, key).toContain('# Second slide');
		}
	});

	it('the class-token helpers splice too — they are deck-scope writers like the rest', () => {
		const stamped = mergeClassTokens(RICH, 'no-progress');
		expect(getFrontMatter(stamped, 'class')).toBe('no-progress');
		expect(linesExcept(stamped, 'class')).toEqual(linesExcept(RICH, 'class'));
		// …and the inverse restores the deck byte-for-byte.
		expect(removeClassTokens(stamped, 'no-progress')).toBe(RICH);
	});

	it('the destructive whole-block writer is GONE, not merely unused', () => {
		// A discouraged-but-exported writer is one autocomplete away from coming back, and the
		// failure is silent — the deck still renders, the author's comment is just missing.
		// `setFrontMatterBlock` / `setFrontMatterAcronyms` are deliberately NOT matched: they
		// own a nested block and legitimately re-emit one.
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir)) {
				const full = join(dir, entry);
				if (statSync(full).isDirectory()) {
					walk(full);
				} else if (/\.(ts|tsx|astro|js|jsx)$/.test(entry)) {
					if (/\bsetFrontMatter\s*\(/.test(readFileSync(full, 'utf8'))) offenders.push(full);
				}
			}
		};
		walk(join(__dirname, '..', '..'));
		expect(offenders).toEqual([]);
	});
});
