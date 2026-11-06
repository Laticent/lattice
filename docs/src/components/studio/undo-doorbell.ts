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
/** After this many rings in a row that left WebKit's undo off, ring at most once per BACKOFF_MS. */
const MAX_MISSES = 3;
const BACKOFF_MS = 10_000;
/** A pointer held longer than this is taken as lifted, its `pointerup` lost. */
const POINTER_STALE_MS = 5_000;

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
	// A `compositionend` iOS drops (a keyboard switch, a blur) must not silence the bell for good.
	const onCompositionEnd = () => {
		composing = false;
	};
	// A finger or pen on the screen: a long-press selection, a handle drag, a callout menu. A ring then would
	// move focus mid-gesture, so it waits for the next trigger. Each pointer is kept with the time it went down,
	// and one held longer than POINTER_STALE_MS counts as lifted: a `pointerup` that never reached this document
	// (the touched node was removed, the finger lifted over a frame) must not silence the bell for good.
	const pointers = new Map<number, number>();
	const onPointerDown = (e: PointerEvent) => {
		pointers.set(e.pointerId, Date.now());
	};
	const onPointerUp = (e: PointerEvent) => {
		pointers.delete(e.pointerId);
	};
	const pointerHeld = () => {
		const now = Date.now();
		for (const [id, at] of pointers) if (now - at > POINTER_STALE_MS) pointers.delete(id);
		return pointers.size > 0;
	};
	// A ring that does not take (WebKit refused the edit) is retried at most once per BACKOFF_MS, so a
	// browser that never registers it is not blurred and refocused every 400 ms.
	let misses = 0;
	let lastMiss = 0;
	const listeners: [string, EventListener][] = [
		['compositionstart', onCompositionStart],
		['compositionend', onCompositionEnd],
		['focusout', onCompositionEnd],
		['pointerdown', onPointerDown as EventListener],
		['pointerup', onPointerUp as EventListener],
		['pointercancel', onPointerUp as EventListener],
	];
	for (const [type, fn] of listeners) doc.addEventListener(type, fn, true);
	const ensureBell = () => {
		if (bell?.isConnected) return bell;
		const el = doc.createElement('div');
		el.setAttribute('contenteditable', 'true');
		el.setAttribute('data-filo-owned', '');
		el.setAttribute('data-undo-doorbell', '');
		el.setAttribute('aria-hidden', 'true');
		el.tabIndex = -1;
		// The editor's own keyboard settings (CodeMirror sets these on its content), so a ring does not switch
		// the iOS keyboard's autocorrect and capitals off and on; and 16px, under which iOS zooms into a field.
		el.setAttribute('autocorrect', 'off');
		el.setAttribute('autocapitalize', 'off');
		el.setAttribute('spellcheck', 'false');
		el.setAttribute('writingsuggestions', 'false');
		el.style.cssText =
			'position:fixed;left:-9999px;top:0;width:1px;height:1px;font-size:16px;opacity:0;overflow:hidden;pointer-events:none;';
		doc.body.appendChild(el);
		bell = el;
		return el;
	};
	return {
		arm() {
			if (ringing || composing || pointerHeld() || !opts.canUndo()) return false;
			// A step on WebKit's redo stack means a gesture undo just ran: an edit now would empty it, and the
			// redo gesture would stop reaching Filo (iOS dispatch 42094642587).
			if (nativeEnabled(doc, 'undo') !== false || nativeEnabled(doc, 'redo') !== false) {
				// WebKit's own list works again (a ring took, or the author typed): forget earlier misses.
				if (nativeEnabled(doc, 'undo') === true) misses = 0;
				return false;
			}
			if (misses >= MAX_MISSES && Date.now() - lastMiss < BACKOFF_MS) return false;
			const active = doc.activeElement;
			if (!isFiloEditable(active)) return false;
			// An open completion list closes on blur, and a selection (not a caret) is an author mid-choice.
			if (doc.querySelector('.cm-tooltip-autocomplete')) return false;
			const sel = doc.getSelection();
			const range = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
			if (range && !range.collapsed) return false;
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
			if (nativeEnabled(doc, 'undo') === false) {
				misses++;
				lastMiss = Date.now();
			} else misses = 0;
			return true;
		},
		dispose() {
			for (const [type, fn] of listeners) doc.removeEventListener(type, fn, true);
			bell?.remove();
			bell = null;
		},
	};
}
