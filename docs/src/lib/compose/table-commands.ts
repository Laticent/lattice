import { Fragment, type Node as PMNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { addRowAfter, goToNextCell, isInTable, selectedRect } from 'prosemirror-tables';

// Pure table editing commands for Compose — no DOM, no React. Shared by the editor's keymap /
// paste guard (ComposeView) and the divider-bar table controls (TableControls), so neither
// re-implements them and there's no circular import. Design: 2026-07-19-compose-table-editing.md.

export type ColAlign = 'left' | 'center' | 'right' | null;

/** The caret column's GFM alignment, read from its top cell — drives the align pressed-state. */
export function currentColumnAlign(state: EditorState): ColAlign {
	if (!isInTable(state)) return null;
	try {
		const rect = selectedRect(state);
		const rel = rect.map.map[rect.top * rect.map.width + rect.left];
		return (state.doc.nodeAt(rect.tableStart + rel)?.attrs.align as ColAlign) ?? null;
	} catch {
		return null;
	}
}

/** Set GFM column alignment on every cell of the caret's column (so it renders consistently and
 *  the header cell — which the serializer reads — carries it). `null` clears it. */
export function setColumnAlign(align: ColAlign): Command {
	return (state, dispatch) => {
		if (!isInTable(state)) return false;
		if (dispatch) {
			const rect = selectedRect(state);
			const tr = state.tr;
			const seen = new Set<number>();
			for (let col = rect.left; col < rect.right; col++) {
				for (let row = 0; row < rect.map.height; row++) {
					const rel = rect.map.map[row * rect.map.width + col];
					if (seen.has(rel)) continue; // a merged cell appears once per span; forbidden here, deduped anyway
					seen.add(rel);
					const pos = rect.tableStart + rel;
					const cell = tr.doc.nodeAt(pos);
					if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align });
				}
			}
			dispatch(tr);
		}
		return true;
	};
}

// Clamp a pasted slice to the GFM-expressible table shape: strip cell spans (colspan/rowspan/
// colwidth) so a MERGED cell pasted from Excel / a web page / Google Sheets can't enter the doc
// and later serialize to a corrupted, ragged grid. The design's no-merge rule (Axis B) is enforced
// on the toolbar; this closes the paste path the toolbar can't see (adversarial-trio gap). The
// span is dropped to 1×1 — content is preserved in one cell; `fixTables` fills any resulting hole
// with empty cells, so the grid stays rectangular and round-trips.
export function stripCellSpans(fragment: Fragment): Fragment {
	const out: PMNode[] = [];
	fragment.forEach((node) => {
		const content = stripCellSpans(node.content);
		if ((node.type.name === 'table_cell' || node.type.name === 'table_header') && (node.attrs.colspan !== 1 || node.attrs.rowspan !== 1 || node.attrs.colwidth)) {
			out.push(node.type.create({ ...node.attrs, colspan: 1, rowspan: 1, colwidth: null }, content, node.marks));
		} else {
			out.push(node.copy(content));
		}
	});
	return Fragment.fromArray(out);
}

// Tab inside a table: hop to the next cell, and at the LAST cell append a row and step into it —
// the behavior a table editor is expected to have (`prosemirror-tables`' `goToNextCell` alone does
// NOT append; it just returns false at the end). Outside a table it returns false so Tab falls
// through to list-item sink.
export const tabToNextCellOrAddRow: Command = (state, dispatch, view) => {
	if (goToNextCell(1)(state, dispatch, view)) return true;
	if (!isInTable(state)) return false;
	if (dispatch && view) {
		addRowAfter(state, dispatch);
		goToNextCell(1)(view.state, view.dispatch, view);
	}
	return true;
};
