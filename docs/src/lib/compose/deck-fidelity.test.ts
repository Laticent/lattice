import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, emitDeck, initBaseline } from './deck-doc';
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

/** Each unlocked slide with a textblock, its deck after an `X` typed at the end of that slide's first textblock. */
function* oneEdits(src: string): Generator<{ slide: number; out: string }> {
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
		if (at >= 0) yield { slide: s, out: emitDeck(EditorState.create({ doc }).tr.insertText('X', at).doc, initBaseline(doc)) };
		pos += slide.nodeSize;
	}
}

describe('Compose writes back what the author wrote', () => {
	it.each(DECKS)('%s comes back byte for byte when nothing is edited', (f) => {
		const src = normalizeSource(readFileSync(path.join(DIR, f), 'utf8'));
		const doc = deckToDoc(src);
		expect(emitDeck(doc, initBaseline(doc))).toBe(src);
	});

	it.each(DECKS)('%s: a one-character edit on a slide changes only its line', (f) => {
		const src = normalizeSource(readFileSync(path.join(DIR, f), 'utf8'));
		const bad: string[] = [];
		for (const { slide, out } of oneEdits(src)) {
			const gone = linesGone(src, out);
			if (gone !== 1) bad.push(`slide ${slide + 1}: ${gone} lines`);
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
