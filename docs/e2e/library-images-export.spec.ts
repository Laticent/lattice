import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { CHROME, expect, gotoStudio, setEditorContent, shareExport, test } from './studio-fixture';

// A Library photo has to survive every way a deck LEAVES the browser, because `asset:<name>` means
// nothing anywhere else and the preview's `blob:` URL dies with the tab
// (engineering/decisions/2026-10-12-library-media-assets.md §6). Driven on the real Share sheet:
// the oracle is the downloaded FILE, not a unit test of the embedder.
test.describe.configure({ timeout: 300_000 });

const GREEN = [16, 160, 90];

async function addPhoto(page: Page, name: string) {
	await page.evaluate(async (fileName) => {
		const c = document.createElement('canvas');
		c.width = 640;
		c.height = 360;
		const g = c.getContext('2d') as CanvasRenderingContext2D;
		g.fillStyle = 'rgb(16,160,90)';
		g.fillRect(0, 0, 640, 360);
		const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
		const dt = new DataTransfer();
		dt.items.add(new File([blob], fileName, { type: 'image/png' }));
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, name);
}


/** The share of a picture's pixels that are the probe's green, decoded by the browser itself. A slide
 *  picture exists in every PDF and PowerPoint export whether or not the photo made it onto the
 *  slide, so "an image is present" proves nothing; the photo's own colour on the page does. */
async function greenShare(page: Page, png: Buffer): Promise<number> {
	return page.evaluate(async (b64) => {
		const bin = atob(b64);
		const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
		const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
		const c = document.createElement('canvas');
		c.width = bmp.width;
		c.height = bmp.height;
		const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
		g.drawImage(bmp, 0, 0);
		const d = g.getImageData(0, 0, c.width, c.height).data;
		let n = 0;
		for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 16) < 40 && Math.abs(d[i + 1] - 160) < 40 && Math.abs(d[i + 2] - 90) < 40) n++;
		return n / (d.length / 4);
	}, png.toString('base64'));
}

async function setUp(page: Page) {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await addPhoto(page, 'Export Probe.png');
	await expect(page.locator('[data-media-card="export-probe"]')).toBeVisible();
	await setEditorContent(page, '# Export probe\n\n![A green probe](asset:export-probe)\n');
	await expect(page.locator('[aria-label="Live deck preview"] iframe.live').contentFrame().locator('img[alt="A green probe"]').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
}

async function download(page: Page, format: Parameters<typeof shareExport>[1]): Promise<string> {
	const pending = page.waitForEvent('download', { timeout: 240_000 });
	await shareExport(page, format);
	const file = await pending;
	return (await file.path()) as string;
}

test('@smoke the webpage export carries the photo as pixels, with no blob: or asset: left @webkit-tablet @gecko', async ({ page }) => {
	await setUp(page);
	const path = await download(page, 'webpage');
	const html = readFileSync(path, 'utf8');
	// Read the tag, not a regex over attribute order: the engine writes `src` before `alt`.
	const tag = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).find((t) => /alt="A green probe"/.test(t));
	expect(tag, 'an <img> for the photo').toBeTruthy();
	const src = /\ssrc="([^"]*)"/.exec(tag as string)?.[1] ?? '';
	expect(src.startsWith('data:image/png;base64,'), `the photo is embedded as pixels (src starts ${src.slice(0, 24)})`).toBe(true);
	expect(html, 'no preview-only object URL survives into a file that outlives the tab').not.toMatch(/blob:https?:/);
	expect(html, 'no unresolved reference').not.toMatch(/src="asset:/);
	// The embedded bytes are the photo: decode and compare a pixel through the browser's own decoder.
	const px = await page.evaluate(async (uri) => {
		const img = new Image();
		img.src = uri;
		await img.decode();
		const c = document.createElement('canvas');
		c.width = img.naturalWidth;
		c.height = img.naturalHeight;
		const g = c.getContext('2d') as CanvasRenderingContext2D;
		g.drawImage(img, 0, 0);
		return { w: img.naturalWidth, h: img.naturalHeight, rgb: Array.from(g.getImageData(10, 10, 1, 1).data.slice(0, 3)) };
	}, src);
	expect(px).toEqual({ w: 640, h: 360, rgb: GREEN });
});

test('@smoke the PDF export draws the photo on the page, and does not report a missing image @webkit-tablet @gecko', async ({ page }) => {
	await setUp(page);
	const path = await download(page, 'pdf');
	const doc = await PDFDocument.load(new Uint8Array(readFileSync(path)), { updateMetadata: false });
	expect(doc.getPageCount()).toBe(1);
	await expect(page.locator('[data-sonner-toast]')).not.toContainText(/could not load every image/i);
	// Rasterize page 1 with poppler and look for the photo's colour: the page, not the file's plumbing.
	const dir = mkdtempSync(join(tmpdir(), 'lib-img-pdf-'));
	execFileSync('pdftoppm', ['-png', '-r', '48', '-f', '1', '-l', '1', path, join(dir, 'p')]);
	const png = readFileSync(execFileSync('sh', ['-c', `ls ${dir}/p*.png | head -1`]).toString().trim());
	expect(await greenShare(page, png), 'the photo is painted on the PDF page').toBeGreaterThan(0.02);
});

// NOT on WebKit: its PowerPoint raster capture drops EVERY picture today, a repo sample image included, and
// still says "PowerPoint ready." (followups.d/2640-p2-webkit-pptx-drops-images.md). Asserting the photo
// there would fail for a reason this feature did not introduce; Firefox and Chromium carry the oracle.
test('@smoke the PowerPoint export carries the photo, and does not report a missing image @gecko', async ({ page }) => {
	await setUp(page);
	const path = await download(page, 'pptx');
	await expect(page.locator('[data-sonner-toast]')).not.toContainText(/could not load every image/i);
	const zip = await JSZip.loadAsync(readFileSync(path));
	const media = Object.keys(zip.files).filter((n) => /^ppt\/media\/.+\.png$/i.test(n));
	expect(media.length, `ppt/media holds pictures (found: ${Object.keys(zip.files).filter((n) => n.includes('media')).join(', ') || 'nothing'})`).toBeGreaterThan(0);
	let best = 0;
	for (const name of media) best = Math.max(best, await greenShare(page, Buffer.from(await (zip.file(name) as JSZip.JSZipObject).async('uint8array'))));
	expect(best, 'some picture in the deck shows the photo').toBeGreaterThan(0.02);
});
