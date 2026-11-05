/**
 * THE UNDO DOORBELL — keeps the browser's own undo available whenever Filo has a step to undo.
 *
 * Filo (studio-filo.ts) owns the Studio's undo history. The browser does not: it only decides whether
 * its own undo is AVAILABLE, from its own native undo stack. Safari's Edit → Undo, the iOS shake and
 * three-finger swipe, and the iPad keyboard bar's undo key all ask WebKit "can you undo?" and send a
 * `historyUndo` beforeinput (which StudioShell routes to Filo) only when the answer is yes. So when
 * WebKit's stack is empty while Filo's is not, those gestures do nothing and Filo never hears them.
 *
 * WebKit empties that stack on every frame navigation in the page: a new iframe, an iframe's `srcdoc`
 * set or rewritten (ci-flake-audit §3 (engineering/decisions/2026-11-04): the frame lab in docs/scripts/ios-safari/undo-probe.js;
 * `document.write` and an in-place body change do not). The live preview builds its frame and
 * rewrites its `srcdoc` on full writes, so a word typed just before one lost every system undo
 * gesture. A reloaded page also starts empty while Filo restores its stored history (the macOS
 * after-reload gap, followups.d/2959-p3).
 *
 * The doorbell re-arms the native stack in those moments: one invisible edit in a hidden editable the
 * Studio owns (`data-filo-owned`, so `undoOwner` still routes the request to Filo), then focus and the
 * caret go back exactly where they were. It never touches the deck's text and never runs while the
 * native stack already has an undo or a redo step, Filo has nothing to undo, or focus is not in an
 * editable surface Filo owns. The redo guard matters: an edit after a gesture undo empties WebKit's
 * redo stack, and on macOS a bell step on top of the stack swallowed an undo without a beforeinput.
 */

import { undoOwner } from './studio-filo';

export type UndoDoorbell = {
	/** Re-arm the browser's undo if it is empty while Filo can undo. Returns whether it rang. */
	arm(): boolean;
	/** Remove the hidden editable. */
	dispose(): void;
};

/** The bell's text is a run of zero-width spaces; it is trimmed back once it grows past this. */
const MAX_BELL_TEXT = 64;

function nativeEnabled(doc: Document, command: 'undo' | 'redo'): boolean | null {
	try {
		return typeof doc.queryCommandEnabled === 'function' ? doc.queryCommandEnabled(command) : null;
	} catch {
		return null;
	}
}

/** Whether `el` is where a typed word lives in a Filo-owned surface: the deck editor, Compose. */
function isFiloEditable(el: Element | null): el is HTMLElement {
	return !!el && (el as HTMLElement).isContentEditable === true && !el.closest('[data-undo-doorbell]') && undoOwner(el) === 'filo';
}

export function createUndoDoorbell(opts: { canUndo: () => boolean; doc?: Document }): UndoDoorbell {
	const doc = opts.doc ?? document;
	let bell: HTMLElement | null = null;
	let ringing = false;
	// An IME composition (Japanese, Chinese, Korean input) must never lose focus to the bell mid-word.
	let composing = false;
	const onCompositionStart = () => {
		composing = true;
	};
	const onCompositionEnd = () => {
		composing = false;
	};
	doc.addEventListener('compositionstart', onCompositionStart, true);
	doc.addEventListener('compositionend', onCompositionEnd, true);
	const ensureBell = () => {
		if (bell?.isConnected) return bell;
		const el = doc.createElement('div');
		el.setAttribute('contenteditable', 'true');
		el.setAttribute('data-filo-owned', '');
		el.setAttribute('data-undo-doorbell', '');
		el.setAttribute('aria-hidden', 'true');
		el.tabIndex = -1;
		el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;';
		doc.body.appendChild(el);
		bell = el;
		return el;
	};
	return {
		arm() {
			if (ringing || composing || !opts.canUndo()) return false;
			// A step on WebKit's redo stack means a gesture undo just ran: an edit now would empty it, and the
			// redo gesture would stop reaching Filo (iOS dispatch 42094642587).
			if (nativeEnabled(doc, 'undo') !== false || nativeEnabled(doc, 'redo') !== false) return false;
			const active = doc.activeElement;
			if (!isFiloEditable(active)) return false;
			const sel = doc.getSelection();
			const range = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
			ringing = true;
			try {
				const el = ensureBell();
				if ((el.textContent ?? '').length > MAX_BELL_TEXT) el.textContent = '';
				el.focus({ preventScroll: true });
				const s = doc.getSelection();
				s?.selectAllChildren(el);
				s?.collapseToEnd();
				doc.execCommand('insertText', false, '​');
			} finally {
				active.focus({ preventScroll: true });
				const s = doc.getSelection();
				if (range && s) {
					s.removeAllRanges();
					s.addRange(range);
				}
				ringing = false;
			}
			return true;
		},
		dispose() {
			doc.removeEventListener('compositionstart', onCompositionStart, true);
			doc.removeEventListener('compositionend', onCompositionEnd, true);
			bell?.remove();
			bell = null;
		},
	};
}
