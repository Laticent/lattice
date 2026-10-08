// Drop a deck file anywhere on the Studio to open it (engineering/decisions/
// 2026-10-05-reopenable-exports.md §6). A drop is a second way into the ONE import
// funnel: the shell hands the file to the same `readDeckFile` → `openLatticeImport`
// path the deck switcher's Import deck… uses, so a dropped file meets the same sniffing,
// size caps, package gates, refusals and toasts. Nothing here reads the file.
//
// The owner's model (2026-10-07): the whole shell is the target, EXCEPT the places that
// already own a file drop or a text drop, which keep it:
//   · the Library panel and the motion drawing well (they mark themselves, or handle the
//     event first and `preventDefault` it);
//   · the two editors, where a drop is text placed at a caret;
//   · an open dialog, which is about something else;
//   · the whole shell while Present is up, so a drop cannot swap the deck mid-talk.
// In those zones a file drop that no one handles is REFUSED, not passed through: the
// browser's default would navigate the tab to the file and leave the Studio.
// A drop always opens a NEW deck. It never edits the open one.
import * as React from 'react';

/** Where a file drop is someone else's. Matched with `closest()` from the event target. */
export const OWN_DROP_ZONES = '[data-file-drop], .cm-editor, .ProseMirror, [role="dialog"], [role="alertdialog"]';

export type DropVerdict = 'none' | 'owned' | 'import';

type DragLike = {
	dataTransfer: Pick<DataTransfer, 'types'> | null;
	target: EventTarget | null;
	defaultPrevented: boolean;
};

/**
 * What the shell should do with a drag event.
 *  · `none`   — not a file drag (a slide-rail reorder, dragged text): not ours to touch.
 *  · `owned`  — a file drag over a zone that owns its drops, or one an inner handler
 *               already took (`defaultPrevented`): stand back.
 *  · `import` — a file drag over the rest of the shell: show the sign, take the drop.
 */
export function deckDropVerdict(e: DragLike): DropVerdict {
	const types = e.dataTransfer?.types;
	if (!types || !Array.from(types).includes('Files')) return 'none';
	if (e.defaultPrevented) return 'owned';
	const el = e.target as Element | null;
	if (el && typeof el.closest === 'function' && el.closest(OWN_DROP_ZONES)) return 'owned';
	return 'import';
}

function isEditable(target: EventTarget | null): boolean {
	return !!(target as HTMLElement | null)?.isContentEditable;
}

/**
 * The shell's drop handlers and whether the "drop to open" sign is up. `onFile` gets the
 * one dropped file; `onRefuse` gets a toast-ready message when the drop cannot be used.
 */
export function useDeckFileDrop(onFile: (file: File) => void, onRefuse: (message: string) => void, { enabled = true }: { enabled?: boolean } = {}) {
	const [over, setOver] = React.useState(false);
	// A DEAD-MAN TIMER. While a drag is over the page the browser fires `dragover` every
	// 350 ms ± 200 ms even when the pointer is still (HTML drag-and-drop processing model), so
	// a second with none means the drag is gone. It covers the drag that ends WITHOUT a
	// `dragleave`: measured, Chromium's cancelled drag (CDP `dragCancel`) delivers no event
	// to the page at all, and the sign stayed up over a Studio no one was dragging onto.
	const quiet = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const hide = React.useCallback(() => {
		if (quiet.current) clearTimeout(quiet.current);
		quiet.current = null;
		setOver(false);
	}, []);
	React.useEffect(() => hide, [hide]);
	// While the shell is not taking drops (Present is up: a drop must not swap the deck the
	// audience is watching), every file drag is `owned`, so it is refused rather than imported.
	const shellVerdict = (e: DragLike): DropVerdict => {
		const verdict = deckDropVerdict(e);
		return verdict === 'import' && !enabled ? 'owned' : verdict;
	};
	const props: React.HTMLAttributes<HTMLDivElement> = {
		onDragOver: (e) => {
			const verdict = shellVerdict(e);
			if (verdict === 'none') return;
			// Recomputed on every dragover, so the sign drops the moment the pointer enters a
			// zone that owns its drops, and comes back on leaving it.
			if (verdict !== 'import') {
				hide();
				// A zone that did not take the drag itself (a dialog, Present) refuses it here,
				// with the no-drop cursor. Left alone, the browser's default for a file drop is
				// to navigate the tab to the file, out of the Studio. NOT over an editable
				// element: the browser lets those take a drop natively, and CodeMirror relies on
				// that. It never cancels `dragover` and reads the file in its `drop` handler, so
				// refusing here (measured) blocked the code editor's own file drop.
				if (!e.defaultPrevented && !isEditable(e.target)) {
					e.preventDefault();
					e.dataTransfer.dropEffect = 'none';
				}
				return;
			}
			setOver(true);
			if (quiet.current) clearTimeout(quiet.current);
			quiet.current = setTimeout(hide, 1000);
			e.preventDefault(); // without this the browser refuses the drop and navigates to the file
			e.dataTransfer.dropEffect = 'copy';
		},
		// Leaving for nothing (out of the window) or for somewhere outside the shell takes the
		// sign down at once. Crossing into a child does not: then `relatedTarget` is that child.
		onDragLeave: (e) => {
			if (deckDropVerdict(e) === 'none') return;
			const to = e.relatedTarget as Node | null;
			if (!to || !e.currentTarget.contains(to)) hide();
		},
		onDrop: (e) => {
			const verdict = shellVerdict(e);
			if (verdict === 'none') return;
			hide();
			if (verdict !== 'import') {
				// The same navigation guard, for a zone that accepted the drag and then ignored
				// a file: ProseMirror cancels `dragover`, but a drop with no text in it leaves the
				// event alone, and the tab would open the file.
				if (!e.defaultPrevented) e.preventDefault();
				return;
			}
			e.preventDefault();
			const files = Array.from(e.dataTransfer.files ?? []);
			if (files.length === 0) return;
			if (files.length > 1) {
				onRefuse(`Drop one deck at a time — ${files.length} files were dropped, so none was opened.`);
				return;
			}
			onFile(files[0]);
		},
	};
	return { props, over };
}
