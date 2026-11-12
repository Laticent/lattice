import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { toggleMark } from 'prosemirror-commands';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { alignBlocks, deckSchema, deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';
import { normalizeSource } from './deck-source';
import { emitPatch, scopedResync, scopedResyncPatch } from './scoped-resync';

// COMPOSE WRITES BACK WHAT YOU WROTE (engineering/decisions/2026-11-10-compose-first.md §6). Compose is the default editor,
// so an edit there must change only what the author changed: a one-character edit on a slide changes one line of the
// deck, and a deck opened and left alone comes back byte for byte, separators and trailing newline included. Measured on
// every shipped example deck.
const DIR = path.resolve(process.cwd(), '..', 'examples');
const DECKS = readdirSync(DIR)
	.filter((f) => f.endsWith('.md'))
	.sort();

/** Lines of `a` that `b` no longer has, counted as a multiset (a moved line is not a change). */
function linesGone(a: string, b: string): number {
	const have = new Map<string, number>();
	for (const l of b.split('\n')) have.set(l, (have.get(l) ?? 0) + 1);
	let gone = 0;
	for (const l of a.split('\n')) {
		const n = have.get(l) ?? 0;
		if (n) have.set(l, n - 1);
		else gone++;
	}
	return gone;
}

/** Lines changed between `a` and `b`: removed or added, whichever is more (a duplicated line counts too). */
const linesChanged = (a: string, b: string) => Math.max(linesGone(a, b), linesGone(b, a));

/** Each unlocked slide with a textblock, its deck after an `X` typed at the end of that slide's first textblock, and what the
 *  edited document says (its canonical form): the faithful text must read back to the same. */
function* oneEdits(src: string): Generator<{ slide: number; out: string; means: string }> {
	const doc = deckToDoc(src);
	let pos = 0;
	for (let s = 0; s < doc.childCount; s++) {
		const slide = doc.child(s);
		let at = -1;
		if (!slide.attrs.locked)
			slide.descendants((n, p) => {
				if (at < 0 && n.isTextblock && n.textContent.length) at = pos + 1 + p + 1 + n.content.size;
				return at < 0;
			});
		if (at >= 0) {
			const edited = EditorState.create({ doc }).tr.insertText('X', at).doc;
			yield { slide: s, out: emitDeck(edited, initBaseline(doc)), means: docToDeck(edited) };
		}
		pos += slide.nodeSize;
	}
}

describe('Compose writes back what the author wrote', () => {
	it.each(DECKS)('%s comes back byte for byte when nothing is edited', (f) => {
		const src = normalizeSource(readFileSync(path.join(DIR, f), 'utf8'));
		const doc = deckToDoc(src);
		expect(emitDeck(doc, initBaseline(doc))).toBe(src);
	});

	it.each(DECKS)('%s: a one-character edit on a slide changes only its line, and says what the edit says', (f) => {
		const src = normalizeSource(readFileSync(path.join(DIR, f), 'utf8'));
		const bad: string[] = [];
		for (const { slide, out, means } of oneEdits(src)) {
			const changed = linesChanged(src, out);
			if (changed !== 1) bad.push(`slide ${slide + 1}: ${changed} lines`);
			if (docToDeck(deckToDoc(out)) !== means) bad.push(`slide ${slide + 1}: reads differently`);
		}
		expect(bad).toEqual([]);
	});
});

describe('the edited block keeps the author’s spelling', () => {
	/** The deck after an `X` typed at the start of its first non-heading textblock. */
	const typeX = (src: string) => {
		const doc = deckToDoc(src);
		let at = -1;
		doc.descendants((n, p) => {
			if (at < 0 && n.isTextblock && n.textContent.length && n.type.name !== 'heading') at = p + 1;
			return at < 0;
		});
		return emitDeck(EditorState.create({ doc }).tr.insertText('X', at).doc, initBaseline(doc));
	};
	it.each([
		['underscore emphasis', '# T\n\nAn _em_ word and __strong__ here.\n', '# T\n\nXAn _em_ word and __strong__ here.\n'],
		['`*` bullets', '# T\n\n* one\n* two\n', '# T\n\n* Xone\n* two\n'],
		['`+` bullets', '# T\n\n+ one\n+ two\n', '# T\n\n+ Xone\n+ two\n'],
		['`)` numbers', '# T\n\n1) one\n2) two\n', '# T\n\n1) Xone\n2) two\n'],
		['a lone tilde', '# T\n\nAbout ~8% of it.\n', '# T\n\nXAbout ~8% of it.\n'],
		["a table's alignment row and other rows", '# T\n\n| A | B |\n|:--:|--:|\n| 1 | 2 |\n', '# T\n\n| XA | B |\n|:--:|--:|\n| 1 | 2 |\n'],
		['a two-space hard break', '# T\n\nLine one  \nline two\n', '# T\n\nXLine one  \nline two\n'],
		['a word with underscores next to emphasis', '# T\n\nsnake_case_name and _em_.\n', '# T\n\nXsnake_case_name and _em_.\n'],
	])('%s', (_what, src, want) => {
		expect(typeX(src)).toBe(want);
	});

	it('writes `*` where `_` emphasis could not open or close (inside a word)', () => {
		const doc = deckToDoc('# T\n\nAn _em_ word.\n');
		// An unemphasized letter straight after the emphasis: `_em_X` would not read as emphasis, so the run is written `*em*`.
		// (Typing there would carry the emphasis on; a paste or a toolbar toggle can leave the letter plain.)
		let at = -1;
		doc.descendants((n, p) => {
			if (at < 0 && n.isText && n.marks.length) at = p + n.nodeSize;
			return at < 0;
		});
		const state = EditorState.create({ doc });
		const out = emitDeck(state.tr.insert(at, state.schema.text('X')).doc, initBaseline(doc));
		expect(out).toBe('# T\n\nAn *em*X word.\n');
	});
});

describe('the checker’s cases (2026-11-11)', () => {
	it('emphasis toggled next to emphasis is one run, not `*foo**bar*`', () => {
		const doc = deckToDoc('# T\n\nA *foo*bar here.\n');
		let from = -1;
		doc.descendants((n, p) => {
			if (from < 0 && n.isText && n.text?.startsWith('bar')) from = p;
			return from < 0;
		});
		let state = EditorState.create({ doc });
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, from + 3)));
		toggleMark(deckSchema.marks.em)(state, (tr) => {
			state = state.apply(tr);
		});
		expect(emitDeck(state.doc, initBaseline(doc))).toBe('# T\n\nA *foobar* here.\n');
	});

	it('a slide inserted at the front leaves the old first slide behind the canonical separator, never a stale one', () => {
		const src = '# A\n\nbody a\n\n---\n\n# B\n\nbody b\n';
		const doc = deckToDoc(src);
		const added = deckSchema.nodes.slide.create(null, deckSchema.nodes.paragraph.create(null, deckSchema.text('N')));
		const out = emitDeck(EditorState.create({ doc }).tr.insert(0, added).doc, initBaseline(doc));
		expect(out).toBe('N\n\n---\n\n# A\n\nbody a\n\n---\n\n# B\n\nbody b\n');
	});

	it('a slide with an escaped tag, comment or processing instruction is locked: Compose cannot tell it from the live one, and the export can', () => {
		// html:false reads `\\<b>` and `<b>` as the same text, so no write-back could keep which was which (the checkers' catches).
		for (const body of ['A \\<b>x\\</b>', 'See \\<!-- c --> here', 'Run \\<?php x ?> here', 'See &lt;!-- c --> here', 'A &lt;b>x'])
			expect(deckToDoc(`# T\n\n${body}\n`).child(0).attrs.locked, body).toBe(true);
		// Prose that only mentions a `<` is not locked.
		expect(deckToDoc('# T\n\nWhen a \\< b, stop.\n').child(0).attrs.locked).toBe(false);
	});

	it('an HTML attribute and a code span on the edited line are written as they are', () => {
		const at = (doc: import('prosemirror-model').Node, word: string) => {
			let pos = -1;
			doc.descendants((n, p) => {
				if (pos < 0 && n.isText && n.text?.includes(word)) pos = p + n.text.indexOf(word);
				return pos < 0;
			});
			return pos;
		};
		for (const [src, want] of [
			['# T\n\nSee <span title="*a*">y</span> and _a_ here.\n', '# T\n\nSee <span title="*a*">y</span> and _a_ Xhere.\n'],
			['# T\n\nCode `*a*` and _a_ here.\n', '# T\n\nCode `*a*` and _a_ Xhere.\n'],
			// A `>` inside a quoted attribute does not end the tag.
			['# T\n\nSee <span title="x>*a*">y</span> and _a_ here.\n', '# T\n\nSee <span title="x>*a*">y</span> and _a_ Xhere.\n'],
		]) {
			const doc = deckToDoc(src);
			expect(emitDeck(EditorState.create({ doc }).tr.insertText('X', at(doc, 'here')).doc, initBaseline(doc))).toBe(want);
		}
	});

	it('a slide that cannot be spliced around its directive keeps no blank lines the directive left behind', () => {
		const src = '# T\n\n```md\n<!-- _class: kpi -->\n```\n\n<!-- _class: kpi -->\n\nbody\n';
		const doc = deckToDoc(src);
		let pos = -1;
		doc.descendants((n, p) => {
			if (pos < 0 && n.isText && n.text === 'body') pos = p;
			return pos < 0;
		});
		const out = emitDeck(EditorState.create({ doc }).tr.insertText('X', pos).doc, initBaseline(doc));
		expect(out).not.toMatch(/\n{3,}/);
		expect(out).toContain('Xbody');
	});

	it('the scoped resync emits exactly the new text when it takes a front insert, and hands a separator change to the full resync', () => {
		/** The scoped and the patch path's result for `next`: null, or what the doc then emits. */
		const run = (src: string, next: string, path: 'whole' | 'patch') => {
			const doc = deckToDoc(src);
			const base = initBaseline(doc);
			const before = emitDeck(doc, base);
			const state = EditorState.create({ doc });
			const patch = emitPatch(before, next);
			const r = path === 'whole' ? scopedResync(state, base, next) : patch && scopedResyncPatch(state, base, patch);
			if (!r) return null;
			const after = state.apply(r.tr).doc;
			r.commit(after);
			return emitDeck(after, base);
		};
		for (const path of ['whole', 'patch'] as const) {
			// A front insert that keeps every separator: the scoped path takes it, and the result is exactly the new text.
			expect(run('# A\n---\n# B\n', '# N\n\n---\n\n# A\n---\n# B\n', path), path).toBe('# N\n\n---\n\n# A\n---\n# B\n');
			// The old first slide now behind a separator it never had: the full resync's to rebuild, never a stale one.
			const moved = run('# A\n\n---\n\n# B\n', '# N\n---\n# A\n\n---\n\n# B\n', path);
			expect(moved === null || moved === '# N\n---\n# A\n\n---\n\n# B\n', `${path}: ${moved}`).toBe(true);
		}
	});

	it('original blocks that read alike but are written differently are all written plainly, in any order', () => {
		// `A &amp; B` and `A & B` read alike here; which bytes are whose cannot be told. Every pair is read from the keys as
		// they were (an earlier loop renamed a key mid-scan and let the third block keep bytes that may not be its own).
		const doc = deckToDoc('# T\n\nA &amp; B\n\nA & B\n\nA &amp; B\n');
		const out = emitDeck(EditorState.create({ doc }).tr.insertText('X', 3).doc, initBaseline(doc));
		expect(out.split('\n').filter((l) => l.startsWith('A '))).toEqual(['A & B', 'A & B', 'A & B']);
	});

	it('a slide that falls back to its directive-free spelling still reads as the edit', () => {
		// The trailing spaces of an indented code block's last line sit in the gap after it; collapsing that gap must not drop them.
		const src = '<!-- _class: kpi -->\n\n# T\n\n    code   \n\n\n\nbody\n';
		const doc = deckToDoc(src);
		let pos = -1;
		doc.descendants((n, p) => {
			if (pos < 0 && n.isText && n.text === 'body') pos = p;
			return pos < 0;
		});
		const edited = EditorState.create({ doc }).tr.setNodeAttribute(0, 'directives', ['<!-- _class: big-number -->']).insertText('X', pos).doc;
		const out = emitDeck(edited, initBaseline(doc));
		expect(docToDeck(deckToDoc(out))).toBe(docToDeck(edited));
	});

	it('an edit inside a 3000-item list aligns only what changed', () => {
		// Work done, not time (HARD RULE #32): the common head and tail match one to one, so the quadratic table covers only
		// the edited line, one cell, not 3000 x 3000.
		const lines = Array.from({ length: 3000 }, (_x, i) => `- item ${i}`);
		const edited = lines.slice();
		edited[1500] = '- item 1500X';
		const stats = { cells: 0 };
		const at = alignBlocks(edited, lines, stats);
		expect(stats.cells).toBe(1);
		expect(at.filter((x) => x >= 0)).toHaveLength(2999);
		// And end to end: the deck changes by that one line.
		const deck = `# T\n\n${lines.join('\n')}\n`;
		const doc = deckToDoc(deck);
		let pos = -1;
		doc.descendants((n, p) => {
			if (pos < 0 && n.isText && n.text === 'item 1500') pos = p + n.nodeSize;
			return pos < 0;
		});
		expect(linesChanged(deck, emitDeck(EditorState.create({ doc }).tr.insertText('X', pos).doc, initBaseline(doc)))).toBe(1);
	});
});
