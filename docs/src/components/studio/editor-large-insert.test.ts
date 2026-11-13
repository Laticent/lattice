// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { LARGE_INSERT, largeInsert, takesInsert } from './editor-large-insert';

// A typed insertion of a photo deck used to be laid out by the browser before CodeMirror read it back (editor-large-insert.ts
// says what it cost). These pin when the editor takes the insertion over, and that it applies exactly the text once.
const photo = (n: number) => `![bg](data:image/jpeg;base64,${'Q'.repeat(n)})`;
const fire = (view: EditorView, data: string, cancelable: boolean) => {
	const e = new InputEvent('beforeinput', { inputType: 'insertText', data, cancelable, bubbles: true });
	view.contentDOM.dispatchEvent(e);
	return e;
};
const mount = (readOnly = false) => new EditorView({ doc: '# T\n', extensions: [largeInsert(), EditorState.readOnly.of(readOnly)], parent: document.body });
const ask = { inputType: 'insertText', data: 'x'.repeat(LARGE_INSERT), cancelable: true, composing: false, readOnly: false, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' };

describe('largeInsert', () => {
	it("applies a large typed insertion itself, once, as one transaction, and cancels the browser's", () => {
		const view = mount();
		view.dispatch({ selection: { anchor: view.state.doc.length } });
		const text = photo(LARGE_INSERT);
		const e = fire(view, text, true);
		expect(e.defaultPrevented).toBe(true);
		expect(view.state.doc.toString()).toBe(`# T\n${text}`);
		view.destroy();
	});

	it('leaves a short insertion to the browser', () => {
		const view = mount();
		expect(fire(view, 'x', true).defaultPrevented).toBe(false);
		expect(fire(view, photo(LARGE_INSERT - 64), true).defaultPrevented).toBe(false);
		expect(view.state.doc.toString()).toBe('# T\n');
		view.destroy();
	});

	it('leaves an insertion that cannot be cancelled, and any in a read-only editor, untouched', () => {
		const view = mount();
		expect(fire(view, photo(LARGE_INSERT), false).defaultPrevented).toBe(false);
		expect(view.state.doc.toString()).toBe('# T\n');
		view.destroy();
		const locked = mount(true);
		expect(fire(locked, photo(LARGE_INSERT), true).defaultPrevented).toBe(false);
		expect(locked.state.doc.toString()).toBe('# T\n');
		locked.destroy();
	});

	it("steps aside on Android's Chrome, while composing, and for any input but typed text", () => {
		expect(takesInsert(ask)).toBe(true);
		// Android ignores a cancelled beforeinput: taking it here would insert the text twice.
		expect(takesInsert({ ...ask, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0 Mobile' })).toBe(false);
		expect(takesInsert({ ...ask, composing: true })).toBe(false);
		expect(takesInsert({ ...ask, inputType: 'insertFromPaste' })).toBe(false);
		expect(takesInsert({ ...ask, data: null })).toBe(false);
	});
});
