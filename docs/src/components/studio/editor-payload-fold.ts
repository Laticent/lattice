// A PICTURE'S BYTES, FOLDED TO A CHIP. A deck can carry a photo inline (`![bg](data:image/jpeg;base64,…)`), and a phone
// photo is about 5 MB of base64 on one line. CodeMirror lays out every character of the lines on screen, so a photo deck
// held Firefox's main thread for about 7 s in layout alone each time the deck landed (PR #3153, Gecko profile), and the
// line is unreadable anyway. Here each long payload is shown as a chip with its size; the text is unchanged, so the
// autosave, the preview, every export and a copy of the line carry the whole picture, and the caret steps over the chip
// as one unit. What counts as a payload is lint's own definition (lib/core/payload-elision.js `payloadRanges`), so
// the editor folds exactly what the lint skips.
//
// Incremental: an edit rescans only the lines it touched, so typing elsewhere never reads a photo again.
import { type EditorState, type Extension, RangeSetBuilder, StateField, type Text } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { payloadRanges } from '@/lib/payload-elision';

/** "5.1 MB", "812 KB": the payload's size as bytes once decoded (four base64 characters carry three bytes). */
export function payloadSize(chars: number, padding = 0): string {
	const bytes = Math.max(0, Math.floor((chars * 3) / 4) - padding);
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

class PayloadChip extends WidgetType {
	constructor(readonly label: string) {
		super();
	}
	eq(other: PayloadChip) {
		return other.label === this.label;
	}
	toDOM() {
		const chip = document.createElement('span');
		chip.className = 'cm-payload-chip';
		chip.textContent = this.label;
		chip.title = 'Encoded picture data, hidden here. It stays in the deck: copying or deleting the line takes all of it.';
		return chip;
	}
	ignoreEvent() {
		return false;
	}
}

function chipFor(doc: Text, from: number, to: number) {
	const tail = doc.sliceString(Math.max(from, to - 2), to);
	const padding = tail.endsWith('==') ? 2 : tail.endsWith('=') ? 1 : 0;
	return Decoration.replace({ widget: new PayloadChip(`${payloadSize(to - from, padding)} of picture data`) });
}

/** The folds in `[from, to)` of the document, scanned from that slice only. */
function scan(doc: Text, from: number, to: number): Array<[number, number]> {
	return payloadRanges(doc.sliceString(from, to)).map(([a, b]) => [from + a, from + b]);
}

function build(doc: Text, ranges: Array<[number, number]>): DecorationSet {
	const b = new RangeSetBuilder<Decoration>();
	for (const [a, z] of ranges) b.add(a, z, chipFor(doc, a, z));
	return b.finish();
}

const folds = StateField.define<DecorationSet>({
	create: (state: EditorState) => build(state.doc, scan(state.doc, 0, state.doc.length)),
	update(deco, tr) {
		if (!tr.docChanged) return deco;
		let next = deco.map(tr.changes);
		const doc = tr.state.doc;
		const added: Array<[number, number]> = [];
		// Each touched region, widened to whole lines: a payload never spans a line, and an edit can start or end one.
		let lastTo = -1;
		tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
			const from = Math.max(doc.lineAt(fromB).from, lastTo);
			const to = doc.lineAt(toB).to;
			if (to <= from) return;
			lastTo = to;
			next = next.update({ filterFrom: from, filterTo: to, filter: (a, z) => z < from || a > to });
			added.push(...scan(doc, from, to));
		});
		return added.length ? next.update({ add: added.map(([a, z]) => chipFor(doc, a, z).range(a, z)), sort: true }) : next;
	},
	provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
});

const chipTheme = EditorView.baseTheme({
	'.cm-payload-chip': {
		display: 'inline-block',
		padding: '0 0.4em',
		borderRadius: '0.3em',
		background: 'var(--bg-alt)',
		border: '1px solid var(--border)',
		color: 'var(--text-muted)',
		fontSize: '0.85em',
		whiteSpace: 'nowrap',
		cursor: 'default',
	},
});

/** Fold every long base64 payload in the editor to a chip with its size. */
export function payloadFold(): Extension {
	return [folds, chipTheme];
}
