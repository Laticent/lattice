import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// A LARGE TYPED INSERTION, without the freeze. A paste reaches CodeMirror as clipboard data and never enters the DOM, but
// a typed insertion does: an IME commit, dictation, a drop the browser turns into text, or an automation's `insertText`.
// The browser inserts that text into the editor's DOM and lays all of it out before CodeMirror reads it back. On a deck of
// three phone photos (14 MB, docs/e2e/export-photo-size.spec.ts) Chromium spent 11.6 s in `TypingCommand::InsertText`,
// 8.2 s of it shaping text, and WebKit 287 s (docs/e2e/studio-fixture.ts `pasteIntoEditor`). This takes such an insertion
// as ONE transaction, the way CodeMirror already takes a paste, so the browser never lays the raw text out.

/** A typed insertion this long or longer is applied by the editor, not by the browser's DOM editing. */
export const LARGE_INSERT = 65_536;

/** What `takesInsert` reads off a `beforeinput` event and the editor. */
export interface InsertAsk {
	inputType: string;
	data: string | null;
	cancelable: boolean;
	composing: boolean;
	readOnly: boolean;
	userAgent: string;
}

/**
 * Whether the editor should apply this insertion itself. Never while composing (the IME owns the text until it commits),
 * never in a read-only editor, and never where the browser could still apply its own copy: an event that cannot be
 * cancelled, and Android's Chrome, which ignores a cancelled `beforeinput` (CodeMirror's own input handling says so), so
 * applying it here as well would put the text in twice.
 */
export function takesInsert(ask: InsertAsk): boolean {
	if (ask.inputType !== 'insertText' || !ask.data || ask.data.length < LARGE_INSERT) return false;
	if (ask.composing || ask.readOnly || !ask.cancelable) return false;
	return !/Android/i.test(ask.userAgent);
}

/** The deck editor's handler: a large typed insertion becomes one transaction, as a paste does. */
export function largeInsert(): Extension {
	return EditorView.domEventHandlers({
		beforeinput(e: InputEvent, view: EditorView) {
			const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
			if (!takesInsert({ inputType: e.inputType, data: e.data, cancelable: e.cancelable, composing: view.composing, readOnly: view.state.readOnly, userAgent })) return false;
			e.preventDefault();
			view.dispatch(view.state.replaceSelection(e.data as string), { userEvent: 'input.type', scrollIntoView: true });
			return true;
		},
	});
}
