import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from './deck-doc';

// The whole-deck round-trip through the ONE document: source → doc → source.
// Directives, front-matter, slide order, and structured nesting must all survive.

const norm = (s: string) => s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const rt = (src: string) => docToDeck(deckToDoc(src));

describe('deck round-trip (one document)', () => {
	it('preserves directives, front-matter, slide order, and a KPI slide', () => {
		const source = [
			'---',
			'theme: indaco',
			'---',
			'',
			'<!-- _class: title -->',
			'',
			'# Q4 board review',
			'',
			'`Financial · Q4 2026`',
			'',
			'---',
			'',
			'<!-- _class: kpi -->',
			'',
			'## Revenue ahead of plan.',
			'',
			'1. $2.4B',
			'   - Total revenue',
			'   - target $2.2B `On plan`',
			'2. 42%',
			'   - Gross margin',
			'',
			'---',
			'',
			'<!-- _class: content -->',
			'',
			'## Closing',
			'',
			'- One',
			'- Two',
		].join('\n');
		const out = rt(source);
		expect(out).toContain('theme: indaco'); // front-matter kept
		expect(out).toContain('<!-- _class: title -->');
		expect(out).toContain('<!-- _class: kpi -->');
		expect(out).toContain('<!-- _class: content -->');
		expect(/1\.\s+\$2\.4B\n\s+-\s+Total revenue/.test(out)).toBe(true); // KPI nesting kept
		expect((out.match(/<!-- _class:/g) || []).length).toBe(3); // three slides, order preserved
		expect(norm(out)).toBe(norm(source));
	});

	it('a directive-only / empty slide does not crash and keeps its directive', () => {
		const source = '<!-- _class: divider -->\n\n# Section\n\n---\n\n<!-- _class: content -->';
		const out = rt(source);
		expect(out).toContain('<!-- _class: divider -->');
		expect(out).toContain('<!-- _class: content -->');
	});

	it('a single-slide deck round-trips', () => {
		const source = '<!-- _class: statement -->\n\n## One thing to remember.';
		expect(norm(rt(source))).toBe(norm(source));
	});
});
