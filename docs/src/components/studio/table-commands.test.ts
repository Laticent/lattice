import { Fragment } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { deleteTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck } from '@/lib/compose/deck-doc';
import { currentColumnAlign, setColumnAlign, stripCellSpans, tabToNextCellOrAddRow } from '@/lib/compose/table-commands';

// The table CHROME commands, state-tested (no browser) the way the register/collapse suites are.
// These are the behaviors the round-trip fixtures don't exercise — the adversarial trio flagged
// them as uncovered.

const TABLE = '<!-- _class: compare-table -->\n\n## T\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';

function harness(src: string) {
	let state = EditorState.create({ doc: deckToDoc(src), schema: deckSchema });
	const view = {
		get state() {
			return state;
		},
		dispatch(tr: Parameters<typeof state.apply>[0]) {
			state = state.apply(tr);
		},
		focus() {},
	} as unknown as EditorView;
	const count = (type: string) => {
		let n = 0;
		state.doc.descendants((node) => {
			if (node.type.name === type) n++;
			return true;
		});
		return n;
	};
	return {
		view,
		count,
		src: () => docToDeck(state.doc),
		get state() {
			return state;
		},
		// Put the caret one char into the first text node containing `needle`.
		caret(needle: string) {
			let at = -1;
			state.doc.descendants((node, pos) => {
				if (at >= 0) return false;
				if (node.isText && node.text?.includes(needle)) {
					at = pos + 1;
					return false;
				}
				return true;
			});
			if (at < 0) throw new Error(`caret target not found: ${needle}`);
			state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
		},
	};
}

describe('table chrome commands', () => {
	it('setColumnAlign centers the caret column and it serializes to `:---:`', () => {
		const t = harness(TABLE);
		t.caret('B'); // header of column 2
		setColumnAlign('center')(t.state, t.view.dispatch);
		expect(t.src()).toContain('| --- | :---: |'); // only column 2 centered
	});

	it('currentColumnAlign reads back what setColumnAlign wrote', () => {
		const t = harness(TABLE);
		t.caret('1'); // column 1
		expect(currentColumnAlign(t.state)).toBe(null);
		setColumnAlign('right')(t.state, t.view.dispatch);
		t.caret('1');
		expect(currentColumnAlign(t.state)).toBe('right');
	});

	it('Tab at the LAST cell appends a row and steps into it (the advertised affordance)', () => {
		const t = harness(TABLE);
		const rowsBefore = t.count('table_row'); // header + 1 body = 2
		t.caret('2'); // last cell of the single body row
		const handled = tabToNextCellOrAddRow(t.state, t.view.dispatch, t.view);
		expect(handled).toBe(true);
		expect(t.count('table_row')).toBe(rowsBefore + 1); // a row was appended
	});

	it('Tab in a NON-last cell just moves (no new row)', () => {
		const t = harness(TABLE);
		const rowsBefore = t.count('table_row');
		t.caret('1'); // first body cell — has a next cell
		tabToNextCellOrAddRow(t.state, t.view.dispatch, t.view);
		expect(t.count('table_row')).toBe(rowsBefore); // no append
	});

	it('Tab OUTSIDE a table returns false (falls through to list-item sink)', () => {
		const t = harness('<!-- _class: content -->\n\n- one\n- two');
		t.caret('two');
		expect(tabToNextCellOrAddRow(t.state, t.view.dispatch, t.view)).toBe(false);
	});

	it('deleteTable leaves a valid, editable slide (no dead-end empty slide) and drops the grid', () => {
		const t = harness(TABLE);
		t.caret('1');
		deleteTable(t.state, t.view.dispatch);
		expect(() => t.state.doc.check()).not.toThrow();
		expect(t.count('table')).toBe(0);
		expect(t.src()).not.toContain('| A | B |');
	});

	it('stripCellSpans clamps a merged (colspan/rowspan) cell to 1×1 (paste guard)', () => {
		const cell = deckSchema.nodes.table_cell.create({ colspan: 2, rowspan: 3, colwidth: [80, 80] }, deckSchema.text('x'));
		const [out] = stripCellSpans(Fragment.from(cell)).content as unknown as [{ attrs: Record<string, unknown> }];
		expect(out.attrs.colspan).toBe(1);
		expect(out.attrs.rowspan).toBe(1);
		expect(out.attrs.colwidth).toBe(null);
	});
});
