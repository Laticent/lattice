import { afterEach, describe, expect, it } from 'vitest';
import { raisesTouchKeyboard } from '@/components/ui/focus-return';

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
	});
	it('is true for editable text on a coarse pointer', () => {
		pointer(false);
		for (const html of ['<textarea></textarea>', '<input>', '<input type="search">', '<div contenteditable="true"></div>', '<div contenteditable=""><p>x</p></div>'])
			expect(raisesTouchKeyboard(el(html)), html).toBe(true);
		expect(raisesTouchKeyboard(el('<div contenteditable="true"><p>x</p></div>').firstElementChild as HTMLElement), 'inside an editor').toBe(true);
	});
	it('is false for controls, read-only fields, and on a fine pointer', () => {
		pointer(false);
		for (const html of ['<button>x</button>', '<input type="checkbox">', '<input readonly>', '<textarea readonly></textarea>', '<a href="#">x</a>'])
			expect(raisesTouchKeyboard(el(html)), html).toBe(false);
		pointer(true);
		expect(raisesTouchKeyboard(el('<textarea></textarea>'))).toBe(false);
	});
});
