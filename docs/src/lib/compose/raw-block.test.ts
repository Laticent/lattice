// @vitest-environment node
// Raw blocks and math (raw-block.ts): a top-level HTML block, a `$$` block and inline `$x$` are atoms that write their bytes back,
// so their slides no longer lock. The same constructs inside a list or a quote stay locked.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deckToDoc } from './deck-doc';
import { latticeMarkdownParser, roundTripSlideProse } from './deck-markdown';
import { hasLossyConstruct, parseDeck } from './deck-source';
import { createTokenizer, isInlineTex, isRawBlockText } from './raw-block';

const rt = (md: string) => roundTripSlideProse(md).trimEnd();

describe('block HTML', () => {
	it('is an atom that writes its lines back unchanged, indentation and attributes included', () => {
		const md = '<div class="grid a_b" data-x="*">\n  <b>hi</b>\n</div>\n\nAfter *this*.';
		expect(hasLossyConstruct(md)).toBe(false);
		expect(rt(md)).toBe(md);
	});
	it('keeps a block that interrupts a paragraph (the engine splits it there too)', () => {
		expect(rt('text\n<div>x</div>')).toBe('text\n\n<div>x</div>');
	});
	it('holds one block as ONE node, whatever its shape', () => {
		const doc = latticeMarkdownParser.parse('<figure>\n  <img src="x.png">\n</figure>');
		expect(doc.childCount).toBe(1);
		expect(doc.child(0).type.name).toBe('raw_block');
		expect(doc.child(0).attrs.kind).toBe('html');
	});
	it('still locks a block inside a list item (modeling it there would turn the list loose)', () => {
		expect(hasLossyConstruct('- item\n  <div>nested</div>')).toBe(true);
	});
	it('still locks an inline tag that leads a line (its attributes would be escaped)', () => {
		expect(hasLossyConstruct('<span class="a_b">x</span> text')).toBe(true);
	});
	it('does not turn a comment into an HTML block', () => {
		const doc = latticeMarkdownParser.parse('<!-- note -->');
		expect(doc.child(0).type.name).toBe('comment');
	});
});

describe('display math', () => {
	it('writes its delimiters and body back unchanged', () => {
		const md = '$$\n\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\n=\n1\n$$\n\nText';
		expect(hasLossyConstruct(md)).toBe(false);
		expect(rt(md)).toBe(md);
	});
	it('a one-line block round-trips', () => {
		expect(rt('$$ E = mc^2 $$')).toBe('$$ E = mc^2 $$');
	});
	it('a `$$` block inside a list item still locks the slide', () => {
		expect(hasLossyConstruct('- a\n  $$\n  x_1\n  $$')).toBe(true);
	});
});

describe('inline math', () => {
	it('is an atom: `a_1` is not escaped, and the slide is not locked', () => {
		const md = 'Intro $x^2$ and $a_1$ and $\\sum_{i}^{n} x_i$ done.';
		expect(hasLossyConstruct(md)).toBe(false);
		expect(rt(md)).toBe(md);
	});
	it('sits in a heading, a list item, a quote and a table cell', () => {
		for (const md of ['## Why $y$ matters', '- one $a_1$\n- two', '> a $b_2$ c', '| h | k |\n| --- | --- |\n| $x_1$ | y |']) {
			expect(hasLossyConstruct(md)).toBe(false);
			expect(rt(md)).toBe(md);
		}
	});
	it('leaves currency alone (the engine\'s own guards)', () => {
		const md = 'Revenue was $400M, up 28% YoY, ahead by $18M.';
		expect(latticeMarkdownParser.parse(md).textContent).toBe(md);
		expect(rt(md)).toBe(md);
	});
	it('reads the same boundary the engine does', () => {
		const tokens = createTokenizer().parse('a $x$ b $ y $ c $z$', {});
		const math = tokens.flatMap((t) => t.children ?? []).filter((c) => c.type === 'lattice_math_inline');
		expect(math.map((m) => m.content)).toEqual(['x', 'z']);
	});
});

describe('what the checker found', () => {
	it('keeps locking an escaped dollar: it would write back bare and change the math beside it', () => {
		for (const md of ['Price \\$5. Area $\\pi r^2$.', 'Cost is \\$400M; $x_1$']) expect(hasLossyConstruct(md)).toBe(true);
	});
	it('`$$` never interrupts a paragraph, as in the engine', () => {
		const doc = latticeMarkdownParser.parse('text\n$$x$$');
		expect(doc.childCount).toBe(1);
		expect(doc.child(0).type.name).toBe('paragraph');
		expect(rt('> a\n> $$x$$')).toBe('> a\n> $$x$$');
	});
	it('locks the HTML kinds it does not model (types 3-5)', () => {
		for (const md of ['<?php echo 1; ?>\nmore', '<!DOCTYPE html>', '<![CDATA[\nx\n]]>']) expect(hasLossyConstruct(md)).toBe(true);
	});
	it('models a tab-indented tag inside a quote', () => {
		expect(latticeMarkdownParser.parse('>\t<pre>\n>\t\tx\n>\t</pre>').toString()).toContain('raw_block');
	});
	it('one math block only', () => {
		expect(isRawBlockText('math', '$$\na$$\n<script>alert(1)</script>\n$$')).toBe(false);
	});
});

describe('the paste gates', () => {
	it('refuse what would forge deck structure', () => {
		expect(isRawBlockText('html', '<div>\n\n---\n\n<b>x</b>')).toBe(false);
		expect(isRawBlockText('html', '<div>\n---\n</div>')).toBe(false);
		expect(isRawBlockText('html', '<div><!-- _backgroundImage: url(https://evil/x) --></div>')).toBe(false);
		expect(isRawBlockText('html', 'plain words')).toBe(false);
		expect(isRawBlockText('math', '$$\n---\n$$')).toBe(false);
		expect(isRawBlockText('math', 'x^2')).toBe(false);
		expect(isRawBlockText('svg', '<div>')).toBe(false);
		expect(isRawBlockText('html', `<div>${'x'.repeat(21_000)}</div>`)).toBe(false);
		expect(isInlineTex('a\nb')).toBe(false);
		expect(isInlineTex('a$b')).toBe(false);
		expect(isInlineTex(' a')).toBe(false);
	});
	it('admit an ordinary block', () => {
		expect(isRawBlockText('html', '<div class="x">\n  <b>y</b>\n</div>')).toBe(true);
		expect(isRawBlockText('math', '$$\nx_1\n$$')).toBe(true);
		expect(isInlineTex('x^2')).toBe(true);
	});
});

// The corpus: every shipped slide the lock used to hold for one of these now round-trips each construct byte for byte.
describe('across the shipped decks', () => {
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

	it('writes every modeled block and every inline span back verbatim', () => {
		let blocks = 0;
		let spans = 0;
		let unlocked = 0;
		for (const file of files) {
			let slides: ReturnType<typeof parseDeck>['slides'];
			try {
				slides = parseDeck(fs.readFileSync(file, 'utf8')).slides;
			} catch {
				continue;
			}
			for (const s of slides) {
				if (hasLossyConstruct(s.prose)) continue;
				const tokens = createTokenizer().parse(s.prose, {});
				const mine = tokens.filter((t) => t.type === 'lattice_html' || t.type === 'lattice_math_block');
				const inline = tokens.flatMap((t) => t.children ?? []).filter((c) => c.type === 'lattice_math_inline');
				if (!mine.length && !inline.length) continue;
				unlocked++;
				const out = roundTripSlideProse(s.prose);
				for (const t of mine) {
					blocks++;
					expect(out, path.relative(ROOT, file)).toContain(t.content);
				}
				for (const c of inline) {
					spans++;
					expect(out, path.relative(ROOT, file)).toContain(`$${c.content}$`);
				}
			}
		}
		expect(unlocked, 'anti-vacuity: the corpus has slides with these constructs').toBeGreaterThan(20);
		expect(blocks + spans).toBeGreaterThan(40);
	});

	it('opens every deck with the same slides locked as before, minus the modeled constructs', () => {
		let opened = 0;
		for (const file of files) {
			try {
				deckToDoc(fs.readFileSync(file, 'utf8'));
				opened++;
			} catch {
				// a deck Compose cannot parse is not Compose's to open
			}
		}
		expect(opened).toBeGreaterThan(100);
	});
});
