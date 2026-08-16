import { AllSelection, EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc } from './deck-doc';
import { selectionSpansSlides, selectSlideThenDeck, touchesLockedSlide } from './selection-commands';

// #1650 — ⌘A scoping and the "is this cross-slide edit deliberate?" predicate that lets
// Compose's structural guard tell an accidental slide merge from a real selection.
//
// Exercised against a REAL deck document (`deckToDoc`), not a hand-built fixture, so the
// positions are the ones the editor actually resolves.

const SOURCE = [
	'---',
	'theme: indaco',
	'---',
	'',
	'<!-- _class: title -->',
	'',
	'# First slide',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Second slide',
	'',
	'Some body prose.',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Third slide',
	'',
].join('\n');

const stateFor = (source = SOURCE) => EditorState.create({ doc: deckToDoc(source) });

/** A caret inside slide `i` (its first text position). */
function caretInSlide(state: EditorState, i: number): EditorState {
	const start = posOfSlide(state, i);
	return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(start + 1))));
}

/** Doc-relative position of slide `i` — top-level offsets, so just the running sum. */
function posOfSlide(state: EditorState, i: number): number {
	let pos = 0;
	for (let n = 0; n < i; n++) pos += state.doc.child(n).nodeSize;
	return pos;
}

describe('selectionSpansSlides', () => {
	it('is false for a bare caret — the accidental-merge case the guard exists for', () => {
		const state = caretInSlide(stateFor(), 1);
		expect(state.selection.empty).toBe(true);
		expect(selectionSpansSlides(state.selection)).toBe(false);
	});

	it('is false for a selection inside one slide', () => {
		const state = stateFor();
		const start = posOfSlide(state, 1);
		const slide = state.doc.child(1);
		const sel = TextSelection.between(state.doc.resolve(start + 1), state.doc.resolve(start + slide.nodeSize - 1));
		expect(selectionSpansSlides(sel)).toBe(false);
	});

	it('is true for a selection dragged across a slide boundary', () => {
		const state = stateFor();
		const first = posOfSlide(state, 0);
		const second = posOfSlide(state, 1);
		const sel = TextSelection.between(state.doc.resolve(first + 2), state.doc.resolve(second + 2));
		expect(selectionSpansSlides(sel)).toBe(true);
	});

	it('is true for AllSelection — the second ⌘A', () => {
		const state = stateFor();
		expect(selectionSpansSlides(new AllSelection(state.doc))).toBe(true);
	});

	it('is true for a NodeSelection on a whole slide', () => {
		const state = stateFor();
		const sel = NodeSelection.create(state.doc, posOfSlide(state, 1));
		expect(sel.node.type.name).toBe('slide');
		expect(selectionSpansSlides(sel)).toBe(true);
	});
});

describe('selectSlideThenDeck — ⌘A scopes to the slide, ⌘A⌘A to the deck', () => {
	it('first press selects exactly the current slide and nothing beyond it', () => {
		const state = caretInSlide(stateFor(), 1);
		let next: EditorState | null = null;
		const handled = selectSlideThenDeck(state, (tr) => {
			next = state.apply(tr);
		});
		expect(handled).toBe(true);
		const sel = (next as unknown as EditorState).selection;
		const start = posOfSlide(state, 1);
		const end = start + state.doc.child(1).nodeSize;
		expect(sel.from).toBeGreaterThan(start);
		expect(sel.to).toBeLessThan(end);
		expect(selectionSpansSlides(sel)).toBe(false);
	});

	it('second press declines, so the chain falls through to baseKeymap selectAll', () => {
		const state = caretInSlide(stateFor(), 1);
		let next: EditorState | null = null;
		selectSlideThenDeck(state, (tr) => {
			next = state.apply(tr);
		});
		// Same command again on the now-whole-slide selection.
		expect(selectSlideThenDeck(next as unknown as EditorState, () => {})).toBe(false);
	});

	it('declines on an AllSelection rather than collapsing back to one slide', () => {
		const state = stateFor();
		const all = state.apply(state.tr.setSelection(new AllSelection(state.doc)));
		expect(selectSlideThenDeck(all, () => {})).toBe(false);
	});

	it('does not dispatch when only probing (dispatch omitted)', () => {
		const state = caretInSlide(stateFor(), 1);
		expect(selectSlideThenDeck(state, undefined)).toBe(true);
		expect(state.selection.empty).toBe(true); // untouched
	});
});

describe('touchesLockedSlide', () => {
	it('is false when every locked slide survives by identity', () => {
		const state = stateFor();
		expect(touchesLockedSlide(state.doc, state.doc)).toBe(false);
	});

	it('is true when a locked slide is dropped', () => {
		const state = stateFor();
		// Lock slide 1, then build a doc without it.
		const locked = state.doc.child(1).type.create({ ...state.doc.child(1).attrs, locked: true }, state.doc.child(1).content);
		const withLocked = state.doc.type.create(state.doc.attrs, [state.doc.child(0), locked, state.doc.child(2)]);
		const without = state.doc.type.create(state.doc.attrs, [state.doc.child(0), state.doc.child(2)]);
		expect(touchesLockedSlide(withLocked, without)).toBe(true);
	});

	it('is false when an UNLOCKED slide is dropped', () => {
		const state = stateFor();
		const without = state.doc.type.create(state.doc.attrs, [state.doc.child(0), state.doc.child(2)]);
		expect(touchesLockedSlide(state.doc, without)).toBe(false);
	});
});
