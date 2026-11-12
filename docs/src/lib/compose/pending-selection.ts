import type { EditorView } from 'prosemirror-view';

/**
 * READ THE CARET BEFORE A TRANSACTION THAT NO KEY OR CLICK STARTED.
 *
 * ProseMirror learns where a native caret key put the caret from `selectionchange`, a queued task. A transaction
 * dispatched before that event is read is built on the OLD selection, and `updateState` writes the state's selection
 * back to the DOM: the arrow the author just pressed is undone. Compose dispatches from timers and loaders as well as
 * from input (the code-highlight poll, every 400 ms for up to 12 s after a deck opens; the inline-object pass when the
 * pill kernels load), so a caret key pressed at the wrong moment was thrown away. Logged in-page on
 * compose-pill-editor.spec.ts: the first ArrowRight of a walk moved the caret from 0 to 1, a `selectionchange` then
 * found it back at 0, and the walk ended one step short of the pill.
 *
 * `domObserver.flush()` reads a DOM selection ProseMirror has not taken in yet, which is what its own input handlers
 * do first. It is not in prosemirror-view's typed API, so it is reached defensively: if a release renames it this does
 * nothing, as before. It returns early on its own while ProseMirror has deliberately deferred a read (`flushingSoon`,
 * armed only on Android, IE and Safari composition), so this never cuts that wait short; `forceFlush()` would, and is
 * not called. Never during an IME composition (the timer already skips those).
 */
export function takePendingSelection(view: EditorView): void {
	if (view.composing) return;
	(view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
}
