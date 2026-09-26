// The last word on web images in a Studio raster export (trio follow-up 11). html-to-image runs
// in the parent page, which has no content-security policy, and re-fetches what it reads off the
// computed style; `sweepWebRefsForCapture` swaps every web reference outside the deck's allow-list
// right before the clone and puts it back afterwards.
import { describe, expect, it } from 'vitest';
import { sweepWebRefsForCapture } from './deck-export.js';

function section(html: string): HTMLElement {
	document.body.innerHTML = `<section>${html}</section>`;
	return document.querySelector('section') as HTMLElement;
}

describe('sweepWebRefsForCapture', () => {
	it('swaps a web background and a web image, and restores both', () => {
		const s = section('<div id="bg" style="background-image:url(https://t.example/a.png)"></div><img id="im" src="https://t.example/b.png" srcset="https://t.example/b2.png 2x">');
		const bg = s.querySelector('#bg') as HTMLElement;
		const im = s.querySelector('#im') as HTMLImageElement;
		const restore = sweepWebRefsForCapture(s);
		expect(bg.style.getPropertyValue('background-image')).not.toContain('t.example');
		expect(bg.style.getPropertyPriority('background-image')).toBe('important');
		expect(im.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
		expect(im.hasAttribute('srcset')).toBe(false);
		restore();
		expect(bg.getAttribute('style')).toContain('https://t.example/a.png');
		expect(im.getAttribute('src')).toBe('https://t.example/b.png');
		expect(im.getAttribute('srcset')).toBe('https://t.example/b2.png 2x');
	});

	it('leaves local and data: images alone', () => {
		const s = section('<img id="a" src="local.png"><div id="b" style="background-image:url(data:image/png;base64,AA)"></div>');
		const restore = sweepWebRefsForCapture(s);
		expect((s.querySelector('#a') as HTMLImageElement).getAttribute('src')).toBe('local.png');
		expect((s.querySelector('#b') as HTMLElement).style.getPropertyPriority('background-image')).toBe('');
		restore();
	});
});
