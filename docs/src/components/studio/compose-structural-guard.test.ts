import { AllSelection, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, emitDeck, initBaseline } from '@/lib/compose/deck-doc';
import { FILO_HISTORY, historyTransaction, isFiloHistory } from '@/lib/compose/filo-history';
import { selectSlideThenDeck } from '@/lib/compose/selection-commands';
import { History } from '@/lib/filo';
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
// Since Filo slice 4 the undo is not ProseMirror's: Filo hands Compose the text an undo produced,
// and Compose applies it as one `FILO_HISTORY` transaction (filo-history.ts `historyTransaction`).
// The guard must wave THAT through, or the wipe comes back. This harness is that path: the emit is
// recorded on a Filo history, the undo's text is applied through `historyTransaction`, and the
// assertion reads the APPLIED state, so a guard that filtered it would leave the wipe standing.
describe('structuralGuard — a Filo undo or redo is never filtered', () => {
	function harness(source = THREE) {
		let state = EditorState.create({ doc: deckToDoc(source), plugins: [structuralGuard()] });
		const base = initBaseline(state.doc);
		let emitted = emitDeck(state.doc, base);
		const h = new History('deck', emitted);
		return {
			get state() {
				return state;
			},
			/** An author transaction: applied (or filtered) by the guard, then emitted to Filo. */
			edit(tr: Transaction) {
				const next = state.apply(tr);
				if (next.doc !== state.doc) {
					emitted = emitDeck(next.doc, base);
					h.commit({ base: h.head, next: emitted, label: 'Typing', origin: 'compose' });
				}
				state = next;
			},
			move(verb: 'undo' | 'redo') {
				const m = verb === 'undo' ? h.undo() : h.redo();
				if (!m) throw new Error(`nothing to ${verb}`);
				const r = historyTransaction(state, base, emitted, m.text);
				if (!r) throw new Error('no history transaction');
				expect(isFiloHistory(r.tr)).toBe(true);
				state = state.apply(r.tr);
				r.commit(state.doc);
				emitted = emitDeck(state.doc, base);
				expect(emitted, 'Compose shows exactly the text the undo produced').toBe(m.text);
			},
		};
	}

	it('select-all-twice then Delete is undoable — the deck comes back whole', () => {
		const t = harness();
		t.edit(t.state.tr.setSelection(new AllSelection(t.state.doc)));
		t.edit(t.state.tr.deleteSelection());
		expect(t.state.doc.childCount).toBe(1);
		t.move('undo');
		expect(t.state.doc.childCount).toBe(3);
		expect(t.state.doc.textContent).toContain('body one');
		expect(t.state.doc.textContent).toContain('body three');
	});

	it('a cross-slide drag-delete is undoable', () => {
		const t = harness();
		t.edit(t.state.tr.setSelection(TextSelection.between(t.state.doc.resolve(slidePos(t.state, 0) + 3), t.state.doc.resolve(slidePos(t.state, 1) + 3))));
		t.edit(t.state.tr.deleteSelection());
		expect(t.state.doc.childCount).toBeLessThan(3);
		t.move('undo');
		expect(t.state.doc.childCount).toBe(3);
	});

	it('redo re-applies it', () => {
		const t = harness();
		t.edit(t.state.tr.setSelection(new AllSelection(t.state.doc)));
		t.edit(t.state.tr.deleteSelection());
		t.move('undo');
		expect(t.state.doc.childCount).toBe(3);
		t.move('redo');
		expect(t.state.doc.childCount).toBe(1);
	});

	it('an explicit slideOp removal is undoable too — the hole predated the select-all path', () => {
		const t = harness();
		t.edit(t.state.tr.delete(slidePos(t.state, 1), slidePos(t.state, 1) + t.state.doc.child(1).nodeSize).setMeta('slideOp', true));
		expect(t.state.doc.childCount).toBe(2);
		t.move('undo');
		expect(t.state.doc.childCount).toBe(3);
	});

	it('witness: the same restore WITHOUT the mark is refused (so the tests above prove the mark)', () => {
		const t = harness();
		t.edit(t.state.tr.setSelection(new AllSelection(t.state.doc)));
		t.edit(t.state.tr.deleteSelection());
		const before = t.state;
		const r = historyTransaction(t.state, initBaseline(t.state.doc), emitDeck(t.state.doc, initBaseline(t.state.doc)), THREE);
		if (!r) throw new Error('no transaction');
		r.tr.setMeta(FILO_HISTORY, false);
		expect(before.apply(r.tr).doc.childCount, 'the guard judged an unmarked restore by the caret').toBe(1);
	});
});
