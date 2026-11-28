import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { type DeckModel, deckModelStats, F_EMPTY, I_FLAGS, I_FROM, I_KIND, I_TO, IKIND, ISTRIDE, inlineSlide, leafToBody } from '@laticent/segno-languages/markdown';
import type { SyntaxNode, Tree } from '@lezer/common';
import { Tree as LezerTree } from '@lezer/common';
import { describe, expect, it } from 'vitest';
import { deckModel, updateDeckModel } from '../../../../lib/core/deck-model.mjs';
import { InlineParser } from '../segno-markdown/inline';
import { deckInlineOptions } from './deck-inline.mjs';
import { deckMarkdown, deckNodeSet, deckTree, deckTreeStats, modelOf } from './deck-language';

// THE TREE IS THE MODEL'S (engineering/decisions/2026-10-22-segno-deck-pipeline.md §P4b landed). Held on every committed
// deck and fixture (the corpus the token adapter is held on, test/unit/core/model-tokens.test.js): the tree is well
// formed; every block range the model records is a node of the matching name starting on its first line; every inline
// structure the model's leaves hold (emphasis, strong, strikethrough, code spans, links, images, inline HTML) is a node
// with exactly its range; an incremental tree equals the tree built from nothing; and a keystroke rebuilds one slide.

const ROOT = path.resolve(process.cwd(), '..');
const DECKS = execSync("git ls-files 'examples/*.md' 'examples/**/*.md' '*.gallery.md' 'test/integration/baseline-decks/*.md' 'lib/**/*.fixtures.md' 'exemplars/*.md' 'test/fixtures/*.md'", { cwd: ROOT, encoding: 'utf8' })
	.split('\n')
	.filter(Boolean);
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n?/g, '\n');
const build = (src: string) => deckModel(src) as DeckModel;

/** Every named node as `name from to`, in document order (anonymous slide wrappers are not nodes a reader sees). */
function dump(tree: Tree): string[] {
	const out: string[] = [];
	tree.iterate({
		enter: (n) => {
			if (n.type.name) out.push(`${n.type.name} ${n.from} ${n.to}`);
		},
	});
	return out;
}

/** Children inside their parent, siblings in order and apart. The first fault, or null. */
function malformed(tree: Tree): string | null {
	let bad: string | null = null;
	const walk = (node: SyntaxNode) => {
		let prevEnd = node.from;
		for (let c = node.firstChild; c && !bad; c = c.nextSibling) {
			if (c.from < prevEnd || c.to > node.to || c.from > c.to) bad = `${c.name} ${c.from}-${c.to} in ${node.name} ${node.from}-${node.to} after ${prevEnd}`;
			prevEnd = c.to;
			walk(c);
		}
	};
	walk(tree.topNode);
	return bad;
}

const BLOCK_NAME: Record<string, RegExp> = {
	paragraph: /^Paragraph$/,
	heading: /^(?:ATX|Setext)Heading[1-6]$/,
	fence: /^FencedCode$/,
	code_block: /^CodeBlock$/,
	html_block: /^(?:HTMLBlock|CommentBlock|ProcessingInstructionBlock)$/,
	bullet_list: /^BulletList$/,
	ordered_list: /^OrderedList$/,
	blockquote: /^Blockquote$/,
	table: /^Table$/,
};

const INLINE_NAME: Record<number, string> = {
	[IKIND.em_open]: 'Emphasis',
	[IKIND.strong_open]: 'StrongEmphasis',
	[IKIND.s_open]: 'Strikethrough',
	[IKIND.code_inline]: 'InlineCode',
	[IKIND.image]: 'Image',
};

/** What the tree is missing that the model holds: a list of `what at where`, empty when they agree. */
function againstModel(m: DeckModel, tree: Tree): string[] {
	const named = new Set(dump(tree));
	const starts = new Map<string, number[]>();
	for (const line of named) {
		const [name, from] = line.split(' ');
		starts.set(name, [...(starts.get(name) ?? []), +from]);
	}
	const misses: string[] = [];
	const base = m.source.length - m.text.length + m.bodyStart;
	const lineOf = (body: number) => {
		let lo = 0;
		let hi = m.lines;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (m.lineStart(mid) <= body) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};
	// Blocks: a node of the right name whose start is on the range's first line.
	const ranges = [...m.leaves, ...m.fences, ...m.html, ...m.plugins, ...m.containers];
	for (const r of ranges) {
		const type = r.type.replace(/_open$/, '');
		const re = BLOCK_NAME[type] ?? (m.plugins.includes(r) ? /^LatticeBlock$/ : null);
		if (!re) continue;
		const ok = [...starts].some(([name, at]) => re.test(name) && at.some((p) => p >= base && lineOf(p - base) === r.fromLine));
		if (!ok) misses.push(`${r.type} on line ${r.fromLine}`);
	}
	// Inline structure, exactly.
	const p = new InlineParser(deckInlineOptions());
	for (let seg = 0; seg < m.segs.length; seg++) {
		for (const { tape, leaf } of inlineSlide(m, seg, p)) {
			const opens: number[] = [];
			for (let i = 0; i < tape.length; i++) {
				const k = i * ISTRIDE;
				const kind = tape.tape[k + I_KIND];
				if (tape.tape[k + I_FLAGS] & F_EMPTY) continue;
				const from = base + leafToBody(leaf, tape.tape[k + I_FROM]);
				const to = base + leafToBody(leaf, tape.tape[k + I_TO]);
				if (kind === IKIND.em_open || kind === IKIND.strong_open || kind === IKIND.s_open || kind === IKIND.link_open) opens.push(i);
				else if (kind === IKIND.em_close || kind === IKIND.strong_close || kind === IKIND.s_close || kind === IKIND.link_close) {
					const o = (opens.pop() as number) * ISTRIDE;
					const open = tape.tape[o + I_KIND];
					const at = base + leafToBody(leaf, tape.tape[o + I_FROM]);
					const name = open === IKIND.link_open ? null : INLINE_NAME[open];
					const hit = name ? named.has(`${name} ${at} ${to}`) : named.has(`Link ${at} ${to}`) || named.has(`Autolink ${at} ${to}`);
					if (!hit) misses.push(`${tape.kinds[open]} ${at}-${to}`);
				} else if (INLINE_NAME[kind] && !named.has(`${INLINE_NAME[kind]} ${from} ${to}`)) misses.push(`${tape.kinds[kind]} ${from}-${to}`);
				else if (kind === IKIND.html_inline && !['HTMLTag', 'Comment', 'ProcessingInstruction'].some((n) => named.has(`${n} ${from} ${to}`))) misses.push(`html_inline ${from}-${to}`);
			}
		}
	}
	return misses;
}

describe('the deck tree, held to the model on the corpus', () => {
	it('every committed deck: well formed, every block and inline structure the model holds is a node', () => {
		expect(DECKS.length).toBeGreaterThan(400);
		const bad: string[] = [];
		let nodes = 0;
		for (const f of DECKS) {
			const src = read(f);
			const m = build(src);
			const tree = deckTree(m, src.length);
			const fault = malformed(tree);
			if (fault) bad.push(`${f}: ${fault}`);
			const misses = againstModel(m, tree);
			if (misses.length) bad.push(`${f}: ${misses.slice(0, 3).join('; ')} (${misses.length})`);
			nodes += dump(tree).length;
		}
		expect(bad).toEqual([]);
		expect(nodes).toBeGreaterThan(100_000);
	});

	it('the failing arm: a tree missing one node the model holds is caught', () => {
		const src = '# Title\n\nSome *em* and `code`.\n';
		const m = build(src);
		expect(againstModel(m, deckTree(m))).toEqual([]);
		// The same model against the tree of a text whose emphasis is gone.
		const other = build('# Title\n\nSome  em  and `code`.\n');
		expect(againstModel(m, deckTree(other, src.length))).toEqual(['em_open 14-18']);
	});

	it('an incremental tree is the tree built from nothing, after edits anywhere in the deck', () => {
		const src = read('test/integration/baseline-decks/gallery.md');
		let seed = 7;
		const rand = (n: number) => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed % n;
		};
		const atoms = ['x', '*', '**', '`', '\n', '\n\n', '---\n', '> ', '- ', '|', '[a](b)', '$', '~~', '# ', '\n[a]: /u\n', '[a]', 'Title\n===\n'];
		let text = src;
		let m = build(text);
		deckTree(m, text.length);
		for (let e = 0; e < 60; e++) {
			const at = rand(text.length);
			const del = rand(3);
			text = text.slice(0, at) + atoms[rand(atoms.length)] + text.slice(at + del);
			m = updateDeckModel(m, text) as DeckModel;
			expect(dump(deckTree(m, text.length)), `edit ${e} at ${at}`).toEqual(dump(deckTree(build(text), text.length)));
		}
	});
	it('a reference definition added in one slide re-reads a reference link in another (the kept subtrees are keyed by the labels)', () => {
		const before = '[zz] here\n\n---\n\nother\n';
		const after = `${before}\n[zz]: /u\n`;
		const m0 = build(before);
		const t0 = deckTree(m0, before.length);
		expect(dump(t0).some((n) => n.startsWith('Link '))).toBe(false);
		const m1 = updateDeckModel(m0, after) as DeckModel;
		const t1 = dump(deckTree(m1, after.length));
		expect(t1).toContain('Link 0 4');
		expect(t1).toEqual(dump(deckTree(build(after), after.length)));
	});

	it('the failing arm of the well-formedness check: overlapping siblings are caught', () => {
		const P = deckNodeSet.types.find((t) => t.name === 'Paragraph')?.id as number;
		const D = deckNodeSet.types.find((t) => t.name === 'Document')?.id as number;
		const bad = LezerTree.build({ buffer: [P, 0, 5, 4, P, 3, 8, 4, D, 0, 8, 12], nodeSet: deckNodeSet, topID: 0, length: 8 });
		expect(malformed(bad)).toMatch(/^Paragraph 3-8/);
	});
});

describe('a keystroke, counted', () => {
	it('one character typed in the gallery’s middle slide re-reads that slide and rebuilds that slide’s subtree only', () => {
		const src = read('test/integration/baseline-decks/gallery.md');
		const state = EditorState.create({ doc: src, extensions: deckMarkdown() });
		const tree0 = ensureSyntaxTree(state, src.length, 5000) as Tree;
		const m0 = modelOf(tree0) as DeckModel;
		expect(m0.slides.length).toBeGreaterThan(100);
		const mid = m0.slides[m0.slides.length >> 1];
		const pos = m0.source.length - m0.text.length + m0.bodyStart + m0.lineStart(mid.fromLine + 1);
		const before = { ...deckTreeStats };
		const fullBefore = deckModelStats.full;
		const next = state.update({ changes: { from: pos, insert: 'x' } }).state;
		const tree1 = ensureSyntaxTree(next, next.doc.length, 5000) as Tree;
		expect(modelOf(tree1)).not.toBe(m0);
		// No deck parse from nothing, one slide rebuilt, every other slide's subtree reused as it was.
		expect(deckModelStats.full - fullBefore).toBe(0);
		expect(deckTreeStats.models - before.models).toBe(0);
		expect(deckTreeStats.updates - before.updates).toBe(1);
		expect(deckTreeStats.slidesBuilt - before.slidesBuilt).toBe(1);
		expect(deckTreeStats.slidesReused - before.slidesReused).toBe(m0.slides.length - 1);
		const all = dump(tree1).length;
		const built = deckTreeStats.nodes - before.nodes;
		expect(built).toBeGreaterThan(0);
		expect(built * 20).toBeLessThan(all);
	});

	// CodeMirror parses a transaction with a 20 ms budget (`Work.Apply`). On a slow machine the deck update can spend
	// it, and then `takeTree` cuts the tree where a nested parse is still pending: the front matter's YAML here (the
	// edit breaks the slide's comment), the start of the document when an HTML parse is pending (the test after this
	// one). The next parse (here `ensureSyntaxTree`, in an editor the idle-time worker) starts again from the fragments
	// and calls the deck parser a second time on text it has already read. That second call is CodeMirror's slicing,
	// and it must cost the deck nothing: no second update, no slide counted twice, the same final tree. A clock that
	// jumps 1 s per read spends the budget after the first step every time, so the split no longer waits for a load.
	/** Type `x` at `at(model)` with a clock that spends CodeMirror's budget after the first step, then finish the parse. */
	const splitKeystroke = (src: string, at: (m: DeckModel) => number) => {
		const state = EditorState.create({ doc: src, extensions: deckMarkdown() });
		const m0 = modelOf(ensureSyntaxTree(state, src.length, 5000) as Tree) as DeckModel;
		const before = { ...deckTreeStats };
		const realNow = Date.now;
		let clock = realNow();
		Date.now = () => (clock += 1000);
		let next: EditorState;
		try {
			next = state.update({ changes: { from: at(m0), insert: 'x' } }).state;
		} finally {
			Date.now = realNow;
		}
		const tree = ensureSyntaxTree(next, next.doc.length, 5000) as Tree;
		const d = (k: keyof typeof deckTreeStats) => deckTreeStats[k] - before[k];
		// The deck updated once, one slide rebuilt, every other one reused once.
		expect(d('updates')).toBe(1);
		expect(d('models')).toBe(0);
		expect(d('slidesBuilt')).toBe(1);
		expect(d('slidesReused')).toBe(m0.slides.length - 1);
		// The split happened: the deck parser ran twice, and the second run found the text it had already read.
		expect(d('repeats')).toBe(1);
		// And the tree it ends with is the one a parse from nothing builds, the HTML and YAML inside included.
		const fresh = EditorState.create({ doc: next.doc.toString(), extensions: deckMarkdown() });
		expect(dump(tree)).toEqual(dump(ensureSyntaxTree(fresh, fresh.doc.length, 5000) as Tree));
	};
	const lineAt = (m: DeckModel, line: number) => m.source.length - m.text.length + m.bodyStart + m.lineStart(line);
	const middle = (m: DeckModel) => m.slides[m.slides.length >> 1];

	it('a keystroke whose parse runs out of time and finishes in a second slice still updates the deck once', () => {
		splitKeystroke(read('test/integration/baseline-decks/gallery.md'), (m) => lineAt(m, middle(m).fromLine + 1));
	});

	it('the same, cut where the edited slide’s comment is still being parsed as HTML (no front matter)', () => {
		const src = read('test/integration/baseline-decks/gallery.md').replace(/^---\n[\s\S]*?\n---\n/, '');
		// At the end of the slide's second line, so its `<!-- @meta -->` comment stays whole and its HTML parse pending.
		splitKeystroke(src, (m) => lineAt(m, middle(m).fromLine + 2) - 1);
	});
});

describe('in CodeMirror', () => {
	const names = (doc: string) => {
		const state = EditorState.create({ doc, extensions: deckMarkdown() });
		const tree = ensureSyntaxTree(state, doc.length, 5000) as Tree;
		return dump(tree);
	};
	const lezer = (doc: string) => {
		const state = EditorState.create({ doc, extensions: markdown() });
		return dump(ensureSyntaxTree(state, doc.length, 5000) as Tree);
	};

	it('reads math, strikethrough and tables as the engine does, where Lezer Markdown read them its own way', () => {
		const doc = 'Area $a*b*c$ and ~~gone~~.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
		const ours = names(doc);
		expect(ours).toContain('LatticeInline 5 12');
		expect(ours).toContain('Strikethrough 17 25');
		expect(ours.some((n) => n.startsWith('Table '))).toBe(true);
		expect(ours.filter((n) => n.startsWith('TableCell ')).length).toBe(4);
		expect(ours.some((n) => n.startsWith('Emphasis '))).toBe(false);
		// The grammar the editor ran before: emphasis inside the math, no strikethrough, no table.
		const before = lezer(doc);
		expect(before.some((n) => n.startsWith('Emphasis '))).toBe(true);
		expect(before.some((n) => n.startsWith('Strikethrough ') || n.startsWith('Table '))).toBe(false);
	});

	it('front matter is the engine’s, with its YAML parsed inside', () => {
		const doc = '---\ntheme: indaco\npaginate: true\n---\n\n# One\n';
		const ours = names(doc);
		expect(ours).toContain('Frontmatter 0 36');
		expect(ours).toContain('FrontmatterMark 0 3');
		expect(ours).toContain('FrontmatterMark 33 36');
		expect(ours).toContain('ATXHeading1 38 43');
		const state = EditorState.create({ doc, extensions: deckMarkdown() });
		const tree = ensureSyntaxTree(state, doc.length, 5000) as Tree;
		expect(tree.resolveInner(5, 1).parent?.name).toBe('Key');
	});

	it('lists and quotes carry the marks the Enter and Backspace keymap reads', () => {
		const doc = '> - one\n>   more\n> - two\n';
		const ours = names(doc);
		expect(ours).toEqual(expect.arrayContaining(['Blockquote 0 24', 'QuoteMark 0 1', 'BulletList 2 24', 'ListItem 2 16', 'ListMark 2 3', 'Paragraph 4 16', 'QuoteMark 8 9', 'QuoteMark 17 18', 'ListItem 19 24', 'ListMark 19 20']));
		const state = EditorState.create({ doc, extensions: deckMarkdown() });
		const tree = ensureSyntaxTree(state, doc.length, 5000) as Tree;
		expect(tree.resolveInner(6, 1).parent?.name).toBe('ListItem');
	});

	it('a setext heading takes its underline as its mark', () => {
		expect(names('Intro line\n---\n')).toEqual(['Document 0 15', 'SetextHeading2 0 14', 'HeaderMark 11 14']);
		expect(names('> Title\n> ===\n')).toEqual(expect.arrayContaining(['SetextHeading1 2 13', 'QuoteMark 8 9', 'HeaderMark 10 13']));
	});

	it('a quoted fence’s code starts after the quote’s `> `', () => {
		expect(names('> ```\n> code\n> ```\n')).toContain('CodeText 8 12');
	});

	it('a link reference definition is a LinkReference with its parts, as Lezer Markdown read it', () => {
		const doc = 'See [b].\n\n[b]: /x "t"\n> [c]:\n> <y z>\n';
		const ours = names(doc);
		expect(ours).toEqual(expect.arrayContaining(['LinkReference 10 21', 'LinkLabel 10 13', 'LinkMark 13 14', 'URL 15 17', 'LinkTitle 18 21']));
		expect(ours).toEqual(expect.arrayContaining(['Blockquote 22 36', 'LinkReference 24 36', 'LinkLabel 24 27', 'LinkMark 27 28', 'QuoteMark 29 30', 'URL 31 36']));
		expect(ours.filter((n) => n.startsWith('LinkReference ')).length).toBe(2);
	});

	it('the slide break and the ATX marks', () => {
		expect(names('# A #\n\n---\n\nb\n')).toEqual(['Document 0 14', 'ATXHeading1 0 5', 'HeaderMark 0 1', 'HeaderMark 4 5', 'HorizontalRule 7 10', 'Paragraph 12 13']);
	});
});
