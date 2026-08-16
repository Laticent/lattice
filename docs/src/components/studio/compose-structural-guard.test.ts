import { history, redo, undo } from 'prosemirror-history';
import { AllSelection, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc } from '@/lib/compose/deck-doc';
import { selectSlideThenDeck } from '@/lib/compose/selection-commands';
import { structuralGuard } from './ComposeView';

// #1650 — "select all, then Delete, and nothing happens."
//
// The cause was `structuralGuard`: it rejected EVERY transaction that changed the slide
// count unless the transaction carried a `slideOp` meta, so a delete spanning slides was
// silently dropped on the floor. These tests drive the real plugin through a real deck
// document and assert on the APPLIED state — `state.apply()` returns the unchanged state
// when a filter rejects, which is exactly what the author saw as "nothing happened".

const THREE = ['<!-- _class: content -->\n\n# One\n\nbody one', '<!-- _class: content -->\n\n# Two\n\nbody two', '<!-- _class: content -->\n\n# Three\n\nbody three'].join('\n\n---\n\n');

const make = (source = THREE) => EditorState.create({ doc: deckToDoc(source), plugins: [structuralGuard()] });

function slidePos(state: EditorState, i: number): number {
	let pos = 0;
	for (let k = 0; k < i; k++) pos += state.doc.child(k).nodeSize;
	return pos;
}

describe('structuralGuard — accidental merges stay blocked', () => {
	it('rejects a caret-driven merge at a slide boundary', () => {
		const state = make();
		// Caret at the very start of slide 2, then delete backwards across the boundary.
		const caret = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(slidePos(state, 1) + 1))));
		const merged = caret.apply(caret.tr.delete(slidePos(caret, 1) - 1, slidePos(caret, 1) + 1));
		expect(merged.doc.childCount).toBe(3); // unchanged — the guard held
		expect(merged.doc).toBe(caret.doc);
	});

	it('still allows an ordinary edit inside one slide', () => {
		const state = make();
		const at = slidePos(state, 1) + 3;
		const typed = state.apply(state.tr.insertText('X', at));
		expect(typed.doc).not.toBe(state.doc);
		expect(typed.doc.childCount).toBe(3);
	});
});

describe('structuralGuard — a deliberate cross-slide selection is now deletable', () => {
	it('deletes a selection dragged across two slides', () => {
		const state = make();
		const sel = TextSelection.between(state.doc.resolve(slidePos(state, 0) + 3), state.doc.resolve(slidePos(state, 1) + 3));
		const selected = state.apply(state.tr.setSelection(sel));
		const deleted = selected.apply(selected.tr.deleteSelection());
		expect(deleted.doc).not.toBe(selected.doc); // the transaction actually landed
		expect(deleted.doc.childCount).toBeLessThan(3);
	});

	it('⌘A ⌘A then Delete clears the deck to a single empty slide', () => {
		let state = make();
		// First ⌘A — scopes to the current slide.
		const caret = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(slidePos(state, 1) + 1))));
		state = caret;
		selectSlideThenDeck(state, (tr) => {
			state = state.apply(tr);
		});
		expect(state.selection.from).toBeGreaterThan(slidePos(state, 1));
		// Second ⌘A — the command declines, so baseKeymap's selectAll runs. That is an
		// AllSelection over the whole document.
		expect(selectSlideThenDeck(state, () => {})).toBe(false);
		state = state.apply(state.tr.setSelection(new AllSelection(state.doc)));
		// …and Delete.
		const cleared = state.apply(state.tr.deleteSelection());
		expect(cleared.doc).not.toBe(state.doc);
		expect(cleared.doc.childCount).toBe(1); // `doc → slide+` keeps one slide alive
		expect(cleared.doc.textContent.trim()).toBe('');
	});

	it('typing over a cross-slide selection replaces it', () => {
		const state = make();
		const sel = TextSelection.between(state.doc.resolve(slidePos(state, 0) + 3), state.doc.resolve(slidePos(state, 2) + 3));
		const selected = state.apply(state.tr.setSelection(sel));
		const typed = selected.apply(selected.tr.replaceSelectionWith(selected.schema.text('replaced'), false));
		expect(typed.doc).not.toBe(selected.doc);
		expect(typed.doc.textContent).toContain('replaced');
	});
});

describe('structuralGuard — a locked slide stays immutable either way', () => {
	function withLockedMiddle() {
		const base = EditorState.create({ doc: deckToDoc(THREE) });
		const mid = base.doc.child(1);
		const locked = mid.type.create({ ...mid.attrs, locked: true }, mid.content);
		const doc = base.doc.type.create(base.doc.attrs, [base.doc.child(0), locked, base.doc.child(2)]);
		return EditorState.create({ doc, plugins: [structuralGuard()] });
	}

	it('refuses an edit inside the locked slide', () => {
		const state = withLockedMiddle();
		const typed = state.apply(state.tr.insertText('X', slidePos(state, 1) + 3));
		expect(typed.doc).toBe(state.doc);
	});

	it('refuses a cross-slide delete that would consume the locked slide', () => {
		const state = withLockedMiddle();
		const sel = TextSelection.between(state.doc.resolve(slidePos(state, 0) + 3), state.doc.resolve(slidePos(state, 2) + 3));
		const selected = state.apply(state.tr.setSelection(sel));
		const deleted = selected.apply(selected.tr.deleteSelection());
		expect(deleted.doc).toBe(selected.doc); // locked wins over the deliberate selection
	});

	it('still allows an explicit slideOp to remove it (the rail delete)', () => {
		const state = withLockedMiddle();
		const removed = state.apply(state.tr.delete(slidePos(state, 1), slidePos(state, 1) + state.doc.child(1).nodeSize).setMeta('slideOp', true));
		expect(removed.doc.childCount).toBe(2);
	});
});

// The destructive half of #1650, caught by the Munger inversion pass before merge.
//
// Every rule in the guard reasons about the author's CURRENT selection, and an undo
// has no such intent to read — it restores a state the guard already approved. Judging
// it by whatever caret happens to be sitting there was a category error with teeth:
// after ⌘A ⌘A Delete the selection is a collapsed caret in the one remaining slide, so
// the restore looked exactly like an accidental merge and was filtered. The deck wipe
// stood, undo did nothing, and StudioShell persists the source on a debounce — so the
// empty deck reached localStorage with no automatic checkpoint behind it.
describe('structuralGuard — undo and redo are never filtered', () => {
	const withHistory = (source = THREE) => EditorState.create({ doc: deckToDoc(source), plugins: [structuralGuard(), history()] });

	it('select-all-twice then Delete is undoable — the deck comes back whole', () => {
		let state = withHistory();
		state = state.apply(state.tr.setSelection(new AllSelection(state.doc)));
		state = state.apply(state.tr.deleteSelection());
		expect(state.doc.childCount).toBe(1);
		undo(state, (tr) => {
			state = state.apply(tr);
		});
		expect(state.doc.childCount).toBe(3);
		expect(state.doc.textContent).toContain('body one');
		expect(state.doc.textContent).toContain('body three');
	});

	it('a cross-slide drag-delete is undoable', () => {
		let state = withHistory();
		const sel = TextSelection.between(state.doc.resolve(slidePos(state, 0) + 3), state.doc.resolve(slidePos(state, 1) + 3));
		state = state.apply(state.tr.setSelection(sel));
		state = state.apply(state.tr.deleteSelection());
		expect(state.doc.childCount).toBeLessThan(3);
		undo(state, (tr) => {
			state = state.apply(tr);
		});
		expect(state.doc.childCount).toBe(3);
	});

	it('redo re-applies it', () => {
		let state = withHistory();
		state = state.apply(state.tr.setSelection(new AllSelection(state.doc)));
		state = state.apply(state.tr.deleteSelection());
		undo(state, (tr) => {
			state = state.apply(tr);
		});
		expect(state.doc.childCount).toBe(3);
		redo(state, (tr) => {
			state = state.apply(tr);
		});
		expect(state.doc.childCount).toBe(1);
	});

	it('an explicit slideOp removal is undoable too — the hole predated the select-all path', () => {
		let state = withHistory();
		state = state.apply(state.tr.delete(slidePos(state, 1), slidePos(state, 1) + state.doc.child(1).nodeSize).setMeta('slideOp', true));
		expect(state.doc.childCount).toBe(2);
		undo(state, (tr) => {
			state = state.apply(tr);
		});
		expect(state.doc.childCount).toBe(3);
	});
});
