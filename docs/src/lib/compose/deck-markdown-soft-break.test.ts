// @vitest-environment node
// A bare newline inside a paragraph is a line break on the slide (the engine runs markdown-it with `breaks: true`),
// so editing the paragraph must keep it a line break (followups.d/2846-p6).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from './deck-doc';
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

// The engine is the reader that matters. An escaped `=` or `<` reaches its HTML as `<span data-esc>` (the flowchart reads that as
// text, not an arrow), so the bytes the author escaped must come back escaped, and the slide must render the same.
const engine = createRequire(import.meta.url)('../../../../lib/engine/index.js');
const rendered = (md: string): string => {
	const html: string = engine.render(`---\ntheme: indaco\n---\n\n${md}\n`, 'indaco').html;
	return (html.match(/<div class="cell-stage">([\s\S]*?)<\/div>/)?.[1] ?? html).replace(/\s+/g, ' ').trim();
};

describe('the engine draws the edited paragraph as it drew the original', () => {
	const cases = ['a\n\\- b', 'a\n\\+ b', 'a\n\\# b', 'a\n\\> b', 'a\n\\---', 'a\n\\===', 'a\n1\\. b', 'a\n1\\) b', 'a\n\\<div>x', 'a | b\n\\|---|---|', 'a | b\n\\:--|--', '- a\n  \\- b', '> a\n> \\- b', 'line one\nline two', '**bold**\n*it*', 'x\n3 = 3', 'a\n<b>x</b> y', 'a\n2) two', 'a\n| b |'];
	for (const md of cases) {
		it(JSON.stringify(md), () => {
			expect(rt(md)).toBe(md); // the author's escape comes back byte for byte
			expect(rendered(rt(md))).toBe(rendered(md));
		});
	}
	// An escape that guards no block is not kept: Compose reads `\\=` and `=` as the same text, as it always has mid-line.
	it('an escape that guards nothing writes bare, and draws the same text', () => {
		expect(rt('a\n\\= b')).toBe('a\n= b');
		expect(rt('a\n\\| b |')).toBe('a\n| b |');
		expect(rt('a\n\\:--')).toBe('a\n:--'); // one column with no pipe in the line above: never a table
		const plain = (md: string) => rendered(md).replace(/<span data-esc>([^<]*)<\/span>/g, '$1');
		expect(plain(rt('a\n\\= b'))).toBe(plain('a\n\\= b'));
	});
	it('a line a writer built (no escape in the source) still renders as one paragraph', () => {
		const sch = latticeMarkdownParser.parse('x').type.schema;
		for (const line of ['===', '<div>x', '<!-- c -->', '|---|', ':--|--', '1) one', '- b', '# b', '> b', ' - b', '   ---', '  > b', '=== b', '<b>x</b>', '| x | y |', '2) two']) {
			const doc = sch.nodes.doc.create(null, [sch.nodes.paragraph.create(null, [sch.text('a'), sch.nodes.hard_break.create({ soft: true }), sch.text(line)])]);
			const md = latticeMarkdownSerializer.serialize(doc).trimEnd();
			expect(rendered(md), md).toMatch(/^<p>a<br \/> [\s\S]*<\/p>$/);
			// A continuation line's indent is not part of the paragraph's text (markdown-it strips it), so it does not read back.
			const want = sch.nodes.doc.create(null, [sch.nodes.paragraph.create(null, [sch.text('a'), sch.nodes.hard_break.create({ soft: true }), sch.text(line.trimStart())])]);
			expect(latticeMarkdownParser.parse(md).eq(want), md).toBe(true);
		}
	});
});

describe('what the second checker found', () => {
	it('code after a break leaves the rest of the deck alone', () => {
		for (const md of ['a\n`x`\n\n| b | c', 'a\n`x`\n\n## 1) z', 'a\n`x` = y', 'a\n`x`\n\n<b>hi</b> there']) expect(rt(md)).toBe(md);
	});
	it('inline HTML that an edit moves to a line start stays live', () => {
		const sch = latticeMarkdownParser.parse('x').type.schema;
		for (const br of [sch.nodes.hard_break.create({ soft: true }), sch.nodes.hard_break.create()]) {
			const doc = sch.nodes.doc.create(null, [sch.nodes.paragraph.create(null, [sch.text('x'), br, sch.text('<b>y</b> z')])]);
			expect(latticeMarkdownSerializer.serialize(doc)).toContain('\n<b>y</b> z');
		}
	});
	it('an indented marker after a deleted word does not open a block', () => {
		const sch = latticeMarkdownParser.parse('x').type.schema;
		for (const line of [' - flat costs', ' ---', ' > see appendix', ' + b', '   # b']) {
			const doc = sch.nodes.doc.create(null, [sch.nodes.paragraph.create(null, [sch.text('Revenue up'), sch.nodes.hard_break.create({ soft: true }), sch.text(line)])]);
			const md = latticeMarkdownSerializer.serialize(doc).trimEnd();
			expect(types(md), md).toEqual(['paragraph']);
		}
	});
});

describe('what the third checker found: the guard reads the line as written', () => {
	const sch = latticeMarkdownParser.parse('x').type.schema;
	const t = (x: string, ...marks: string[]) => sch.text(x, marks.map((m) => sch.marks[m].create()));
	const soft = () => sch.nodes.hard_break.create({ soft: true });
	const hard = () => sch.nodes.hard_break.create();
	const write = (kids: import('prosemirror-model').Node[]) =>
		latticeMarkdownSerializer.serialize(sch.nodes.doc.create(null, [sch.nodes.paragraph.create(null, kids)])).trimEnd();
	const onePara = (md: string) => {
		expect(types(md), md).toEqual(['paragraph']);
		expect(rendered(md), md).toMatch(/^<p[^>]*>(?:(?!<\/p>)[\s\S])*<\/p>$/);
	};

	it('an unedited paragraph with a mark after a break comes back byte for byte', () => {
		for (const md of ['a\n**<div>x**', 'a\n*<div>* y', 'a\n[<div>x](u)', 'a\n**<p>** z', '- a\n  **<div>x**', '> a\n> *<div>* b',
			'a\n*=*', 'a\n**=**', 'a\n*- b*', 'a\n*# b*', 'a\n**1. b**', 'a\n**1) b**', 'a\n01\\) b', '- a\n  01\\) b', '> a\n> 01\\) b']) {
			expect(rt(md)).toBe(md);
			expect(rendered(rt(md))).toBe(rendered(md));
		}
	});
	it('a leading-zero marker an edit writes does not open a list', () => {
		onePara(write([t('Revenue up'), soft(), t('01) margins flat')]));
		onePara(write([t('a'), hard(), t('001) b')]));
	});
	it('a marker split from its content by a node boundary does not open a list', () => {
		const image = sch.nodes.image.create({ src: 'x.png', alt: 'i' });
		const math = sch.nodes.inline_math.create({ tex: 'x' });
		for (const kids of [
			[t('a'), soft(), t('1.'), t(' b', 'strong')],
			[t('a'), soft(), t('+'), t(' b', 'strong')],
			[t('a'), soft(), t('1)'), t(' b', 'em')],
			[t('a'), soft(), t('1) '), t('x', 'code')],
			[t('a'), soft(), t('1) '), image],
			[t('a'), soft(), t('1) '), math],
			[t('Revenue up'), soft(), t('1.'), t(' margins', 'strong')],
		])
			onePara(write(kids));
	});
	it('a blank line between two breaks does not split the paragraph, and keeps both breaks', () => {
		for (const blank of [t(' '), t('\t'), t(' ', 'em')]) {
			const md = write([t('line one'), soft(), blank, soft(), t('line three')]);
			onePara(md);
			expect((rendered(md).match(/<br/g) ?? []).length, md).toBe(2);
		}
	});
	it('an underline or delimiter row that whitespace leaves bare does not change the block', () => {
		onePara(write([t('a'), soft(), t('==='), t(' ', 'em')]));
		onePara(write([t('a | b'), soft(), t('|---|---|'), t(' ', 'em')]));
	});
	it('inline HTML an edit leaves at a line start stays live', () => {
		expect(write([t('x'), soft(), t('<b>y</b> z')])).toBe('x\n<b>y</b> z');
		expect(write([t('x'), hard(), t('<b>y</b> z')])).toBe('x\\\n<b>y</b> z');
	});
});

describe('what the fourth checker found', () => {
	const sch = latticeMarkdownParser.parse('x').type.schema;
	const t = (x: string) => sch.text(x);
	const soft = () => sch.nodes.hard_break.create({ soft: true });
	const hard = () => sch.nodes.hard_break.create();
	const para = (kids: import('prosemirror-model').Node[]) => sch.nodes.paragraph.create(null, kids);
	const write = (...blocks: import('prosemirror-model').Node[]) => latticeMarkdownSerializer.serialize(sch.nodes.doc.create(null, blocks)).trimEnd();
	const brCount = (md: string) => (rendered(md).match(/<br/g) ?? []).length;

	it('a comment under a list item stays editable and comes back hidden, as it was written', () => {
		for (const prose of ['- Revenue up\n  <!-- say: 12% -->\n- Costs', '1. step\n   <!-- speaker note -->', '> a\n> <!-- x -->']) {
			expect(hasLossyConstruct(prose)).toBe(false);
		}
		expect(rt('- Revenue up\n  <!-- say: 12% -->\n- Costs')).toBe('- Revenue up\n  <!-- say: 12% -->\n- Costs');
		// The comment atom writes itself as a block of its own: the same bytes as main, and the same quote.
		expect(rt('> a\n> <!-- x -->\n> b')).toBe('> a\n>\n> <!-- x -->\n>\n> b');
	});
	it('a tab-led line inside a list item or a quote stays in the paragraph', () => {
		const p = () => para([t('Revenue up'), soft(), t('\t- margins flat')]);
		const inList = write(sch.nodes.bullet_list.create(null, [sch.nodes.list_item.create(null, [p()])]));
		expect(rendered(inList), inList).not.toMatch(/<ul>[\s\S]*<ul>/);
		expect(brCount(inList), inList).toBe(1);
		for (const line of ['\t# margins flat', ' \t> q']) {
			const inQuote = write(sch.nodes.blockquote.create(null, [para([t('Revenue up'), soft(), t(line)])]));
			// A slide that is only a quote takes the quote layout, outside the `cell-stage` slice `rendered` reads; read the whole page.
			const html: string = engine.render(`---\ntheme: indaco\n---\n\n${inQuote}\n`, 'indaco').html;
			expect(html, inQuote).not.toMatch(/<h1/);
			expect((html.match(/<blockquote/g) ?? []).length, inQuote).toBe(1);
			expect((html.match(/<br/g) ?? []).length, inQuote).toBe(1);
		}
	});
	it('a first line that would open a list is escaped, and no later break is lost', () => {
		const md = write(para([t('1) a'), hard(), t('x'), hard(), t('#y')]));
		expect(types(md), md).toEqual(['paragraph']);
		expect(brCount(md), md).toBe(2);
		expect(types(rt('1\\) b'))).toEqual(['paragraph']); // was a list on main
	});
	it('a first line of only whitespace keeps the break after it', () => {
		expect(brCount(write(para([t(' '), soft(), t('margins flat')])))).toBe(1);
	});
	it('an empty paragraph writes what it wrote on main', () => {
		expect(write(para([t('a')]), para([]), para([t('b')]))).toBe('a\n\nb');
		expect(write(sch.nodes.blockquote.create(null, [para([t('a')]), para([]), para([t('b')])]))).toBe('> a\n>\n> b');
	});
	it('a long paragraph serializes in linear time', () => {
		const kids: import('prosemirror-model').Node[] = [t('start')];
		for (let i = 0; i < 2000; i++) kids.push(soft(), t(i % 2 ? `- item ${i}` : `line ${i}`));
		const t0 = performance.now();
		const md = write(para(kids));
		expect(performance.now() - t0).toBeLessThan(400); // the whole-paragraph probe took ~800 ms here
		expect(types(md)).toEqual(['paragraph']);
	});
});

describe('what the fifth checker found: HTML Compose does not model is written as it came', () => {
	// Through the Studio's own path: a deck, its slides, and the slide node as the paragraph's top level.
	const deck = (prose: string) => `---\nmarp: true\n---\n\n${prose}\n`;
	const studio = (prose: string) => docToDeck(deckToDoc(deck(prose))).trim();

	it('a list item that opens with HTML, a comment or `$$` comes back byte for byte', () => {
		for (const prose of ['- <!-- c -->', '- <img src="a.png">', '- <div>x</div>', '1. <p>hi</p>', '- a\n- <!-- c -->\n- b', '> - <!-- c -->',
			'1. <!-- note: speaker -->', '- $$x$$', '- <!-- c -->\n  b', '> - a\n>   <!-- c -->', '- Revenue up\n  <!-- say: 12% -->\n- Costs']) {
			expect(studio(prose)).toBe(deck(prose).trim());
			expect(rendered(rt(prose)), prose).toBe(rendered(prose));
		}
	});
	it('an edit to another bullet leaves an HTML bullet live', () => {
		const doc = deckToDoc(deck('- <img src="logo.png" alt="logo">\n- Revenue up'));
		let at = -1;
		doc.descendants((n, pos) => {
			if (n.isText && n.text === 'Revenue up') at = pos + n.nodeSize;
		});
		const edited = EditorState.create({ doc }).apply(EditorState.create({ doc }).tr.insertText(' 4%', at)).doc;
		expect(docToDeck(edited)).toContain('- <img src="logo.png" alt="logo">\n- Revenue up 4%');
	});
	it('at the top level, where Compose models HTML, an escaped literal stays escaped', () => {
		for (const prose of ['a\n\\<div>x', 'a\n\\<!-- not a comment -->']) expect(studio(prose)).toBe(deck(prose).trim());
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

	it('every unlocked slide parses back to the same document', () => {
		let checked = 0;
		for (const file of files) {
			let slides: ReturnType<typeof parseDeck>['slides'];
			try {
				slides = parseDeck(fs.readFileSync(file, 'utf8')).slides;
			} catch {
				continue;
			}
			for (const s of slides) {
				if (hasLossyConstruct(s.prose)) continue;
				checked++;
				const doc = latticeMarkdownParser.parse(s.prose);
				expect(latticeMarkdownParser.parse(latticeMarkdownSerializer.serialize(doc)).eq(doc), path.relative(ROOT, file)).toBe(true);
			}
		}
		expect(checked).toBeGreaterThan(500); // anti-vacuity
	});
});

// A heading that holds a line break (PR #2861). The heading used to refuse a break, so the parser dropped the whole heading on any edit
// of its slide; and the upstream heading rule loses a trailing `\#`.
describe('a heading that holds a line break', () => {
	const engine = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
	it('a two-line setext heading keeps both lines, its level and its break, at the top level and inside a quote or list', () => {
		for (const src of ['a\nb\n===', 'a\nb\n---', 'Title\\\nline two\n---', '**a\nb**\n===', '> a\n> b\n> ===', '- a\n  b\n  ---', 'start\na|b\n---']) {
			expect(rt(src)).toBe(src);
		}
		expect(rt('intro\n\na  \nb\n===\n\nafter')).toBe('intro\n\na\\\nb\n===\n\nafter');
	});
	it('falls back to one ATX line, with the break as a space, when the setext form would not read back as the same heading', () => {
		const src = 'a\nb\n===';
		const doc = latticeMarkdownParser.parse(src);
		const h3 = doc.copy(doc.content.replaceChild(0, doc.child(0).type.schema.nodes.heading.create({ level: 3 }, doc.child(0).content)));
		expect(latticeMarkdownSerializer.serialize(h3).trimEnd()).toBe('### a b');
		// A level-2 heading whose last line is `|b` would read as a one-column table over the `---`.
		const schema = doc.type.schema;
		const h2 = schema.node('doc', null, [schema.nodes.heading.create({ level: 2 }, [schema.text('start'), schema.nodes.hard_break.create({ soft: true }), schema.text('|b')])]);
		expect(latticeMarkdownSerializer.serialize(h2).trimEnd()).toBe('## start |b');
	});
	it('an empty heading keeps its marker, and a trailing escaped # keeps its escape', () => {
		expect(rt('para\n\n## ')).toBe('para\n\n##');
		expect(rt('## a \\#')).toBe('## a \\#');
	});
	it('draws the same before and after, and a second round trip changes nothing', () => {
		for (const src of ['a\nb\n===', 'Title\\\nline two\n---', 'start\na|b\n---', '- a\n  b\n  ---']) {
			const once = roundTripSlideProse(src);
			expect(engine.render(once)).toBe(engine.render(src));
			expect(roundTripSlideProse(once)).toBe(once);
		}
	});
});
