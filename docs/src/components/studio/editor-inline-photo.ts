import { type EditorState, type Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';

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

/** The chips for every long line in view. Only lines past CHIP_MIN_PAYLOAD are read, so a deck with no photo pays a length check a line. */
function chipsInView(view: EditorView): DecorationSet {
	const b = new RangeSetBuilder<Decoration>();
	const { doc } = view.state;
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to; ) {
			const line = doc.lineAt(pos);
			if (line.length >= CHIP_MIN_PAYLOAD) {
				for (const [a, z] of longPayloads(line.text)) b.add(line.from + a, line.from + z, Decoration.replace({ widget: new PhotoChip(z - a) }));
			}
			pos = line.to + 1;
		}
	}
	return b.finish();
}

const photoChips = ViewPlugin.fromClass(
	class {
		chips: DecorationSet;
		constructor(view: EditorView) {
			this.chips = chipsInView(view);
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) this.chips = chipsInView(u.view);
		}
	},
	{
		decorations: (p) => p.chips,
		provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.chips ?? Decoration.none),
	},
);

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

const largeInsert = EditorView.domEventHandlers({
	beforeinput(e: InputEvent, view: EditorView) {
		if (e.inputType !== 'insertText' || !e.data || e.data.length < LARGE_INSERT || view.composing || isReadOnly(view.state)) return false;
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
