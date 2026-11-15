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
// The builder writes the rules of the families it is asked for; `fonts.fail` makes a face unobtainable.
const fonts = vi.hoisted(() => ({ fail: false, asked: [] as string[][] }));
vi.mock('../../playground/font-embed.js', () => ({
	buildFamilyFontCss: async (faces: Array<{ family: string }>) => {
		const families = faces.map((f) => f.family);
		fonts.asked.push(families);
		if (fonts.fail) throw new Error('font fetch failed');
		return FACES.split('@font-face')
			.filter((r) => families.some((f) => r.toLowerCase().includes(`'${f}'`)))
			.map((r) => `@font-face${r}`)
			.join('');
	},
}));
vi.mock('../../../../lib/core/slide-camera.mjs', () => ({ pseudoContentText: () => '' }));

import { captureSlot, facesOf, SCROLLED, slideTextOf } from './pool-capture';

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
	fonts.fail = false;
	fonts.asked.length = 0;
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
// one drawn without them re-wrapped a title and overlapped a dense column.
describe('a poster carries the slide\'s own fonts, or is not taken', () => {
	it('asks for the slide\'s families and hands their faces to the clone instead of skipping fonts', async () => {
		await captureSlot(slot(), () => true, () => true);
		expect(fonts.asked[0]).toContain('inter');
		const opts = (toCanvas.mock.calls[0] as unknown as [unknown, { fontEmbedCSS?: string; skipFonts?: boolean }])[1];
		expect(opts.skipFonts).toBeUndefined();
		expect(opts.fontEmbedCSS).toContain("font-family:'Inter'");
		expect(opts.fontEmbedCSS).not.toContain('Fraunces');
	});
	it('takes no picture when a face cannot be had: a fallback-face poster would be kept for good', async () => {
		fonts.fail = true;
		expect(await captureSlot(slot(), () => true, () => true)).toBeNull();
		expect(toCanvas).not.toHaveBeenCalled();
	});
	it('reads an icon\'s glyph into the slide\'s text, except on a slide that draws its icons as <svg>', () => {
		const sec = document.createElement('section');
		sec.innerHTML = '<p>Hi</p><i data-glyph="\uE019"></i>';
		expect(slideTextOf(sec, () => '')).toContain('\uE019');
		sec.classList.add('icon-svg');
		expect(slideTextOf(sec, () => '')).not.toContain('\uE019');
	});
	it('reads the face a ::before draws in, which no element on the slide may use', () => {
		const sec = document.createElement('section');
		sec.style.fontFamily = 'Outfit';
		sec.innerHTML = '<p class="step">Plan</p>';
		document.body.appendChild(sec);
		// jsdom computes no pseudo-element styles, so the browser's answer for the step counter is stood in.
		const real = window.getComputedStyle.bind(window);
		const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
			if (pseudo === '::before' && (el as HTMLElement).classList.contains('step'))
				return { content: '"1"', fontFamily: '"JetBrains Mono", monospace', fontWeight: '700', fontStyle: 'normal' } as CSSStyleDeclaration;
			const cs = real(el);
			return pseudo ? ({ ...cs, content: 'none' } as CSSStyleDeclaration) : cs;
		});
		try {
			expect(facesOf(sec)).toContainEqual({ family: 'jetbrains mono', weight: 700, style: 'normal' });
		} finally {
			spy.mockRestore();
			sec.remove();
		}
	});
});
