import * as fs from 'node:fs';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { expect, gotoStudio, persistedSource, shareExport, test, typeDeck } from './studio-fixture';

// A STUDIO EXPORT FROM SAFARI DRAWS A CARD'S SHADOW WHOLE (followups.d/3183-p11, lib/core/slide-camera.mjs § SCALED SHADOWS).
// The slide camera drew each slide's SVG on a canvas scaled 2x, and WebKit drops most of a NEGATIVE-SPREAD box-shadow under
// that scale: the image layout's lifted card (`--img-lift: 0.6cqi 0.8cqi 0 -0.1cqi`) lost its shadow from the card's left
// edge to about two thirds of the way along, in every Safari and iPhone export. The oracle is the exported picture itself:
// on the shadow's bottom band, the shadow starts near the card's left edge, as it does in Chromium.
//
// `desktop` (Chromium) drops a title tagged `@webkit-*` (playwright.config.ts), so the oracle is defined twice: the `@gecko`
// copy runs on Chromium and Firefox, the `@webkit-tablet` copy on WebKit, the engine the fix is for.
test.describe.configure({ timeout: 300_000 });

const DECK = `---\ntheme: indaco\ncolor-mode: light\n---\n\n<!-- _class: image -->\n\n## A lifted card\n\nThe card casts the layout's offset shadow.\n\n![A lake at dawn](sample:photo-wide.jpg)\n`;

/**
 * On the exported slide, where the card's shadow starts along its bottom band, as a share of the card's width (0 at the
 * card's left edge). The card is everything in the slide's right half that is not the background (its photo, its frame
 * and the shadow offset below and to the right of it), between 8% and 90% of the height so the spectrum bar and the page
 * number stay out; the band is the row 4 pixels above that region's bottom, which only the shadow reaches.
 */
async function shadowStart(page: Page, png: Buffer): Promise<{ start: number; width: number }> {
	return page.evaluate(async (b64) => {
		const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
		const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
		ctx.drawImage(bmp, 0, 0);
		const { width: w, height: h } = bmp;
		const d = ctx.getImageData(0, 0, w, h).data;
		const at = (x: number, y: number) => (y * w + x) * 4;
		const bg = [d[at(w >> 1, h - 3)], d[at(w >> 1, h - 3) + 1], d[at(w >> 1, h - 3) + 2]];
		const off = (x: number, y: number) => {
			const i = at(x, y);
			return Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) > 6;
		};
		let left = w;
		let right = -1;
		let bottom = -1;
		for (let y = Math.round(h * 0.08); y < Math.round(h * 0.9); y++) {
			for (let x = w >> 1; x < w - 4; x++) {
				if (!off(x, y)) continue;
				left = Math.min(left, x);
				right = Math.max(right, x);
				bottom = Math.max(bottom, y);
			}
		}
		let first = -1;
		for (let x = left; x <= right; x++) {
			if (off(x, bottom - 4)) {
				first = x;
				break;
			}
		}
		return { start: (first - left) / (right - left), width: w };
	}, png.toString('base64'));
}

for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`a Studio images export draws the image card's offset shadow whole${tag}`, async ({ page }) => {
		await gotoStudio(page);
		await typeDeck(page, DECK);
		await expect.poll(() => persistedSource(page)).toContain('A lifted card');
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		const download = page.waitForEvent('download', { timeout: 240_000 });
		await shareExport(page, 'images');
		const zip = await JSZip.loadAsync(fs.readFileSync((await (await download).path()) as string));
		const name = Object.keys(zip.files).find((n) => /slides\/.*-01\.png$/.test(n));
		expect(name, 'the slide is in the zip').toBeTruthy();
		const shot = await shadowStart(page, Buffer.from(await zip.files[name as string].async('uint8array')));
		// The camera's 2x shot: the scale the defect needs (at 1x WebKit draws the shadow whole).
		expect(shot.width, 'the images export is a 2x shot').toBe(2560);
		// Measured on an image slide exported from the Studio: Chromium 0.024, Firefox 0.025, WebKit 0.024 with the fix and 0.517 without it.
		expect(shot.start, `the shadow starts ${Math.round(shot.start * 100)}% of the way along the card`).toBeLessThan(0.1);
	});
}
