// captureSlot's last check before it clones a slide: the scroller is still quiet once the capture code has loaded.
// studio-map-posters.spec.ts saw a capture start within 250 ms of a scroll (#3045): the pool checked for a quiet
// scroller, then the capture awaited its imports, and a scroll landed in between.
import { afterEach, describe, expect, it, vi } from 'vitest';

const toCanvas = vi.fn(async () => {
	throw new Error('stop after the clone starts: this test is about whether it starts');
});
vi.mock('html-to-image', () => ({ toCanvas }));
// Two vendored faces; a slide drawn in Inter must carry Inter's and not Fraunces'.
const FACES = "@font-face{font-family:'Inter';font-weight:400;src:url(data:font/woff2;base64,AAA) format('woff2');}@font-face{font-family:'Fraunces';font-weight:700;src:url(data:font/woff2;base64,BBB) format('woff2');}";
vi.mock('../../playground/font-embed.js', () => ({ buildFontEmbedCss: async () => FACES }));

import { captureSlot, facesFor, SCROLLED } from './pool-capture';

function slot() {
	const s = document.createElement('div');
	const f = document.createElement('iframe');
	s.appendChild(f);
	document.body.appendChild(s);
	f.contentDocument?.body.insertAdjacentHTML('beforeend', '<div class="lattice"><section style="font-family: Inter, sans-serif"><h1>Hi</h1></section></div>');
	const section = f.contentDocument?.querySelector('section') as HTMLElement;
	// jsdom lays nothing out: give the slide and its slot the sizes a real one has.
	Object.defineProperty(section, 'offsetWidth', { value: 1280 });
	Object.defineProperty(section, 'offsetHeight', { value: 720 });
	s.getBoundingClientRect = () => ({ width: 160, height: 90, top: 0, left: 0, right: 160, bottom: 90, x: 0, y: 0, toJSON: () => ({}) });
	return s;
}

afterEach(() => {
	toCanvas.mockClear();
	document.body.replaceChildren();
});

describe('captureSlot asks once more whether the reader is scrolling, after its code has loaded', () => {
	it('clones nothing and answers SCROLLED when a scroll landed while it loaded', async () => {
		let asked = 0;
		const got = await captureSlot(slot(), () => true, () => {
			asked++;
			return false;
		});
		expect(got).toBe(SCROLLED);
		expect(asked).toBe(1);
		expect(toCanvas).not.toHaveBeenCalled();
	});
	it('starts the clone when the scroller is still quiet', async () => {
		const got = await captureSlot(slot(), () => true, () => true);
		expect(toCanvas).toHaveBeenCalledTimes(1);
		expect(got).toBe(null); // the mocked clone throws, which a capture answers with null
	});
});

// A poster stays on screen once it exists (StudioMap.tsx), so it is drawn in the slide's own faces, never a fallback:
// one drawn without them re-wrapped a title and overlapped a dense column. Only the slide's families travel.
describe('a poster carries the slide\'s own fonts, and only those', () => {
	it('keeps the rules of the families asked for, by name, in any case', () => {
		expect(facesFor(FACES, ['inter'])).toContain("font-family:'Inter'");
		expect(facesFor(FACES, ['inter'])).not.toContain('Fraunces');
		expect(facesFor(FACES, ['georgia'])).toBe('');
	});
	it('hands the clone the slide\'s faces as fontEmbedCSS instead of skipping fonts', async () => {
		await captureSlot(slot(), () => true, () => true);
		const opts = (toCanvas.mock.calls[0] as unknown as [unknown, { fontEmbedCSS?: string; skipFonts?: boolean }])[1];
		expect(opts.skipFonts).toBeUndefined();
		expect(opts.fontEmbedCSS).toContain("font-family:'Inter'");
		expect(opts.fontEmbedCSS).not.toContain('Fraunces');
	});
});
