import { describe, expect, it } from 'vitest';
import { toSpoken, toSpokenText } from './normalize';
import { resolveSymbols, SYMBOL_SPEAK } from './symbols';

// The Speech Symbol Commons (2026-07-13-speech-symbol-commons.md): one glyph pass that SPEAKS an
// unambiguous symbol, DROPS a decorative emoji, or honors an author override — standalone,
// embedded, or mixed. resolveSymbols is the pure core; the toSpoken tests pin the integration.

describe('resolveSymbols — the pure glyph pass', () => {
	it('returns null when the token carries no actionable symbol (caller continues normally)', () => {
		expect(resolveSymbols('revenue')).toBeNull();
		expect(resolveSymbols('Q1')).toBeNull();
		expect(resolveSymbols('')).toBeNull();
		expect(resolveSymbols('+')).toBeNull(); // ambiguous ASCII — deliberately NOT in the commons
	});
	it('SPEAKS an unambiguous glyph, standalone and embedded', () => {
		expect(resolveSymbols('×')).toBe(' times ');
		expect(resolveSymbols('3×4')).toBe('3 times 4');
		expect(resolveSymbols('red↔green')).toBe('red and green');
	});
	it('DROPS a decorative emoji to silence, keeps a directional emoji as its word', () => {
		expect(resolveSymbols('🚀')?.trim()).toBe(''); // dropped
		expect(resolveSymbols('ship 🚀 it')?.replace(/\s+/g, ' ').trim()).toBe('ship it');
		expect(resolveSymbols('➡️')).toBe(' to '); // emoji arrow (variation selector stripped) → SPEAK
	});
	it('an author override beats the built-in table and applies in any language', () => {
		const overrides = new Map([['→', 'leads to']]);
		expect(resolveSymbols('→', { overrides })).toBe(' leads to ');
		expect(resolveSymbols('→', { overrides, english: false })).toBe(' leads to ');
	});
	it('an override to empty string silences a glyph', () => {
		const overrides = new Map([['★', '']]);
		expect(resolveSymbols('★', { overrides })?.trim()).toBe('');
	});
	it('does NOT inject the English SPEAK table into a non-English deck (#919), but still drops emoji', () => {
		expect(resolveSymbols('→', { english: false })).toBeNull(); // left alone — no English "to"
		expect(resolveSymbols('🚀', { english: false })?.trim()).toBe(''); // silence is language-neutral
	});
});

describe('toSpoken — symbol commons integration', () => {
	it('narrates math operators as words', () => {
		expect(toSpokenText('3 × 4')).toBe('three times four');
		expect(toSpokenText('latency ≈ 40ms')).toBe('latency approximately 40ms');
		expect(toSpoken('±5')).toBe('plus or minus five'); // the operand normalizes through the pass
	});
	it('narrates typographic marks; a lexicon key containing a symbol still wins whole-token', () => {
		expect(toSpoken('©')).toBe('copyright');
		expect(toSpoken('™')).toBe('trademark');
		expect(toSpoken('R&D')).toBe('research and development'); // whole-token lexicon beats "&"→"and"
		expect(toSpokenText('A & B')).toBe('A and B'); // bare "&" → commons
	});
	it('drops decorative emoji from the spoken form (never reads "rocket")', () => {
		expect(toSpokenText('Ship it 🚀 today')).toBe('Ship it today');
	});
	it('honors a deck lexicon override over the built-in', () => {
		const symbols = new Map([['→', 'leads to']]);
		expect(toSpokenText('cause → effect', { symbols })).toBe('cause leads to effect');
	});
	it('a lexicon entry can teach a WHOLE WORD, not just a glyph', () => {
		const symbols = new Map([['Kubernetes', 'koober net eez']]);
		expect(toSpoken('Kubernetes', { symbols })).toBe('koober net eez');
		// …and still matches when the word carries a terminator.
		expect(toSpokenText('We run Kubernetes.', { symbols })).toBe('We run koober net eez.');
	});
	it('a lexicon word override with an empty value silences the word', () => {
		expect(toSpoken('confidential', { symbols: new Map([['confidential', '']]) })).toBe('');
	});
	it('a lexicon key that CONTAINS a commons glyph wins whole, even with a terminator', () => {
		// The whole-key override must beat the per-glyph "&"→"and" pass — bare AND punctuated.
		const symbols = new Map([['R&D', 'the research group']]);
		expect(toSpoken('R&D', { symbols })).toBe('the research group');
		expect(toSpoken('R&D.', { symbols })).toBe('the research group.'); // terminator re-attached, not "R and D."
		expect(toSpokenText('Fund R&D, always.', { symbols })).toBe('Fund the research group, always.');
	});
	it('honors an author lexicon in a NON-English deck (author vocabulary, not injected English)', () => {
		const symbols = new Map([['Kubernetes', 'koober net eez']]);
		expect(toSpoken('Kubernetes', { symbols, lang: 'de' })).toBe('koober net eez');
		expect(toSpoken('Kubernetes.', { symbols, lang: 'de' })).toBe('koober net eez.');
	});
	it('leaves ambiguous ASCII to the existing parsers (not spoken as a symbol name)', () => {
		expect(toSpoken('C++')).toBe('C++'); // "+" untouched by the commons
	});
	it('a cyclic / self-referential override cannot infinite-recurse (untrusted front-matter is hostile)', () => {
		// symbols: {"→":"→"} once crashed with RangeError — reachable from a shared/AI deck's YAML.
		// The re-normalize drops overrides, so a surviving glyph resolves via the acyclic built-in.
		expect(() => toSpokenText('Q1 → Q2', { symbols: new Map([['→', '→']]) })).not.toThrow();
		expect(toSpokenText('Q1 → Q2', { symbols: new Map([['→', '→']]) })).toBe('first quarter to second quarter');
		expect(toSpokenText('a → b', { symbols: new Map([['→', 'x → y']]) })).toBe('a x to y b'); // one level of override, then built-in
		const twoCycle = new Map([
			['→', '↔'],
			['↔', '→'],
		]);
		expect(() => toSpokenText('a → b ↔ c', { symbols: twoCycle })).not.toThrow();
	});
	it('an absurdly long single token from an untrusted deck cannot DoS the normalizer', () => {
		// Red-team (PR #952): a token of ~50k leading signs once overflowed spokenCore's sign
		// recursion, and a long punctuation run followed by a non-punct char made the trailing
		// peel quadratic — both a reader/export freeze from hostile front-matter. The
		// MAX_SPOKEN_TOKEN guard bounds them; each assertion must return fast, not hang or throw.
		const signRun = `${'-'.repeat(50000)}A`; // sign-recursion vector
		const peelRun = `x${','.repeat(50000)}z`; // punct run then non-punct → O(n²) peel vector
		expect(() => toSpoken(signRun)).not.toThrow();
		expect(() => toSpoken(peelRun)).not.toThrow();
		expect(() => toSpokenText(`Fine ${signRun} and ${peelRun} words.`)).not.toThrow();
		expect(toSpoken(signRun)).toBe(signRun); // over the bound → spoken verbatim, no crash
	});
	it('every SPEAK entry round-trips through toSpoken to its word', () => {
		for (const [glyph, word] of Object.entries(SYMBOL_SPEAK)) {
			expect(toSpoken(glyph)).toBe(word);
		}
	});
});
