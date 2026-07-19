import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
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

// ── LFM state markers (obligation-matrix / roadmap cells) ───────────────────────
// The four markers the engine renders as stoplight chips: `[x]` pass, `[-]` partial/warn,
// `[ ]` todo, `[/]` skip (LFM-1.0 §3.2). The picker sets them so authors don't type the syntax.
const CELL_MARKER = /^\[([x\-/ ])\]\s?/; // a leading marker + its optional trailing space

/** The marker CHAR (`x`/`-`/`/`/` `) at the start of the caret's cell, or null. Drives the picker. */
export function currentCellMarker(state: EditorState): string | null {
	if (!isInTable(state)) return null;
	const p = state.selection.$from.parent;
	if (p.type.name !== 'table_cell' && p.type.name !== 'table_header') return null;
	const m = /^\[([x\-/ ])\]/.exec(p.textContent);
	return m ? m[1] : null;
}

/** Set (or clear, with null) the LFM state marker at the START of the caret's cell, preserving any
 *  trailing text (`[x] Signal taxonomy`). `marker` is the full token, e.g. `[x]`. */
export function setCellMarker(marker: string | null): Command {
	return (state, dispatch) => {
		if (!isInTable(state)) return false;
		const { $from } = state.selection;
		const p = $from.parent;
		if (p.type.name !== 'table_cell' && p.type.name !== 'table_header') return false;
		if (dispatch) {
			const cellStart = $from.start(); // first inline position in the cell
			const m = CELL_MARKER.exec(p.textContent);
			const existing = m ? m[0].length : 0;
			const tr = state.tr;
			if (marker) tr.insertText(`${marker} `, cellStart, cellStart + existing);
			else if (existing) tr.delete(cellStart, cellStart + existing);
			dispatch(tr);
		}
		return true;
	};
}

/** Insert a starter 2×2 GFM table (a header row + one body row) at the caret: replacing an empty
 *  paragraph, else inserted after the caret's top-level block. Bails inside an existing table (use
 *  the table controls) or outside a slide. */
export const insertStarterTable: Command = (state, dispatch) => {
	const { $from } = state.selection;
	if ($from.depth < 2 || $from.node(1).type.name !== 'slide' || isInTable(state)) return false;
	const s = state.schema;
	if (!s.nodes.table) return false;
	if (dispatch) {
		const th = s.nodes.table_header.createAndFill();
		const td = s.nodes.table_cell.createAndFill();
		if (!th || !td) return true;
		const table = s.nodes.table.create(null, [s.nodes.table_row.create(null, [th, th]), s.nodes.table_row.create(null, [td, td])]);
		const before = $from.before(2);
		const after = $from.after(2);
		const block = $from.node(1).child($from.index(1));
		const empty = block.type.name === 'paragraph' && block.content.size === 0;
		const at = empty ? before : after;
		const tr = empty ? state.tr.replaceWith(before, after, table) : state.tr.insert(after, table);
		tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
		dispatch(tr.scrollIntoView());
	}
	return true;
};
