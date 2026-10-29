// LIST STATE MARKERS — the write behind a pick in the marker picker (MarkerPicker.tsx): replace the three bytes of a list
// item's leading `[x]` with another of the six, and nothing else. Pure: no DOM, no React.
//
//   · The position is re-read at write time: the marker must still be there (an outside change may have moved or removed it),
//     or the command refuses rather than writing three bytes over the author's words.
//   · Only the six registry markers are written (lib/plugins/checks/shared/registry.js MARKERS); `[X]` is not one of them.
//   · A locked slide never changes.

import type { Command } from 'prosemirror-state';
import { readEditMarker } from '../../../../lib/core/cell-marker-edit.mjs';
// A DEFAULT import: it is a CommonJS leaf (docs/src/plugins/vite-cjs-lib-dev.mjs).
import stateMarks from '../../../../lib/plugins/checks/shared/registry.js';

const TOKENS = new Set((stateMarks.MARKERS as readonly string[]).map((m) => `[${m}]`));

/** Set the marker whose `[` is at `pos` to `token` (`[!]`). One transaction, so one undo step. */
export function setListMarker(pos: number, token: string): Command {
	return (state, dispatch) => {
		if (!TOKENS.has(token)) return false;
		if (pos < 0 || pos + 3 > state.doc.content.size) return false;
		const $pos = state.doc.resolve(pos);
		if ($pos.depth < 1 || $pos.node(1)?.attrs.locked) return false;
		// The marker leads its paragraph's text, so it is the first three characters of the textblock.
		if (!$pos.parent.isTextblock || $pos.parentOffset !== 0) return false;
		const lead = $pos.parent.firstChild;
		if (!lead?.isText || !readEditMarker(lead.text ?? '')) return false;
		if (dispatch) dispatch(state.tr.insertText(token, pos, pos + 3));
		return true;
	};
}
