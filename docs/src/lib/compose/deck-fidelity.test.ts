import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { toggleMark } from 'prosemirror-commands';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';
import { normalizeSource } from './deck-source';

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

	it('two blocks that read alike but are written differently keep their own bytes when one moves', () => {
		const src = '# T\n\nA \\<b>x\\</b>\n\nmid\n\nA <b>x</b>\n';
		const doc = deckToDoc(src);
		const slide = doc.child(0);
		// Move the last block to the top of the slide.
		const blocks: import('prosemirror-model').Node[] = [];
		slide.forEach((b) => {
			blocks.push(b);
		});
		const moved = slide.copy(slide.content.replaceChild(1, blocks[3]).replaceChild(3, blocks[1]));
		const out = emitDeck(EditorState.create({ doc }).tr.replaceWith(0, slide.nodeSize, moved).doc, initBaseline(doc));
		// Which bytes belonged to which block cannot be told, so neither keeps an escape it may not have had.
		expect(out.split('\n').filter((l) => l.startsWith('A '))).not.toEqual(['A \\<b>x\\</b>', 'A <b>x</b>']);
	});

	it('an edit inside a 3000-item list stays fast', () => {
		const items = Array.from({ length: 3000 }, (_x, i) => `- item ${i}`).join('\n');
		const doc = deckToDoc(`# T\n\n${items}\n`);
		let at = -1;
		doc.descendants((n, p) => {
			if (at < 0 && n.isText && n.text === 'item 1500') at = p + n.nodeSize;
			return at < 0;
		});
		const base = initBaseline(doc);
		const edited = EditorState.create({ doc }).tr.insertText('X', at).doc;
		// Work done, not time (HARD RULE #32): the edit changes one line of three thousand.
		expect(linesChanged(`# T\n\n${items}\n`, emitDeck(edited, base))).toBe(1);
	});
});
