import { afterEach, describe, expect, it } from 'vitest';
import { focusLauncher, raisesTouchKeyboard, resetLastInput, tappedLauncher } from '@/components/ui/focus-return';

const real = window.matchMedia;
const pointer = (fine: boolean) => {
	window.matchMedia = ((q: string) => ({ matches: fine && q.includes('pointer: fine'), media: q })) as unknown as typeof window.matchMedia;
};
const el = (html: string) => {
	const host = document.createElement('div');
	host.innerHTML = html;
	return host.firstElementChild as HTMLElement;
};

describe('raisesTouchKeyboard', () => {
	afterEach(() => {
		window.matchMedia = real;
		resetLastInput();
	});
	it('is false when the last input was a key (a hardware keyboard on a touch device), true again after a tap', () => {
		pointer(false);
		const field = el('<textarea></textarea>');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(raisesTouchKeyboard(field)).toBe(false);
		document.dispatchEvent(new Event('pointerdown'));
		expect(raisesTouchKeyboard(field)).toBe(true);
	});
	it("prosemirror-view's focus check still uses a 20 ms timer (the e2e editorFocusSettled orders after it)", async () => {
		const { readFileSync } = await import('node:fs');
		const { createRequire } = await import('node:module');
		const { dirname, join } = await import('node:path');
		const dist = dirname(createRequire(import.meta.url).resolve('prosemirror-view'));
		for (const file of [join(dist, 'index.js'), join(dist, 'index.cjs')]) {
			const src = readFileSync(file, 'utf8');
			expect(src, file).toMatch(/handlers\.focus = [\s\S]{0,700}?\}, 20\);/);
		}
	});
	it('is true for editable text on a coarse pointer', () => {
		pointer(false);
		for (const html of ['<textarea></textarea>', '<input>', '<input type="search">', '<div contenteditable="true"></div>', '<div contenteditable=""><p>x</p></div>'])
			expect(raisesTouchKeyboard(el(html)), html).toBe(true);
		expect(raisesTouchKeyboard(el('<div contenteditable="true"><p>x</p></div>').firstElementChild as HTMLElement), 'inside an editor').toBe(true);
	});
	it('a button in a non-editable bar inside an editor is not text (Compose\'s slide bar)', () => {
		pointer(false);
		const bar = el('<div contenteditable="true"><div contenteditable="false"><button>Add</button></div></div>');
		expect(raisesTouchKeyboard(bar.querySelector('button') as HTMLElement)).toBe(false);
	});
	it('remembers the control a tap landed on, and focuses it only while it is on the page and not text', () => {
		const host = document.createElement('div');
		host.innerHTML = '<button>launch</button><textarea></textarea>';
		document.body.append(host);
		const [button, field] = [host.querySelector('button') as HTMLElement, host.querySelector('textarea') as HTMLElement];
		button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(tappedLauncher()).toBe(button);
		expect(focusLauncher(button)).toBe(true);
		expect(document.activeElement).toBe(button);
		expect(focusLauncher(field), 'a text field is never the fallback').toBe(false);
		host.remove();
		expect(focusLauncher(button), 'a launcher that left the page is not focused').toBe(false);
	});
	it('a key since the tap clears the launcher: a sheet opened by keyboard has none', () => {
		const button = document.createElement('button');
		document.body.append(button);
		button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(tappedLauncher()).toBe(button);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
		expect(tappedLauncher()).toBeNull();
		button.remove();
	});
	it('is false for controls, read-only fields, and on a fine pointer', () => {
		pointer(false);
		for (const html of ['<button>x</button>', '<input type="checkbox">', '<input readonly>', '<textarea readonly></textarea>', '<a href="#">x</a>'])
			expect(raisesTouchKeyboard(el(html)), html).toBe(false);
		pointer(true);
		expect(raisesTouchKeyboard(el('<textarea></textarea>'))).toBe(false);
	});
});
