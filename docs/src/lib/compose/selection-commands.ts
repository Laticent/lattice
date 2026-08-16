import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { AllSelection, type Command, NodeSelection, type Selection, TextSelection } from 'prosemirror-state';

// Selection + structural-edit rules for Compose (#1650).
//
// Compose is ONE ProseMirror document — `doc → slide+` — so a selection can natively
// span slides. What was missing is the vocabulary an author expects on top of that:
// ⌘A meaning "this slide" before it means "everything", and a selection that crosses a
// slide boundary actually being deletable.
//
// These live here rather than in ComposeView so they can be exercised against a real
// document without mounting an editor (the same split `table-commands.ts` uses).

/** The doc-relative range of the slide containing `$pos`, or null at doc level. */
function slideRange($pos: ResolvedPos): { start: number; end: number } | null {
	if ($pos.depth < 1) return null;
	return { start: $pos.before(1), end: $pos.after(1) };
}

/**
 * Does this selection deliberately cross a slide boundary?
 *
 * The question the structural guard needs answered. An EMPTY selection never does —
 * a caret sitting at the join between two slides is exactly the accident the guard
 * exists to prevent (one Backspace silently merging two slides). A NON-EMPTY selection
 * whose ends sit in different slides is the opposite: the author dragged across the
 * boundary, or pressed ⌘A twice, and then pressed a destructive key.
 */
export function selectionSpansSlides(selection: Selection): boolean {
	if (selection.empty) return false;
	// AllSelection covers the whole document by construction.
	if (selection instanceof AllSelection) return true;
	// A NodeSelection on a slide is the one shape that removes a whole slide without
	// crossing a boundary — deliberate all the same.
	if (selection instanceof NodeSelection && selection.node.type.name === 'slide') return true;
	const from = slideRange(selection.$from);
	const to = slideRange(selection.$to);
	if (!from || !to) return true; // resolved at doc level → not scoped to one slide
	return from.start !== to.start;
}

/**
 * ⌘A / Ctrl-A — select THIS SLIDE first, the whole deck on a second press.
 *
 * Escalating select-all, the same shape an editor uses for expand-selection: the first
 * press takes the scope you are working in, a second press takes everything. Scoping the
 * first press matters here because the second one is genuinely deck-wide — Compose holds
 * every slide in one document, so an unscoped ⌘A followed by a keystroke would replace
 * the entire deck, and nothing on screen would have suggested that was the scope.
 *
 * Returns FALSE once the current slide is already fully selected, which is what makes the
 * second press work: the command chain falls through to `baseKeymap`'s own `selectAll`.
 * It also returns false when the selection already spans slides, so ⌘A on a cross-slide
 * selection widens to everything rather than collapsing back into one slide.
 */
export const selectSlideThenDeck: Command = (state, dispatch) => {
	const { selection } = state;
	if (selection instanceof AllSelection) return false;
	if (selectionSpansSlides(selection)) return false;
	const range = slideRange(selection.$from);
	if (!range) return false;
	// `between` lands on real textblock positions inside the slide — `start + 1` is the
	// slide's opening boundary, not yet a place a text selection can sit.
	const whole = TextSelection.between(state.doc.resolve(range.start + 1), state.doc.resolve(range.end - 1));
	if (selection.from === whole.from && selection.to === whole.to) return false; // already whole → escalate
	if (dispatch) dispatch(state.tr.setSelection(whole).scrollIntoView());
	return true;
};

/**
 * Does this transaction modify or remove a LOCKED slide?
 *
 * Identity, not index: a transaction that changes the slide COUNT shifts every slide
 * after the edit, so an index-for-index comparison would report all of them as changed.
 * A slide node ProseMirror carried through untouched is the same object on both sides —
 * which is exactly the property a locked slide needs, since it must reach the emitter
 * byte-identical (it carries a construct Compose cannot round-trip).
 */
export function touchesLockedSlide(oldDoc: PMNode, newDoc: PMNode): boolean {
	const survivors = new Set<PMNode>();
	newDoc.forEach((node) => {
		survivors.add(node);
	});
	let touched = false;
	oldDoc.forEach((node) => {
		if (node.attrs.locked && !survivors.has(node)) touched = true;
	});
	return touched;
}
