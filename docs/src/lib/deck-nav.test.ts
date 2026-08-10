import { describe, expect, it } from 'vitest';
import { isTypingTarget, SHELL_KEYMAP, shellKeyAction, zoomKeyAction } from './deck-nav';

// The DOM half of slide navigation (#1294): which keystrokes turn the deck, and
// which belong to whatever the user is typing into.

const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
	({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe('SHELL_KEYMAP', () => {
	it('carries every deck-turning key the stage has — including the clicker keys', () => {
		expect(SHELL_KEYMAP.ArrowRight).toBe('next');
		expect(SHELL_KEYMAP.ArrowLeft).toBe('prev');
		expect(SHELL_KEYMAP.PageDown).toBe('next');
		expect(SHELL_KEYMAP.PageUp).toBe('prev');
		expect(SHELL_KEYMAP.Home).toBe('first');
		expect(SHELL_KEYMAP.End).toBe('last');
	});

	it('drops Space, which the shell needs for buttons and page scroll', () => {
		expect(SHELL_KEYMAP[' ']).toBeUndefined();
		expect(shellKeyAction(key(' '), null)).toBeNull();
	});
});

describe('isTypingTarget', () => {
	it('is false for the page body and ordinary chrome', () => {
		expect(isTypingTarget(null)).toBe(false);
		expect(isTypingTarget(document.body)).toBe(false);
		const btn = document.createElement('button');
		document.body.append(btn);
		expect(isTypingTarget(btn)).toBe(false);
		btn.remove();
	});

	it('is true for the text controls a deck author actually types into', () => {
		for (const tag of ['input', 'textarea', 'select']) {
			const el = document.createElement(tag);
			document.body.append(el);
			expect(isTypingTarget(el), tag).toBe(true);
			el.remove();
		}
	});

	it('is true for a contenteditable host — how CodeMirror and Compose both render', () => {
		const cm = document.createElement('div');
		cm.className = 'cm-content';
		// jsdom does not derive isContentEditable from the attribute, so set the property
		// the way the real browsers report it.
		Object.defineProperty(cm, 'isContentEditable', { value: true });
		expect(isTypingTarget(cm)).toBe(true);
	});

	it('is true inside an open menu or dialog, whose focused item owns the arrows', () => {
		const menu = document.createElement('div');
		menu.setAttribute('role', 'menu');
		const item = document.createElement('div');
		menu.append(item);
		document.body.append(menu);
		expect(isTypingTarget(item)).toBe(true);
		menu.remove();
	});
});

describe('shellKeyAction', () => {
	it('turns the deck from the body — the Read stop has no editor to defer to', () => {
		expect(shellKeyAction(key('ArrowRight'), document.body)).toBe('next');
		expect(shellKeyAction(key('ArrowLeft'), document.body)).toBe('prev');
		expect(shellKeyAction(key('PageDown'), document.body)).toBe('next');
	});

	it('keeps its hands off while the caret is in the editor', () => {
		const cm = document.createElement('div');
		Object.defineProperty(cm, 'isContentEditable', { value: true });
		expect(shellKeyAction(key('ArrowRight'), cm)).toBeNull();
		const input = document.createElement('input');
		expect(shellKeyAction(key('ArrowLeft'), input)).toBeNull();
	});

	it('ignores modified chords — ⌘←/⌥← are line and word motions, not navigation', () => {
		expect(shellKeyAction(key('ArrowRight', { metaKey: true }), document.body)).toBeNull();
		expect(shellKeyAction(key('ArrowRight', { ctrlKey: true }), document.body)).toBeNull();
		expect(shellKeyAction(key('ArrowRight', { altKey: true }), document.body)).toBeNull();
		expect(shellKeyAction(key('ArrowRight', { shiftKey: true }), document.body)).toBeNull();
	});

	it('ignores keys outside the map', () => {
		expect(shellKeyAction(key('ArrowUp'), document.body)).toBeNull();
		expect(shellKeyAction(key('g'), document.body)).toBeNull();
		expect(shellKeyAction(key('Escape'), document.body)).toBeNull();
		// Own-property lookup only — an inherited member must not become an action.
		expect(shellKeyAction(key('toString'), document.body)).toBeNull();
	});
});

describe('zoomKeyAction — the pointer-free route to the fourth verb', () => {
	// Zoom shipped reachable only by pinch / ctrl+wheel / middle button, i.e. gated on
	// pointer capability — which is what this module's parity rule forbids, and which
	// left keyboard-only and switch users with no route to zoom and no route back.
	const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
		({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods }) as KeyboardEvent;

	it('maps both faces of each key, so Shift is never required', () => {
		expect(zoomKeyAction(key('+'), null)).toBe('in');
		expect(zoomKeyAction(key('='), null)).toBe('in');
		expect(zoomKeyAction(key('-'), null)).toBe('out');
		expect(zoomKeyAction(key('_'), null)).toBe('out');
		expect(zoomKeyAction(key('0'), null)).toBe('reset');
	});

	it('never steals the browser its own page zoom', () => {
		// ⌘+ / ctrl+- are the browser's, and taking them would remove a user's ability
		// to enlarge the whole UI — the exact population a zoom feature is for.
		expect(zoomKeyAction(key('+', { metaKey: true }), null)).toBeNull();
		expect(zoomKeyAction(key('-', { ctrlKey: true }), null)).toBeNull();
		expect(zoomKeyAction(key('0', { metaKey: true }), null)).toBeNull();
	});

	it('stands down while the author is typing', () => {
		const input = document.createElement('input');
		expect(zoomKeyAction(key('-'), input)).toBeNull();
		expect(zoomKeyAction(key('0'), input)).toBeNull();
	});

	it('ignores keys it does not own', () => {
		expect(zoomKeyAction(key('ArrowRight'), null)).toBeNull();
		expect(zoomKeyAction(key('5'), null)).toBeNull();
	});
});
