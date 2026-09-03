import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc } from '@/lib/compose/deck-doc';
import { collapseKey, collapsePlugin, structuralGuard } from './ComposeView';

// Finding 3: collapse is a POSITION-keyed node decoration, but SlideView.commit rebuilds the
// whole doc via one full-content replace step — mapping the decoration through it used to DROP
// it, so a collapsed slide popped open on every move/insert/delete. The plugin now re-establishes
// collapse by NODE IDENTITY on a `slideOp` transaction. These tests lock that in.

const THREE = ['<!-- _class: content -->\n\n# One\n\nbody one', '<!-- _class: content -->\n\n# Two\n\nbody two', '<!-- _class: content -->\n\n# Three\n\nbody three'].join('\n\n---\n\n');

function make() {
	return EditorState.create({ doc: deckToDoc(THREE), plugins: [collapsePlugin()] });
}
// Position immediately before top-level slide `i`.
function slidePos(state: EditorState, i: number): number {
	let pos = 0;
	for (let k = 0; k < i; k++) pos += state.doc.child(k).nodeSize;
	return pos;
}
function collapsed(state: EditorState): PMNode[] {
	const set = collapseKey.getState(state);
	const out: PMNode[] = [];
	if (!set) return out;
	for (const d of set.find()) {
		const n = state.doc.nodeAt(d.from);
		if (n) out.push(n);
	}
	return out;
}
function reorder(state: EditorState, i: number, j: number): EditorState {
	const nodes: PMNode[] = [];
	state.doc.forEach((n) => { nodes.push(n); });
	[nodes[i], nodes[j]] = [nodes[j], nodes[i]];
	return state.apply(state.tr.replaceWith(0, state.doc.content.size, nodes).setMeta('slideOp', true));
}

describe('collapse state survives structural ops (Finding 3)', () => {
	it('a collapsed slide stays collapsed — and follows its node — across a reorder', () => {
		let state = make();
		const target = state.doc.child(1); // collapse slide "Two"
		state = state.apply(state.tr.setMeta(collapseKey, { pos: slidePos(state, 1) }));
		expect(collapsed(state)).toEqual([target]); // it's collapsed

		state = reorder(state, 0, 1); // move "Two" to the front
		// Without the identity fix the decoration is dropped here → collapsed() would be empty.
		expect(collapsed(state)).toEqual([target]); // SAME node instance, still collapsed
		expect(state.doc.child(0)).toBe(target); // and it did move to the front
	});

	it('a collapsed slide survives deleting a DIFFERENT slide', () => {
		let state = make();
		const target = state.doc.child(2); // collapse "Three"
		state = state.apply(state.tr.setMeta(collapseKey, { pos: slidePos(state, 2) }));
		// delete slide 0 via a slideOp (like SlideView.remove)
		const nodes: PMNode[] = [];
		state.doc.forEach((n) => { nodes.push(n); });
		nodes.splice(0, 1);
		state = state.apply(state.tr.replaceWith(0, state.doc.content.size, nodes).setMeta('slideOp', true));
		expect(collapsed(state)).toEqual([target]); // "Three" still collapsed
	});

	it('an uncollapsed reorder collapses nothing (no spurious decorations)', () => {
		let state = make();
		state = reorder(state, 0, 2);
		expect(collapsed(state)).toEqual([]);
	});
});

// ADJACENT FOLDS. `DecorationSet.find(from, to)` returns everything that OVERLAPS the range,
// and a slide's node decoration ends exactly where the next slide's begins — so the toggle's
// old `find(pos, pos + 1)` matched the PREVIOUS slide. Folding slide 0 and then slide 1
// unfolded slide 0 and left slide 1 open, in two clicks on the shipped surface. Neither the
// three collapse oracles (which fold indices 3, 3 and 5) nor the fuzz walk could see it: the
// walk compares `aria-expanded` against the `cs-collapsed` class, and both read this same
// decoration set, so they agree while being jointly wrong.
describe('folding a slide next to a folded one (the neighbor-match bug)', () => {
	it('folds BOTH when two adjacent slides are toggled in turn', () => {
		let state = make();
		const first = state.doc.child(0);
		const second = state.doc.child(1);
		state = state.apply(state.tr.setMeta(collapseKey, { pos: slidePos(state, 0) }));
		expect(collapsed(state)).toEqual([first]);
		state = state.apply(state.tr.setMeta(collapseKey, { pos: slidePos(state, 1) }));
		// Before the fix this was `[second]` — slide 0 silently popped open.
		expect(collapsed(state)).toEqual([first, second]);
	});

	it('still toggles a slide OFF when it is the one addressed', () => {
		let state = make();
		state = state.apply(state.tr.setMeta(collapseKey, { pos: slidePos(state, 1) }));
		expect(collapsed(state)).toHaveLength(1);
		state = state.apply(state.tr.setMeta(collapseKey, { pos: slidePos(state, 1) }));
		expect(collapsed(state)).toEqual([]);
	});
});

// Finding 1's premise: a transaction the structural guard REJECTS leaves the doc unchanged even
// though `tr.docChanged` is still true. The emit path must therefore key on the APPLIED doc
// (`next.doc !== prevDoc`), not `tr.docChanged` — else a rejected keystroke would clear a parked
// external resync and silently drop an external edit.
describe('a rejected edit leaves the doc unchanged though tr.docChanged is true (Finding 1)', () => {
	it('typing into a locked slide is filtered — same doc, but the tr reports docChanged', () => {
		// A table no longer locks (modeled + round-trippable); inline math still does.
		const src = '<!-- _class: content -->\n\n# Locked\n\nThe area is $A = \\pi r^2$ here.';
		const state = EditorState.create({ doc: deckToDoc(src), plugins: [structuralGuard()] });
		expect(state.doc.child(0).attrs.locked).toBe(true);
		// caret inside the locked slide, then type a character
		let at = -1;
		state.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text?.includes('Locked')) at = pos + 1;
			return true;
		});
		const withCaret = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
		const tr = withCaret.tr.insertText('x');
		expect(tr.docChanged).toBe(true); // the transaction DID change its own doc…
		const next = withCaret.apply(tr);
		expect(next.doc).toBe(withCaret.doc); // …but the guard rejected it → applied doc is identical
	});
});
