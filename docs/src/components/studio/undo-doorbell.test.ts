import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blurToDoorbell } from './studio-filo';
import { createUndoDoorbell } from './undo-doorbell';

// jsdom has no editing commands, so the browser's undo state and `insertText` are stubbed: the test
// pins WHEN the doorbell rings and that focus and the caret come back. That it brings back WebKit's
// gestures is shown on the real surface by the undo probe (docs/scripts/ios-safari/undo-probe.js).

let editor: HTMLElement;
let enabled: boolean;
let redoEnabled: boolean;
const inserted: string[] = [];

beforeEach(() => {
	document.body.innerHTML = '<div data-filo-owned><div class="cm-content" contenteditable="true">Hello world</div></div><input id="other" />';
	editor = document.querySelector('.cm-content') as HTMLElement;
	// jsdom does not compute isContentEditable from the attribute.
	Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
		configurable: true,
		get(this: HTMLElement) {
			return this.getAttribute('contenteditable') === 'true';
		},
	});
	enabled = false;
	redoEnabled = false;
	inserted.length = 0;
	document.queryCommandEnabled = vi.fn((cmd: string) => (cmd === 'redo' ? redoEnabled : enabled));
	document.execCommand = vi.fn((cmd: string, _ui?: boolean, value?: string) => {
		if (cmd === 'insertText') {
			inserted.push(`${(document.activeElement as HTMLElement | null)?.getAttribute('data-undo-doorbell') !== null ? 'bell' : 'other'}:${value}`);
			enabled = true;
		}
		return true;
	});
	editor.focus();
	const r = document.createRange();
	r.setStart(editor.firstChild as Text, 5);
	r.collapse(true);
	getSelection()?.removeAllRanges();
	getSelection()?.addRange(r);
});

afterEach(() => {
	delete (HTMLElement.prototype as { isContentEditable?: boolean }).isContentEditable;
});

describe('the undo doorbell', () => {
	it('rings when the browser has nothing to undo and Filo does, then puts focus and the caret back', () => {
		const bell = createUndoDoorbell({ canUndo: () => true });
		expect(bell.arm()).toBe(true);
		expect(inserted).toEqual(['bell:​']);
		expect(document.activeElement).toBe(editor);
		expect(getSelection()?.getRangeAt(0).startOffset).toBe(5);
		expect(editor.textContent).toBe('Hello world');
	});

	it("tells the editor's blur handlers that the ring is not the author leaving", () => {
		const seen: boolean[] = [];
		editor.addEventListener('blur', (e) => seen.push(blurToDoorbell(e)));
		createUndoDoorbell({ canUndo: () => true }).arm();
		expect(seen).toEqual([true]);
		(document.getElementById('other') as HTMLInputElement).focus();
		expect(seen).toEqual([true, false]);
	});

	it('stays silent when the browser already has a step', () => {
		enabled = true;
		expect(createUndoDoorbell({ canUndo: () => true }).arm()).toBe(false);
		expect(inserted).toEqual([]);
	});

	it('stays silent while the browser holds a redo step, so a gesture redo still reaches Filo', () => {
		redoEnabled = true;
		expect(createUndoDoorbell({ canUndo: () => true }).arm()).toBe(false);
		expect(inserted).toEqual([]);
	});

	it('stays silent during an IME composition, and rings once it ends', () => {
		const bell = createUndoDoorbell({ canUndo: () => true });
		editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		expect(bell.arm()).toBe(false);
		expect(inserted).toEqual([]);
		editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
		expect(bell.arm()).toBe(true);
		bell.dispose();
	});

	it('stays silent while a finger is down, with a selection, or with a completion list open', () => {
		const bell = createUndoDoorbell({ canUndo: () => true });
		document.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1 }));
		expect(bell.arm()).toBe(false);
		document.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 }));
		const r = document.createRange();
		r.setStart(editor.firstChild as Text, 0);
		r.setEnd(editor.firstChild as Text, 5);
		getSelection()?.removeAllRanges();
		getSelection()?.addRange(r);
		expect(bell.arm()).toBe(false);
		r.collapse(false);
		getSelection()?.removeAllRanges();
		getSelection()?.addRange(r);
		const tip = document.body.appendChild(document.createElement('div'));
		tip.className = 'cm-tooltip-autocomplete';
		expect(bell.arm()).toBe(false);
		tip.remove();
		expect(inserted).toEqual([]);
		expect(bell.arm()).toBe(true);
		bell.dispose();
	});

	it('forgets a pointer whose pointerup never came', () => {
		vi.useFakeTimers();
		const bell = createUndoDoorbell({ canUndo: () => true });
		document.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 7 }));
		expect(bell.arm()).toBe(false);
		vi.advanceTimersByTime(6000);
		expect(bell.arm()).toBe(true);
		bell.dispose();
		vi.useRealTimers();
	});

	it('keeps the editor keyboard settings and a 16px text size', () => {
		const bell = createUndoDoorbell({ canUndo: () => true });
		bell.arm();
		const el = document.querySelector('[data-undo-doorbell]') as HTMLElement;
		expect([el.getAttribute('autocorrect'), el.getAttribute('autocapitalize'), el.getAttribute('spellcheck')]).toEqual(['off', 'off', 'false']);
		expect(el.style.fontSize).toBe('16px');
		bell.dispose();
	});

	it('backs off when its edit never takes', () => {
		document.execCommand = vi.fn(() => true); // WebKit refuses: undo stays off
		const bell = createUndoDoorbell({ canUndo: () => true });
		const rang = Array.from({ length: 6 }, () => bell.arm());
		expect(rang).toEqual([true, true, true, false, false, false]);
		// Once WebKit's list works again, the misses are forgotten.
		enabled = true;
		bell.arm();
		enabled = false;
		document.execCommand = vi.fn(() => true);
		expect(bell.arm()).toBe(true);
		bell.dispose();
	});

	it('stays silent when Filo has nothing to undo', () => {
		expect(createUndoDoorbell({ canUndo: () => false }).arm()).toBe(false);
		expect(inserted).toEqual([]);
	});

	it('stays silent when focus is not in an editable surface Filo owns', () => {
		(document.getElementById('other') as HTMLInputElement).focus();
		expect(createUndoDoorbell({ canUndo: () => true }).arm()).toBe(false);
		expect(inserted).toEqual([]);
	});

	it('keeps one hidden bell, and trims its text once it grows', () => {
		const bell = createUndoDoorbell({ canUndo: () => true });
		for (let i = 0; i < 3; i++) {
			enabled = false;
			bell.arm();
		}
		const bells = document.querySelectorAll('[data-undo-doorbell]');
		expect(bells).toHaveLength(1);
		expect(bells[0].getAttribute('data-filo-owned')).toBe('');
		expect(bells[0].getAttribute('aria-hidden')).toBe('true');
		bell.dispose();
		expect(document.querySelectorAll('[data-undo-doorbell]')).toHaveLength(0);
	});
});
