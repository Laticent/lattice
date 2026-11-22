import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The flash's clear is a transaction no key or click started (an animation's end, or a timer). Built on a selection
// ProseMirror had not read yet, it wrote the old caret back over a click (2026-11-17; compose-flash-caret.spec.ts drives
// that in three engines). This pins the ORDER here: the pending DOM selection is read before the clear is dispatched.
const calls: string[] = [];
vi.mock('./pending-selection', () => ({ takePendingSelection: () => calls.push('take') }));

const { changeFlashPlugin, flashKey } = await import('./change-flash');
const { deckToDoc } = await import('./deck-doc');

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
	calls.length = 0;
});

describe('the change flash clears without writing an unread caret back', () => {
	it('reads the pending selection, then dispatches the clear', () => {
		const doc = deckToDoc('# One\n\nBody one.\n\n---\n\n# Two\n\nBody two.');
		const host = document.createElement('div');
		document.body.append(host);
		view = new EditorView(host, {
			state: EditorState.create({ doc, plugins: [changeFlashPlugin()] }),
			dispatchTransaction(tr) {
				const m = tr.getMeta(flashKey) as object | undefined;
				if (m) calls.push('clear' in m ? 'clear' : 'flash');
				view?.updateState(view.state.apply(tr));
			},
		});
		view.dispatch(view.state.tr.setMeta(flashKey, { flash: { blocks: [{ from: 0, to: doc.child(0).nodeSize }], spans: [], gaps: [] } }));
		calls.length = 0;
		// No fade is running in jsdom, so the end of one clears the flash.
		view.dom.dispatchEvent(Object.assign(new Event('animationend', { bubbles: true }), { animationName: 'cs-flash-out-line' }));
		expect(calls).toEqual(['take', 'clear']);
	});
});
