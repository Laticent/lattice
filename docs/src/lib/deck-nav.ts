// deck-nav — the DOM half of slide navigation, shared by every Studio surface.
//
// The device-independent MATHS (which key means next, what counts as a swipe,
// what counts as a wheel flick) lives in the headless kernel,
// `lib/core/present-transport.mjs`. This module adds the one thing that kernel
// cannot have and stay DOM-free: the rule for WHEN a keystroke is the reader
// turning the deck rather than the author typing into it.
//
// Why it exists (#1294): the Studio must reach parity across desktop, tablet and
// phone, and no device class owns an input verb. A "desktop" may be a tower with
// a wheel mouse or a touchscreen laptop; a tablet takes a keyboard case, a mouse
// and fingers, often within one sentence; a phone can be paired with both. So we
// never branch navigation on breakpoint or on a coarse/fine-pointer probe — every
// surface listens for all three verbs, always, and the input the reader happens
// to reach for is the one that works.

import { keyAction, PRESENT_KEYMAP } from '../../../lib/core/present-transport.mjs';

/**
 * The Studio SHELL's navigation keymap: the Present keymap minus Space.
 *
 * Space is `next` on a full-screen stage, where there is nothing else it could
 * mean. In the shell it is the activation key for whatever button has focus, and
 * the page-scroll key everywhere else — stealing it would break both. Every other
 * deck-turning key carries over unchanged, including PageUp/PageDown, which is
 * what a presentation clicker actually emits.
 */
export const SHELL_KEYMAP: Record<string, string> = Object.fromEntries(
	Object.entries(PRESENT_KEYMAP).filter(([key]) => key !== ' '),
);

/**
 * Is this event target the user TYPING — a text field, a `contenteditable`, or a
 * widget that owns the arrow keys for its own selection?
 *
 * CodeMirror (the Markdown editor) and ProseMirror (Compose) both render a
 * `contenteditable` host, so the `isContentEditable` branch covers the editor
 * without either library needing to know this function exists.
 *
 * The `role` list covers the Radix menus, comboboxes and listboxes the Studio
 * chrome is built from: while one is open its focused item owns Arrow keys for
 * moving the highlight, and turning the slide underneath it would be a surprise.
 */
export function isTypingTarget(el: Element | null): boolean {
	if (!el) return false;
	const node = el as HTMLElement;
	if (node.isContentEditable) return true;
	const tag = node.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	// A focused item inside an open menu/dialog owns its own arrow-key semantics.
	return !!node.closest?.('[role="menu"],[role="listbox"],[role="combobox"],[role="dialog"],[role="alertdialog"]');
}

/**
 * The nav action a shell keystroke means — or `null` when the shell must keep
 * its hands off. `null` for: a modified chord (those are app shortcuts, and
 * ⌘←/⌥← are word/line motions), a keystroke aimed at a typing target, and any
 * key outside {@link SHELL_KEYMAP}.
 *
 * Takes the event and the element to judge, rather than reading
 * `document.activeElement` itself, so it stays testable without a live document
 * and honest about shadow/portal cases where the two differ.
 */
export function shellKeyAction(
	e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
	target: Element | null,
): string | null {
	if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
	if (isTypingTarget(target)) return null;
	return keyAction(e.key, SHELL_KEYMAP) ?? null;
}
