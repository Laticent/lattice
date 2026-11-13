import { type EditorState, type Extension, type Range, StateField, type Text } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

// A PASTED PHOTO IN THE DECK SOURCE, without the freeze. A phone photo inlined as a `data:` address is one line of about
// 4.5 MB of base64. Measured on a deck of three (docs/e2e/export-photo-size.spec.ts) in Chromium, before this module:
//   · the browser inserted the 14 MB of text into the editor's DOM and laid it out before CodeMirror read it back
//     (`TypingCommand::InsertText`, 11.6 s, 8.2 s of it shaping text);
//   · every later layout of a photo line in view shaped megabytes of one wrapped line again.
// Two extensions, one each:
//   · `largeInsert` takes a large typed insertion (an IME commit, dictation, an automation's `insertText`) as ONE
//     transaction, the way CodeMirror already takes a paste, so the browser never lays the raw text out.
//   · `photoChips` shows each long base64 payload as a short chip ("image data · 3.4 MB"). The text is untouched: the
//     chip is a view of it, copy and save carry every byte, and the caret steps over it as one character.
// The linter does the same for its own reads (lib/authoring/data-uri-mask.mjs, whose MIN_PAYLOAD this mirrors).

/** The shortest base64 payload shown as a chip, in characters. lib/authoring/data-uri-mask.mjs masks from the same length. */
export const CHIP_MIN_PAYLOAD = 4096;
/** A typed insertion this long or longer is applied by the editor, not by the browser's DOM editing. */
export const LARGE_INSERT = 65_536;

const MARK = ';base64,';
const PAYLOAD = /[A-Za-z0-9+/]*/y;

/** The [from, to) offsets, within `text`, of every base64 payload of at least CHIP_MIN_PAYLOAD characters. */
export function longPayloads(text: string): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	if (text.length < CHIP_MIN_PAYLOAD) return out;
	for (let at = text.indexOf(MARK); at >= 0; at = text.indexOf(MARK, at + 1)) {
		const from = at + MARK.length;
		PAYLOAD.lastIndex = from;
		const end = from + (PAYLOAD.exec(text)?.[0].length ?? 0);
		if (end - from < CHIP_MIN_PAYLOAD) continue;
		out.push([from, end]);
		at = end - 1;
	}
	return out;
}

/** "3.4 MB", "820 KB": the decoded size of `chars` base64 characters. */
export function payloadSize(chars: number): string {
	const bytes = Math.floor((chars * 3) / 4);
	return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

class PhotoChip extends WidgetType {
	constructor(readonly chars: number) {
		super();
	}
	eq(other: PhotoChip) {
		return other.chars === this.chars;
	}
	toDOM() {
		const el = document.createElement('span');
		el.className = 'cm-photo-chip';
		el.textContent = `image data · ${payloadSize(this.chars)}`;
		el.title = 'The image data stays in the deck. Select the line to copy it, or delete the image to remove it.';
		return el;
	}
	ignoreEvent() {
		return false;
	}
}

/** The chips for the lines in [from, to] of `doc`. Only a line past CHIP_MIN_PAYLOAD is read, so a deck with no photo pays a length check a line. */
function chipsIn(doc: Text, from: number, to: number): Range<Decoration>[] {
	const out: Range<Decoration>[] = [];
	for (let pos = from; pos <= to; ) {
		const line = doc.lineAt(pos);
		if (line.length >= CHIP_MIN_PAYLOAD) {
			for (const [a, z] of longPayloads(line.text)) out.push(Decoration.replace({ widget: new PhotoChip(z - a) }).range(line.from + a, line.from + z));
		}
		pos = line.to + 1;
	}
	return out;
}

// A STATE FIELD, not a view plugin: CodeMirror sizes a line it has not drawn from its text, and only decorations in the
// state reach that estimate. From a plugin, the chip drew but a photo line kept the height of its 145 KB of text
// (measured: one line 54,319 px tall, the rest of the slide pushed out of view). Each edit maps the chips through
// the change and reads again only the lines the edit touched.
export const photoChips = StateField.define<DecorationSet>({
	create: (state) => Decoration.set(chipsIn(state.doc, 0, state.doc.length)),
	update(chips, tr) {
		if (!tr.docChanged) return chips;
		let next = chips.map(tr.changes);
		tr.changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
			const from = tr.state.doc.lineAt(fromB).from;
			const to = tr.state.doc.lineAt(toB).to;
			next = next.update({ filterFrom: from, filterTo: to, filter: () => false, add: chipsIn(tr.state.doc, from, to), sort: true });
		});
		return next;
	},
	provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
});

const photoChipTheme = EditorView.baseTheme({
	'.cm-photo-chip': {
		display: 'inline-block',
		padding: '0 6px',
		borderRadius: '4px',
		fontSize: '0.85em',
		color: 'var(--text-muted)',
		backgroundColor: 'color-mix(in srgb, var(--text-heading) 8%, transparent)',
		border: '1px solid color-mix(in srgb, var(--text-heading) 14%, transparent)',
		whiteSpace: 'nowrap',
		verticalAlign: 'baseline',
	},
});

/** A large typed insertion, applied as one transaction (the browser's own insert lays out every character first). */
function insertLarge(view: EditorView, text: string): void {
	view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.type', scrollIntoView: true });
}

// Android's Chrome ignores a cancelled `beforeinput` (CodeMirror's own handler says so): applying the text here as well
// would put it in twice, so there, and wherever the event cannot be cancelled, the browser's own path stays.
const IGNORES_CANCEL = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

const largeInsert = EditorView.domEventHandlers({
	beforeinput(e: InputEvent, view: EditorView) {
		if (e.inputType !== 'insertText' || !e.data || e.data.length < LARGE_INSERT || view.composing || isReadOnly(view.state)) return false;
		if (!e.cancelable || IGNORES_CANCEL) return false;
		e.preventDefault();
		insertLarge(view, e.data);
		return true;
	},
});

function isReadOnly(state: EditorState): boolean {
	return state.readOnly;
}

/** Both: the deck editor's inline-photo handling. */
export const inlinePhotoEditing: Extension = [largeInsert, photoChips, photoChipTheme];
