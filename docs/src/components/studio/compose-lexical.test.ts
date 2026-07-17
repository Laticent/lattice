import { describe, expect, it } from 'vitest';
import { composeSlideChunk, normalizeSource, parseDeck, recompileDeck, slideClassOf, splitSlideDirectives } from './compose-lexical';

// The round-trip contract for the Compose surface: directives are split off and
// re-emitted, prose is what the rich editor owns — and NOTHING inside a fenced code
// block is ever mistaken for a directive (checker finding #2).

describe('splitSlideDirectives', () => {
	it('splits leading directives from prose', () => {
		const { directives, prose } = splitSlideDirectives('<!-- _class: content -->\n\n## Heading\n\nBody text.');
		expect(directives).toEqual(['<!-- _class: content -->']);
		expect(prose).toBe('## Heading\n\nBody text.');
	});

	it('preserves multiple sibling directives in order', () => {
		const { directives } = splitSlideDirectives('<!-- _class: title -->\n<!-- _paginate: false -->\n<!-- _footer: \'\' -->\n\n# T');
		expect(directives).toEqual(['<!-- _class: title -->', '<!-- _paginate: false -->', "<!-- _footer: '' -->"]);
	});

	it('does NOT hoist a directive that lives inside a fenced code block', () => {
		const chunk = '<!-- _class: code -->\n\n## Directives\n\n```html\n<!-- _class: title -->\n<!-- _paginate: false -->\n```';
		const { directives, prose } = splitSlideDirectives(chunk);
		// Only the real slide directive is captured; the fenced sample stays in prose.
		expect(directives).toEqual(['<!-- _class: code -->']);
		expect(prose).toContain('```html\n<!-- _class: title -->\n<!-- _paginate: false -->\n```');
	});

	it('round-trips: composeSlideChunk(split(x)) preserves the directive + prose', () => {
		const chunk = '<!-- _class: kpi -->\n\n`Financial · Q4`\n\n## Revenue\n\n- one\n- two';
		const { directives, prose } = splitSlideDirectives(chunk);
		const back = composeSlideChunk(directives, prose);
		expect(back).toBe(chunk);
	});
});

describe('composeSlideChunk', () => {
	it('emits directives above prose', () => {
		expect(composeSlideChunk(['<!-- _class: content -->'], '## H')).toBe('<!-- _class: content -->\n\n## H');
	});
	it('returns bare directives when the slide has no prose', () => {
		expect(composeSlideChunk(['<!-- _class: divider -->'], '')).toBe('<!-- _class: divider -->');
	});
	it('returns bare prose when there are no directives', () => {
		expect(composeSlideChunk([], '# Just prose')).toBe('# Just prose');
	});
});

describe('slideClassOf', () => {
	it('reads the _class component name', () => {
		expect(slideClassOf(['<!-- _class: big-number dark -->'])).toBe('big-number');
	});
	it('falls back to content when no _class is present', () => {
		expect(slideClassOf(['<!-- _paginate: false -->'])).toBe('content');
	});
});

describe('normalizeSource / parseDeck — CRLF cannot collapse the deck (red-team #1)', () => {
	const crlf = '<!-- _class: title -->\r\n# A\r\n\r\n---\r\n\r\n<!-- _class: content -->\r\n# B';
	it('CRLF source parses into the SAME slide count as its LF twin', () => {
		expect(parseDeck(crlf).slides).toHaveLength(2);
		expect(normalizeSource(crlf)).not.toContain('\r');
	});
	it('a lone CR is also normalized', () => {
		expect(normalizeSource('a\rb')).toBe('a\nb');
	});
});

describe('recompileDeck — untouched slides keep their raw bytes (finding #3)', () => {
	const source = '<!-- _class: title -->\n\n# One\n\n---\n\n<!-- _class: kpi -->\n\n1. $9\n   - label\n   - note\n\n---\n\n# Three';
	it('editing slide 0 leaves the structured slide 1 byte-identical', () => {
		const { fm, slides } = parseDeck(source);
		const out = recompileDeck(slides, fm, 0, '# One EDITED');
		// The nested-list slide the user never touched is preserved verbatim (no flatten).
		expect(out).toContain('1. $9\n   - label\n   - note');
		expect(out).toContain('# One EDITED');
		expect(out).toContain('# Three');
		expect(parseDeck(out).slides).toHaveLength(3);
	});
	it('front-matter is preserved on recompile', () => {
		const withFm = '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# A\n\n---\n\n# B';
		const { fm, slides } = parseDeck(withFm);
		const out = recompileDeck(slides, fm, 1, '# B2');
		expect(out.startsWith('---\ntheme: indaco\n---\n')).toBe(true);
		expect(out).toContain('# B2');
	});
});
