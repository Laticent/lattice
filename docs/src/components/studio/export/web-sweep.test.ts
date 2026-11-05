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

	// Every element and attribute the sweep reads, from the policy table (lib/core/content-policy.js WEB_MEDIA and
	// MEDIA_FETCH_ATTRS): a picture keeps a placeholder in its place, anything else that fetches is removed, and the
	// restore puts each one back. A change to the table changes this table's verdicts, so it is pinned here.
	it('sweeps each media element and fetching attribute, as the policy table names them', () => {
		const web = 'https://t.example/x.png';
		const rows: Array<[string, string, string, 'placeholder' | 'removed' | 'kept']> = [
			['img', 'src', web, 'placeholder'],
			['img', 'srcset', `${web} 2x`, 'removed'],
			['video', 'poster', web, 'placeholder'],
			['video', 'src', web, 'removed'],
			['audio', 'src', web, 'removed'],
			['source', 'src', web, 'removed'],
			['source', 'srcset', `${web} 1x`, 'removed'],
			['img', 'href', web, 'kept'], // `href` fetches only on SVG <image>
			['div', 'src', web, 'kept'], // not a media element
		];
		for (const [tag, attr, value, want] of rows) {
			const s = section(`<${tag} id="el" ${attr}="${value}"></${tag}>`);
			const el = s.querySelector('#el') as Element;
			const restore = sweepWebRefsForCapture(s);
			if (want === 'placeholder') expect(el.getAttribute(attr), `${tag} ${attr}`).toMatch(/^data:image\/svg\+xml/);
			else if (want === 'removed') expect(el.hasAttribute(attr), `${tag} ${attr}`).toBe(false);
			else expect(el.getAttribute(attr), `${tag} ${attr}`).toBe(value);
			restore();
			expect(el.getAttribute(attr), `${tag} ${attr} restored`).toBe(value);
		}
		// SVG <image> reads `href` and `xlink:href`.
		for (const attr of ['href', 'xlink:href']) {
			const s = section(`<svg><image id="el" ${attr}="${web}"></image></svg>`);
			const el = s.querySelector('#el') as Element;
			const restore = sweepWebRefsForCapture(s);
			expect(el.getAttribute(attr), `image ${attr}`).toMatch(/^data:image\/svg\+xml/);
			restore();
			expect(el.getAttribute(attr)).toBe(web);
		}
	});
});
