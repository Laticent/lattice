import type { EditorView } from 'prosemirror-view';
import { takePendingSelection } from './pending-selection';

/**
 * KEEP THE CARET A CLICK PUT DOWN WHEN THAT CLICK FOCUSED THE EDITOR.
 *
 * This races a prosemirror-view INTERNAL, pinned at prosemirror-view 1.42.8 (`handlers.focus` in dist/index.js): when the
 * editor gains focus it starts a 20 ms timer, and when the timer fires, if the DOM selection differs from the last one
 * ProseMirror read (`domObserver.currentSelection`), it writes its OWN selection back (`selectionToDOM`). On keyboard or
 * programmatic focus that is right: it restores the author's caret. On a CLICK it can be wrong: the click has moved the DOM
 * caret, but ProseMirror reads that move from `selectionchange`, and WebKit held that event for about 190 ms on a busy
 * page while the timer fired at 20. The caret went back to where ProseMirror had it (the top of a freshly opened deck),
 * and the first words typed landed there (2026-11-17, a real click on the 134 KB deck: 3 in 96 first clicks in WebKit,
 * timeline in the PR).
 *
 * So a focus that a mousedown caused reads the click's caret on a 0 ms timer. Custom DOM handlers run before
 * prosemirror-view's own, so this timer is started first, and with the shorter delay it fires first: by the time
 * prosemirror-view's timer looks, the DOM and the last read agree, and it writes nothing. A focus that no mousedown caused
 * is left alone, so ProseMirror still restores the caret on Tab or `view.focus()`.
 *
 * If a prosemirror-view upgrade changes that timer, pointer-focus-caret.test.ts fails and says to re-check this.
 */
export function pointerFocusCaret(): { mousedown: (view: EditorView) => boolean; focus: (view: EditorView) => boolean } {
	let pointer = false;
	return {
		mousedown() {
			// The focus a click causes arrives during this mousedown's default action, in the same task. A mousedown that
			// focuses nothing (the editor already had focus) must not leave the flag set for a later keyboard focus.
			pointer = true;
			setTimeout(() => {
				pointer = false;
			}, 0);
			return false;
		},
		focus(view) {
			if (pointer) setTimeout(() => !view.isDestroyed && takePendingSelection(view), 0);
			return false;
		},
	};
}
