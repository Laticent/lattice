import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc } from '@/lib/compose/deck-doc';
import { refinableRange } from './ComposeView';

// Which selections Refine may rewrite in Compose (2026-11-10-compose-first.md §1.1). The rewrite replaces the range
// as one run of plain text, so anything that run cannot carry (an inline object, a line break, a second style) must
// make the selection ineligible rather than be dropped. The first cut judged EVERY node `nodesBetween` visits,
// ancestors included, so the slide itself failed and Refine was never offered: compose-refine.spec.ts found it in a
// browser. These pin both directions on the real deck model.

/** A state over `deck` with the selection on the first occurrence of `text` (or from `text` to `until`). */
function selecting(deck: string, text: string, until?: string): EditorState {
	const doc = deckToDoc(deck);
	const at = (needle: string): number => {
		let found = -1;
		doc.descendants((n: PMNode, pos: number) => {
			if (found >= 0) return false;
			if (n.isText) {
				const i = (n.text ?? '').indexOf(needle);
				if (i >= 0) found = pos + i;
			}
			return true;
		});
		if (found < 0) throw new Error(`"${needle}" is not in the document`);
		return found;
	};
	const from = at(text);
	const to = until === undefined ? from + text.length : at(until) + until.length;
	const state = EditorState.create({ doc });
	return state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)));
}

describe('refinableRange', () => {
	it('offers plain text in one paragraph', () => {
		expect(refinableRange(selecting('# Title\n\nAlpha beta gamma delta.\n', 'beta gamma'))).not.toBeNull();
	});

	it('offers text that is all in one style', () => {
		expect(refinableRange(selecting('# Title\n\nKeep **this one** exactly.\n', 'this one'))).not.toBeNull();
	});

	it('refuses a run that mixes styles, which one rewrite would flatten', () => {
		expect(refinableRange(selecting('# Title\n\nKeep **this** exactly.\n', 'Keep', 'exactly'))).toBeNull();
	});

	it('refuses a run across a line break, which the model never sees', () => {
		expect(refinableRange(selecting('# Title\n\nLine one  \nline two\n', 'one', 'line two'))).toBeNull();
	});

	it('refuses an empty caret', () => {
		const state = selecting('# Title\n\nAlpha beta.\n', 'beta');
		const caret = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from)));
		expect(refinableRange(caret)).toBeNull();
	});

	it('refuses a selection that spans two blocks', () => {
		expect(refinableRange(selecting('# Title\n\nFirst para.\n\nSecond para.\n', 'para', 'Second'))).toBeNull();
	});
});
