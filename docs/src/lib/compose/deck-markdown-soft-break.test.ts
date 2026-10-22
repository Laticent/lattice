// @vitest-environment node
// A bare newline inside a paragraph is a line break on the slide (the engine runs markdown-it with `breaks: true`),
// so editing the paragraph must keep it a line break (followups.d/2846-p6).
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { latticeMarkdownParser, latticeMarkdownSerializer, roundTripSlideProse } from './deck-markdown';
import { hasLossyConstruct, parseDeck } from './deck-source';

const rt = (md: string) => roundTripSlideProse(md).trimEnd();
const brs = (md: string) => (new MarkdownIt({ breaks: true }).render(md).match(/<br\s*\/?>/g) ?? []).length;
// This markdown-it has neither the engine's math rules nor its raw-HTML handling, so a `$$` block or a comment line would read
// as paragraph text here. Compose models both as blocks of their own; leave those slides to their own tests.
const MODELED_BLOCK = /^\s*(?:\$\$|<)/m;

describe('soft line breaks', () => {
	it('a paragraph keeps its newline', () => {
		expect(rt('line one\nline two\nline three')).toBe('line one\nline two\nline three');
	});
	it('a list item and a quote keep theirs, with the container prefix', () => {
		expect(rt('- first\n  second')).toBe('- first\n  second');
		expect(rt('> a\n> b')).toBe('> a\n> b');
	});
	it('a typed hard break still writes a backslash', () => {
		expect(rt('a\\\nb')).toBe('a\\\nb');
	});
	it('marks around a break survive', () => {
		expect(rt('**bold**\n*it*')).toBe('**bold**\n*it*');
	});
});

// The engine draws every break the same, so what must hold is the STRUCTURE: the paragraph stays one block with its breaks.
const blocks = (md: string) => latticeMarkdownParser.parse(md).content.childCount;
const types = (md: string) => latticeMarkdownParser.parse(md).content.toJSON()?.map((n: { type: string }) => n.type);

describe('soft breaks never change structure', () => {
	// A line that starts like a block, written as an escaped literal after a newline.
	for (const marker of ['\\- b', '\\+ b', '\\# b', '\\> b', '\\---', '\\===', '1\\. b', '1\\) b', '\\<div>x']) {
		it(`"a" then "${marker}" stays one paragraph`, () => {
			const md = `a\n${marker}`;
			const out = rt(md);
			expect(types(out), out).toEqual(['paragraph']);
			expect(rt(out)).toBe(out); // and settles
			expect(brs(out)).toBe(1);
		});
	}
	it('inside a list item and a quote', () => {
		for (const md of ['- a\n  \\- b', '> a\n> \\- b', '- [x] a\n  \\- b']) expect(types(rt(md)), rt(md)).toHaveLength(1);
		expect(types(rt('> a\n> \\- b'))).toEqual(['blockquote']);
	});
	it('deleting a middle line does not split the paragraph', () => {
		const doc = latticeMarkdownParser.parse('line one\nline two\nline three');
		const para = doc.content.child(0);
		// [text, soft, text, soft, text] minus the middle text: two soft breaks side by side.
		const joined = para.copy(para.content.cut(0, 8).append(para.content.cut(para.content.size - 10 - 1 - 0)));
		const md = latticeMarkdownSerializer.serialize(doc.copy(doc.content.replaceChild(0, joined))).trimEnd();
		expect(blocks(md), md).toBe(1);
	});
	it('a leading, trailing or doubled break keeps one block', () => {
		const sch = latticeMarkdownParser.parse('x').type.schema;
		const t = (s: string) => sch.text(s);
		const soft = () => sch.nodes.hard_break.create({ soft: true });
		const hard = () => sch.nodes.hard_break.create();
		for (const kids of [
			[t('a'), soft(), soft(), t('b')],
			[t('a'), hard(), soft(), t('b')],
			[t('a'), soft(), hard(), t('b')],
			[soft(), t('b')],
			[t('a'), soft()],
		]) {
			const doc = sch.nodes.doc.create(null, [sch.nodes.paragraph.create(null, kids)]);
			const md = latticeMarkdownSerializer.serialize(doc).trimEnd();
			expect(blocks(md), JSON.stringify(md)).toBe(1);
		}
	});
});

describe('soft breaks across the shipped decks', () => {
	const ROOT = path.resolve(__dirname, '../../../..');
	function mdIn(dir: string, out: string[] = []): string[] {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) mdIn(full, out);
			else if (e.name.endsWith('.md')) out.push(full);
		}
		return out;
	}
	const files = [
		...mdIn(path.join(ROOT, 'examples')),
		...mdIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
		...mdIn(path.join(ROOT, 'test/integration/baseline-decks')),
	];

	it('an unlocked slide renders as many <br> after a round trip as before', () => {
		let checked = 0;
		for (const file of files) {
			let slides: ReturnType<typeof parseDeck>['slides'];
			try {
				slides = parseDeck(fs.readFileSync(file, 'utf8')).slides;
			} catch {
				continue;
			}
			for (const s of slides) {
				if (hasLossyConstruct(s.prose) || MODELED_BLOCK.test(s.prose) || brs(s.prose) === 0) continue;
				checked++;
				expect(brs(roundTripSlideProse(s.prose)), path.relative(ROOT, file)).toBe(brs(s.prose));
			}
		}
		expect(checked).toBeGreaterThan(0); // anti-vacuity
	});
});
