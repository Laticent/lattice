import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
