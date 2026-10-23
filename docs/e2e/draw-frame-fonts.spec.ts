import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// A DECK'S OWN FONT reaches the draw frame. A diagram's label boxes are sized by measuring its text, and the frame measures in the faces the
// host sends it: the engine's own (loaded from the engine's font folders) and, since owner decision D2 B (2026-10-21), a face a deck carries as
// a `data:` font in its `@font-face`. Without it the frame measured in a fallback face and the box did not fit the font the slide paints
// (measured: Playfair Display boxes about 6% too narrow, Caveat 11% too wide).
//
// The test draws one flowchart three ways in the real Studio, and compares the width of every node box:
//   in the page (no draw host: the baseline the frame must match), in the frame with the deck's font, and in the page with a plain serif.

const FONT = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts/playfair-400.woff2')).toString('base64');
const deck = `---
theme: indaco
---

## Labels

The slide's own text is set in the deck font, which is what loads it.

\`\`\`mermaid
flowchart LR
  A[Review by the legal team] --> B[Customer success]
  B --> C[Quarterly planning]
  C --> D[Approved]
\`\`\`
`;

// The deck's font arrives the way a theme's does, as a stylesheet in the preview frame: injected into that frame (the page the slide is drawn
// in), with the face as a `data:` font and the body token pointed at it.
const deckFont = (family: string) => `
	@font-face { font-family: "Brand Serif"; font-weight: 400; font-style: normal; src: url(data:font/woff2;base64,${FONT}) format("woff2"); }
	:root, section, section * { --font-body: ${family} !important; }
	section, section * { font-family: ${family} !important; }`;

async function withDeckFont(context: import('@playwright/test').BrowserContext, family: string) {
	await context.addInitScript((css) => {
		if (window.top === window || document.querySelector('[data-lattice-draw-frame]')) return;
		document.addEventListener('DOMContentLoaded', () => {
			const el = document.createElement('style');
			el.textContent = css;
			document.head.appendChild(el);
		});
	}, deckFont(family));
}

async function widths(page: import('@playwright/test').Page): Promise<number[]> {
	await gotoStudio(page);
	await setEditorContent(page, deck);
	const preview = livePreview(page);
	await expect(preview.locator('svg[id^="lattice-mmd-"]').first()).toBeAttached({ timeout: 90_000 });
	await expect(preview.locator('[data-lattice-settle="rendered"]').first()).toBeAttached({ timeout: 90_000 });
	return preview.locator('svg[id^="lattice-mmd-"] g.node > rect').evaluateAll((rects) => rects.map((r) => Number(r.getAttribute('width'))));
}

test("a deck's own embedded font sizes the frame's diagram labels as the page sizes them @gecko @webkit-tablet", async ({ browser }) => {
	test.setTimeout(240_000);

	const inPage = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await inPage.addInitScript(() => Object.defineProperty(window, '__latticeDrawHost', { value: null, writable: false, configurable: false }));
	await withDeckFont(inPage, '"Brand Serif", serif');
	const baseline = await widths(await inPage.newPage());
	await inPage.close();
	const plain = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await plain.addInitScript(() => Object.defineProperty(window, '__latticeDrawHost', { value: null, writable: false, configurable: false }));
	await withDeckFont(plain, 'serif');
	const fallback = await widths(await plain.newPage());
	await plain.close();

	const withFrame = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await withDeckFont(withFrame, '"Brand Serif", serif');
	const page = await withFrame.newPage();
	const framed = await widths(page);
	expect(await page.locator('iframe[data-lattice-draw-frame="mermaid"]').count(), 'drawn in the frame').toBe(1);
	await withFrame.close();

	expect(baseline.length, `node boxes: ${baseline.join(',')}`).toBe(4);
	// The font is really applied: the same labels in a plain serif are a different width.
	const apart = baseline.map((w, i) => Math.abs(w - fallback[i]) / w);
	expect(Math.max(...apart), 'the deck font changes the boxes, so the comparison below means something').toBeGreaterThan(0.02);
	// And the frame measures in it: every box matches the page's, within a pixel.
	expect(framed.length).toBe(baseline.length);
	for (const [i, w] of framed.entries()) {
		expect(Math.abs(w - baseline[i]), `node ${i}: frame ${w}px against page ${baseline[i]}px`).toBeLessThanOrEqual(1);
	}
});
