// @vitest-environment jsdom
// A soft line break inside a paragraph survives an edit: the engine draws each one as `<br>`.
import fs from 'node:fs';
import path from 'node:path';
import { DOMSerializer, DOMParser as PMDOMParser } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { parseSlideProse, proseSchema, roundTripSlideProse, serializeSlideProse } from './deck-markdown';
import { parseDeck } from './deck-source';
import { createTokenizer } from './raw-block';

const rt = (md: string) => roundTripSlideProse(md).trimEnd();

describe('soft line breaks', () => {
	it('a paragraph keeps its lines', () => {
		expect(rt('one\ntwo\nthree')).toBe('one\ntwo\nthree');
	});
	it('inside a list item and a quote', () => {
		expect(rt('- one\n  two\n- three')).toBe('- one\n  two\n- three');
		expect(rt('> one\n> two')).toBe('> one\n> two');
	});
	it('a hard break still writes a backslash', () => {
		expect(rt('one\\\ntwo')).toBe('one\\\ntwo');
	});
	it('marks that span the break are kept', () => {
		expect(rt('**one\ntwo**')).toBe('**one\ntwo**');
	});
});

// Corpus: the engine's `<br>` count for a slide is the same before and after the round trip.
describe('soft breaks across the shipped decks', () => {
	const ROOT = path.resolve(__dirname, '../../../..');
	const md = createTokenizer();
	// The tokenizer's softbreak tokens are the engine's `<br>`s (`breaks: true`), with the engine's math and HTML rules.
	const brs = (s: string) => md.parse(s, {}).reduce((n, t) => n + (t.children?.filter((c) => c.type === 'softbreak' || c.type === 'hardbreak').length ?? 0), 0);
	function mdIn(dir: string, out: string[] = []): string[] {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) mdIn(full, out);
			else if (e.name.endsWith('.md')) out.push(full);
		}
		return out;
	}
	it('keeps every <br>', () => {
		const files = [
			...mdIn(path.join(ROOT, 'examples')),
			...mdIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
			...mdIn(path.join(ROOT, 'test/integration/baseline-decks')),
		];
		let checked = 0;
		const bad: string[] = [];
		for (const file of files) {
			let slides: ReturnType<typeof parseDeck>['slides'];
			try {
				slides = parseDeck(fs.readFileSync(file, 'utf8')).slides;
			} catch {
				continue;
			}
			for (const s of slides) {
				const src = (s as { prose?: string; body?: string }).prose ?? (s as { body?: string }).body;
				if (typeof src !== 'string' || !/[^\n]\n[^\n]/.test(src)) continue;
				let out: string;
				try {
					out = roundTripSlideProse(src);
				} catch {
					continue;
				}
				checked++;
				if (brs(out) !== brs(src)) bad.push(`${path.relative(ROOT, file)}: ${brs(src)} -> ${brs(out)}`);
			}
		}
		expect(checked).toBeGreaterThan(50);
		expect(bad).toEqual([]);
	});
});

// Found by the independent checker: each of these was a defect in the first version of the node.
describe('soft break edge cases', () => {
	it('a two-line setext heading keeps its break, and its level', () => {
		expect(rt('Quarterly results\nand outlook\n===')).toBe('Quarterly results\nand outlook\n===');
		expect(rt('Quarterly results\nand outlook\n---')).toBe('Quarterly results\nand outlook\n---');
	});
	it('a heading that holds a break inside a quote keeps its prefix on every line', () => {
		expect(rt('> one\n> two\n> ===')).toBe('> one\n> two\n> ===');
	});
	it('an ATX heading is unchanged, and a trailing # keeps its escape', () => {
		expect(rt('## Plain title')).toBe('## Plain title');
		expect(rt('## C \\#')).toBe('## C \\#');
		expect(rt('a \\#\n===')).toBe('# a \\#');
	});
	it('block syntax typed at the start of a later line stays literal', () => {
		for (const line of ['- b', '# b', '> b', '+ b', '2. b', '===', '---']) {
			const out = rt(`a\n${line.replace(/^([-#>+]|2\.|=|---)/, '\\$1')}`);
			expect(out, line).toMatch(/^a\n\\/);
		}
	});
	it('the markers the upstream escaper misses stay literal after a break', () => {
		for (const md of ['a\n1\\) b', 'a\n\\- b', 'a\n\\> b', 'a\n\\# b']) expect(rt(md), md).toBe(md);
	});
	it('text typed with leading spaces before a marker is escaped too', () => {
		for (const typed of ['  - b', '  > b', '  # b', '  1) b']) {
			const doc = proseSchema.node('doc', null, [proseSchema.node('paragraph', null, [proseSchema.text('a'), proseSchema.node('soft_break'), proseSchema.text(typed)])]);
			const out = serializeSlideProse(doc).trimEnd();
			// Read back, it is still one paragraph of two lines, not a list, a quote or a heading.
			const back = parseSlideProse(out);
			expect([back.childCount, back.child(0).type.name], typed).toEqual([1, 'paragraph']);
			expect(out, typed).toMatch(/^a\n\s*\d?\\/);
		}
	});
	it('a paragraph that starts with a marker keeps its escape, with or without spaces', () => {
		for (const md of ['1\\) b', '\\- b', '\\# b', '\\> b']) expect(rt(md), md).toBe(md);
	});
	it('plain text and textContent keep the line break', () => {
		const doc = parseSlideProse('Revenue grew\nfaster than costs');
		expect(doc.textBetween(0, doc.content.size, '\n\n')).toBe('Revenue grew\nfaster than costs');
	});
	it('a copied paragraph pastes back as soft breaks', () => {
		const doc = parseSlideProse('one\ntwo');
		const html = DOMSerializer.fromSchema(proseSchema).serializeFragment(doc.content);
		const host = document.createElement('div');
		host.append(html);
		const back = PMDOMParser.fromSchema(proseSchema).parse(host);
		expect(serializeSlideProse(back).trimEnd()).toBe('one\ntwo');
	});
	it('two breaks in a row write one line break', () => {
		const doc = proseSchema.node('doc', null, [proseSchema.node('paragraph', null, [proseSchema.text('a'), proseSchema.node('soft_break'), proseSchema.node('soft_break'), proseSchema.text('c')])]);
		expect(serializeSlideProse(doc).trimEnd()).toBe('a\nc');
	});
	it('a setext heading with a blank or code-indented line falls back to one ATX line', () => {
		const heading = (level: number, parts: (string | null)[]) =>
			proseSchema.node('doc', null, [proseSchema.node('heading', { level }, parts.map((p) => (p === null ? proseSchema.node('soft_break') : proseSchema.text(p))))]);
		for (const doc of [heading(1, ['a', null, '   ', null, 'b']), heading(2, ['    a', null, 'b'])]) {
			const out = serializeSlideProse(doc).trimEnd();
			const back = parseSlideProse(out);
			expect([back.childCount, back.child(0).type.name], out).toEqual([1, 'heading']);
		}
	});
	it('a heading that ends in # keeps its escape even with trailing spaces', () => {
		const doc = proseSchema.node('doc', null, [proseSchema.node('heading', { level: 1 }, [proseSchema.text('a # ')])]);
		const back = parseSlideProse(serializeSlideProse(doc));
		expect(back.child(0).textContent).toBe('a #');
	});
	it('text after a hard break is escaped like text after a soft break', () => {
		for (const md of ['Hard\\\n\\- b', 'a\\\n1\\) b']) {
			const back = parseSlideProse(rt(md));
			expect([back.childCount, back.child(0).type.name], md).toEqual([1, 'paragraph']);
		}
	});
	it('two breaks in a row inside a setext heading still write a setext heading with one break', () => {
		const doc = proseSchema.node('doc', null, [
			proseSchema.node('heading', { level: 2 }, [proseSchema.text('Alpha'), proseSchema.node('soft_break'), proseSchema.node('soft_break'), proseSchema.text('Charlie')]),
		]);
		expect(serializeSlideProse(doc).trimEnd()).toBe('Alpha\nCharlie\n---');
	});
	it('a later line indented four spaces is a continuation, so the setext form stays', () => {
		const doc = proseSchema.node('doc', null, [proseSchema.node('heading', { level: 2 }, [proseSchema.text('a'), proseSchema.node('soft_break'), proseSchema.text('    b')])]);
		const back = parseSlideProse(serializeSlideProse(doc));
		expect([back.childCount, back.child(0).type.name]).toEqual([1, 'heading']);
		expect(back.child(0).childCount).toBe(3);
	});
});
