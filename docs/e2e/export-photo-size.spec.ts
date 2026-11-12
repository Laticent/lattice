import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, livePreview, pasteIntoEditor, railButtons, test } from './studio-fixture';

// A PHONE-PHOTO DECK, EXPORTED FROM THE REAL STUDIO, ON EVERY ENGINE. The size of an exported PowerPoint and
// LibreOffice file regressed twice with nothing to catch it, and the second time only on WebKit (every iPhone
// browser): the slide's photo was found by a regex WebKit gives up on past half a megabyte, so a phone photo
// was never measured and the slide shipped a different layout with a bigger photo box, and the browser's own
// shrink of a 12-megapixel photo left grain a JPEG cannot compress (engineering/decisions/2026-11-03-pictures-at-drawn-size.md).
// The oracle is the DOWNLOADED FILE: every slide picture distinct, and each photo slide and the whole file
// under a ceiling measured on this deck. Nightly, with the rest of the e2e suite.
test.describe.configure({ timeout: 600_000 });

// Measured 2026-11-03 on this deck with the final camera (the largest photo slide's picture / the larger of the two files):
// Chromium 145 KB / 491 KB, WebKit 145 KB / 492 KB, Firefox 154 KB / 518 KB. On main, Chromium wrote 175 KB / 583 KB, and WebKit
// fails the layout check before it exports. The ceilings sit about 8% over the worst engine (Firefox). Run against main's code, this
// spec fails on all three: Chromium 173 KB a photo slide, Firefox 262 KB (an 847 KB file), WebKit the layout check. The deck is seeded,
// and each engine wrote the same picture sizes on two runs of the same code.
const PHOTO_SLIDE_MAX = 168_000;
const FILE_MAX = 560_000;
const PHOTOS = 3;
// The deck is 16 MB of text (three phone photos as data URIs). Every wait below is for a SIGNAL; this is only the ceiling
// on each. Since the Studio skips a photo's base64 in its readers and lints in a worker (PR #3153), each signal comes in
// seconds on every engine (measured: the whole test 34 s on Firefox, 46 s on WebKit, 54 s on Chromium), so the ceiling is
// a tenth of the test's slot: a loaded runner is slower and still green, and a pass that reads the whole deck again fails
// here, naming the step, before it eats the slot.
const DECK_WORK_MS = 60_000;

// `@gecko` runs on Chromium desktop and Firefox, `@webkit-tablet` on real WebKit (export-images-policy.spec.ts).
const onEveryEngine = (title: string, body: (fixtures: { page: Page }) => Promise<void>) => {
	for (const tag of [' @gecko', ' @webkit-tablet']) test(`${title}${tag}`, body);
};

/** Photo-like JPEGs at a phone's size (4032 x 3024): soft color fields with grain, seeded so every run gets the same bytes. */
async function phonePhotos(page: Page) {
	return page.evaluate((count) => {
		const out: string[] = [];
		for (let k = 0; k < count; k++) {
			const c = document.createElement('canvas');
			c.width = 4032;
			c.height = 3024;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			const grad = g.createLinearGradient(0, 0, 4032, 3024);
			grad.addColorStop(0, `hsl(${k * 110}, 55%, 32%)`);
			grad.addColorStop(1, `hsl(${k * 110 + 140}, 55%, 68%)`);
			g.fillStyle = grad;
			g.fillRect(0, 0, 4032, 3024);
			let seed = 4242 + k;
			const rnd = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				return seed / 2 ** 32;
			};
			for (let i = 0; i < 60; i++) {
				g.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 50%, ${30 + rnd() * 40}%, 0.35)`;
				g.beginPath();
				g.arc(rnd() * 4032, rnd() * 3024, 150 + rnd() * 700, 0, Math.PI * 2);
				g.fill();
			}
			const img = g.getImageData(0, 0, 4032, 3024);
			for (let i = 0; i < img.data.length; i += 4) {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				const n = ((seed >>> 24) % 25) - 12;
				img.data[i] += n;
				img.data[i + 1] += n;
				img.data[i + 2] += n;
			}
			g.putImageData(img, 0, 0);
			out.push(c.toDataURL('image/jpeg', 0.9));
		}
		return out;
	}, PHOTOS);
}

/** Every picture part of a zip (`ppt/media/*` or `Pictures/*`): name, stored size and a hash of its bytes, by central directory. */
function pictures(zip: Uint8Array, prefix: string) {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	const out: Array<{ name: string; size: number; hash: string; bytes: Uint8Array }> = [];
	for (let i = 0; i + 46 <= zip.length; i++) {
		if (view.getUint32(i, true) !== 0x02014b50) continue;
		const method = view.getUint16(i + 10, true);
		const csize = view.getUint32(i + 20, true);
		const size = view.getUint32(i + 24, true);
		const nameLen = view.getUint16(i + 28, true);
		const extraLen = view.getUint16(i + 30, true);
		const commentLen = view.getUint16(i + 32, true);
		const local = view.getUint32(i + 42, true);
		const name = new TextDecoder('latin1').decode(zip.subarray(i + 46, i + 46 + nameLen));
		if (name.startsWith(prefix) && !name.endsWith('/')) {
			// Pictures are stored, not deflated (a JPEG or PNG does not compress), so the stored bytes are the picture.
			const at = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
			const hash = method === 0 ? createHash('sha1').update(zip.subarray(at, at + csize)).digest('hex') : `${method}:${csize}`;
			out.push({ name, size, hash, bytes: zip.subarray(at, at + csize) });
		}
		i += 46 + nameLen + extraLen + commentLen - 1;
	}
	return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

/** The spread of a picture's pixels, decoded by the browser: a blank (one flat color) picture is about 0. */
async function spread(page: Page, bytes: Uint8Array) {
	return page.evaluate(async (b64) => {
		const blob = await (await fetch(`data:application/octet-stream;base64,${b64}`)).blob();
		const bmp = await createImageBitmap(blob);
		const c = document.createElement('canvas');
		c.width = 160;
		c.height = 90;
		const g = c.getContext('2d') as CanvasRenderingContext2D;
		g.drawImage(bmp, 0, 0, 160, 90);
		const d = g.getImageData(0, 0, 160, 90).data;
		let sum = 0;
		let sq = 0;
		const n = d.length / 4;
		for (let i = 0; i < d.length; i += 4) {
			const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
			sum += v;
			sq += v * v;
		}
		return Math.sqrt(sq / n - (sum / n) ** 2);
	}, Buffer.from(bytes).toString('base64'));
}

async function exportFile(page: Page, pick: RegExp, download: RegExp) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: pick }).click();
	const saved = page.waitForEvent('download', { timeout: 480_000 });
	await dialog.getByRole('button', { name: download }).click();
	const bytes = new Uint8Array(readFileSync((await (await saved).path()) as string));
	await page.keyboard.press('Escape');
	return bytes;
}

onEveryEngine('@smoke a phone-photo deck exports small, distinct slide pictures in PowerPoint and LibreOffice', async ({ page }) => {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	const photos = await phonePhotos(page);
	const deck = [
		'<!-- _class: title -->\n\n# Phone photos\n\nExport size',
		...photos.map((p, i) => `<!-- _class: image -->\n\n\`Photo ${i + 1}\`\n\n## A phone photo beside its caption\n\nThe caption sits beside the photo.\n\n![bg](${p})`),
	].join('\n\n---\n\n');
	await pasteIntoEditor(page, deck, { timeout: DECK_WORK_MS });
	await expect(railButtons(page)).toHaveCount(PHOTOS + 1, { timeout: DECK_WORK_MS });

	// The Studio found the photo and measured its shape. Before the fix WebKit never did, for any photo over half a megabyte.
	await expect(livePreview(page).locator('section.image').first()).toHaveAttribute('data-img-bucket', 'wide', { timeout: DECK_WORK_MS });

	// Wait for the Studio to finish THIS deck before driving Share: a click sent while the Studio still works on a new deck
	// can spend its 15 s action budget at "scrolling into view", which is how this test failed on every gecko run while the
	// lint and the Coach read the whole deck on the main thread (engineering/gotchas/studio-playground.md, "A deck with
	// phone photos freezes the Studio"). Each pass stamps the length of the text it answered for, so the wait is for these
	// two answers, not for a guessed time.
	const chars = String(deck.length);
	await expect(page.getByLabel('Deck source').locator('xpath=ancestor::*[contains(@class,"cm-editor")][1]'), 'the editor linted this deck').toHaveAttribute('data-linted-chars', chars, { timeout: DECK_WORK_MS });
	await expect(page.locator('[data-studio-root]'), 'the Coach assessed this deck').toHaveAttribute('data-assessed-chars', chars, { timeout: DECK_WORK_MS });

	for (const [format, pick, download, prefix] of [
		['PowerPoint', /^PowerPoint/, /^Download PowerPoint/, 'ppt/media/'],
		['LibreOffice', /^LibreOffice/, /^Download LibreOffice/, 'Pictures/'],
	] as const) {
		const file = await exportFile(page, pick, download);
		const pics = pictures(file, prefix);
		// Recorded on every run, so a nightly report shows the sizes and not only a pass.
		test.info().annotations.push({ type: `${format} bytes`, description: `file ${file.length}; slides ${pics.map((p) => p.size).join(' ')}` });
		console.log(`[export-photo-size] ${format}: file ${file.length}; slides ${pics.map((p) => p.size).join(' ')}`);
		expect(pics, `${format}: one picture per slide`).toHaveLength(PHOTOS + 1);
		// Distinct: one WebKit run repeated a slide's picture on the slides after it.
		expect(new Set(pics.map((p) => p.hash)).size, `${format}: every slide picture differs`).toBe(PHOTOS + 1);
		// Not blank: one WebKit run wrote the title slide as a flat black picture, distinct and empty.
		for (const p of pics) expect(await spread(page, p.bytes), `${format}: ${p.name} has content`).toBeGreaterThan(8);
		for (const p of pics.slice(1)) expect(p.size, `${format}: ${p.name}`).toBeLessThan(PHOTO_SLIDE_MAX);
		expect(file.length, `${format}: the whole file`).toBeLessThan(FILE_MAX);
	}
});
