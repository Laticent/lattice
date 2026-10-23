// @vitest-environment node
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from './deck-doc';
import { insertLineBreak } from './line-break-command';

const DECK = ['---', 'theme: indaco', '---', '', '## Title', '', 'alpha beta', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', '```mermaid', 'graph LR', '```', ''].join('\n');

/** The caret `offset` characters into the first text block whose whole text is `text` (a cell or heading) or starts with it. */
function at(text: string, offset: number): EditorState {
	const state = EditorState.create({ doc: deckToDoc(DECK) });
	let pos = -1;
	state.doc.descendants((node, p) => {
		if (pos === -1 && node.isTextblock && node.textContent.startsWith(text)) pos = p + 1 + offset;
	});
	if (pos === -1) throw new Error(`no block ${text}`);
	return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}
function run(state: EditorState) {
	let next = state;
	const ok = insertLineBreak(state, (tr) => {
		next = state.apply(tr);
	});
	return { ok, next };
}

describe('Shift-Enter', () => {
	it('writes one new line in a paragraph, as a bare newline', () => {
		const { ok, next } = run(at('alpha', 5));
		expect(ok).toBe(true);
		const out = docToDeck(next.doc);
		expect(out).toContain('alpha\nbeta');
		expect(out).not.toContain('alpha\n\n');
	});
	it('replaces a selection with the line break', () => {
		const s = at('alpha', 0);
		const sel = s.apply(s.tr.setSelection(TextSelection.create(s.doc, s.selection.from, s.selection.from + 6)));
		expect(docToDeck(run(sel).next.doc)).toContain('\nbeta');
	});
	it('is swallowed and does nothing in a heading or a table cell', () => {
		for (const t of ['Title', '1']) {
			const s = at(t, 1);
			const { ok, next } = run(s);
			expect(ok).toBe(true);
			expect(next.doc.eq(s.doc)).toBe(true);
		}
	});
	it('is a plain newline in a fence', () => {
		const { ok, next } = run(at('graph', 5));
		expect(ok).toBe(true);
		expect(docToDeck(next.doc)).toContain('graph\n LR');
	});
});

describe('Shift-Enter at the end of a paragraph', () => {
	it('saves no stray backslash before the next line is typed', () => {
		const out = docToDeck(run(at('alpha beta', 10)).next.doc);
		expect(out).toContain('alpha beta');
		expect(out).not.toContain('\\');
	});
});

describe('Shift-Enter and marks', () => {
	it('carries no code mark into the break', () => {
		const { next } = run(at('alpha', 2));
		let marked = false;
		next.doc.descendants((n) => {
			if (n.type.name === 'hard_break' && n.marks.length) marked = true;
		});
		expect(marked).toBe(false);
	});
});
