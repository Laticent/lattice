import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { Browser, Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { CHROME, expect, gotoStudio, setEditorContent, shareExport, test } from './studio-fixture';

// A Library photo has to survive every way a deck LEAVES the browser, because `asset:<name>` means
// nothing anywhere else and the preview's `blob:` URL dies with the tab
// (engineering/decisions/2026-10-12-library-media-assets.md §6). Driven on the real Share sheet:
// the oracle is the downloaded FILE, not a unit test of the embedder.
test.describe.configure({ timeout: 300_000 });

// `desktop` (Chromium) drops any title carrying `@webkit-*` unless it also carries `@crosswidth`
// (playwright.config.ts), so a test tagged `@webkit-tablet @gecko` never ran on Chromium at all. Each
// oracle is defined twice instead: the `@gecko` copy runs on Chromium desktop AND Firefox, the
// `@webkit-tablet` copy on real WebKit, and all three engines see every photo export.
const onEveryEngine = (title: string, body: (fixtures: { page: Page; browser: Browser }) => Promise<void>) => {
	for (const tag of [' @gecko', ' @webkit-tablet']) test(`${title}${tag}`, body);
};

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
		// The format dialog asks how to store them; the probes take its default.
		for (let i = 0; i < 200; i++) {
			const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim().startsWith('Add photo')) as HTMLButtonElement | undefined;
			if (b) {
				// These probes are PNGs that must stay byte-exact, so they ask for the original.
				const keep = document.querySelector('[role="dialog"] [role="radio"][aria-label="Keep original"]') as HTMLButtonElement | null;
				if (keep) {
					keep.click();
					await new Promise((r) => setTimeout(r, 150));
				}
				b.click();
				break;
			}
			await new Promise((r) => setTimeout(r, 50));
		}
	}, name);
}


/** The share of a picture's pixels that are the probe's green, decoded by the browser itself. A slide
 *  picture exists in every PDF and PowerPoint export whether or not the photo made it onto the
 *  slide, so "an image is present" proves nothing; the photo's own color on the page does. */
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

/** The most probe-green any one picture on page 1 of a PDF holds. The export draws the slide as one raster and the
 *  photo over it as its own picture, so the page's pictures together are what a viewer sees; the photo is on the
 *  page when one of them is the probe's green. Handles the two encodings the writers produce: plain Flate RGB
 *  (inflated here) and JPEG (decoded by the browser). */
async function greenShareOfPageImage(page: Page, pdf: Uint8Array): Promise<number> {
	const doc = await PDFDocument.load(pdf, { updateMetadata: false });
	const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
	let best = 0;
	let seen = 0;
	for (const [, ref] of xobjects?.entries() ?? []) {
		const img = doc.context.lookup(ref);
		if (!(img instanceof PDFRawStream) || img.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
		seen++;
		const w = Number(img.dict.get(PDFName.of('Width'))?.toString());
		const h = Number(img.dict.get(PDFName.of('Height'))?.toString());
		const filter = img.dict.get(PDFName.of('Filter'))?.toString() ?? '';
		if (filter === '/DCTDecode') {
			best = Math.max(best, await greenShare(page, Buffer.from(img.getContents())));
			continue;
		}
		expect(filter, 'a page picture is plain Flate RGB or JPEG').toBe('/FlateDecode');
		const raw = inflateSync(img.getContents());
		expect(raw.length, 'RGB, 8 bits, no predictor').toBe(w * h * 3);
		let n = 0;
		for (let i = 0; i < raw.length; i += 3) if (Math.abs(raw[i] - 16) < 40 && Math.abs(raw[i + 1] - 160) < 40 && Math.abs(raw[i + 2] - 90) < 40) n++;
		best = Math.max(best, n / (w * h));
	}
	expect(seen, 'page 1 carries a picture').toBeGreaterThan(0);
	return best;
}

async function setUp(page: Page) {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Media', exact: true }).click();
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

onEveryEngine('@smoke the webpage export carries the photo as pixels, with no blob: or asset: left', async ({ page }) => {
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

onEveryEngine('@smoke the PDF export draws the photo on the page, and does not report a missing image', async ({ page }) => {
	await setUp(page);
	const path = await download(page, 'pdf');
	const doc = await PDFDocument.load(new Uint8Array(readFileSync(path)), { updateMetadata: false });
	expect(doc.getPageCount()).toBe(1);
	// Anchor first: "no warning" passes on a page with no toast at all, so wait for the export's own toast.
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /PDF ready/ }).first()).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /could not load every image/i })).toHaveCount(0);
	// The page is one raster of the slide (an image-per-page PDF), so the page's own image is what a viewer shows.
	// Read it from the file rather than shelling out to poppler, which the per-PR `studio-smoke` job does not install.
	expect(await greenShareOfPageImage(page, new Uint8Array(readFileSync(path))), 'the photo is painted on the PDF page').toBeGreaterThan(0.02);
});

// NOT on WebKit: its PowerPoint raster capture drops EVERY picture today, a repo sample image included, and
// still says "PowerPoint ready." (followups.d/2640-p2-webkit-pptx-drops-images.md). Asserting the photo
// there would fail for a reason this feature did not introduce; Firefox and Chromium carry the oracle.
test('@smoke the PowerPoint export carries the photo, and does not report a missing image @gecko', async ({ page }) => {
	await setUp(page);
	const path = await download(page, 'pptx');
	// The message carries the toast text, so a failure names which image the capture could not load.
	const toasts = (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
	expect(toasts, 'the PowerPoint toast').not.toMatch(/could not load every image/i);
	const zip = await JSZip.loadAsync(readFileSync(path));
	const media = Object.keys(zip.files).filter((n) => /^ppt\/media\/.+\.png$/i.test(n));
	expect(media.length, `ppt/media holds pictures (found: ${Object.keys(zip.files).filter((n) => n.includes('media')).join(', ') || 'nothing'})`).toBeGreaterThan(0);
	let best = 0;
	for (const name of media) best = Math.max(best, await greenShare(page, Buffer.from(await (zip.file(name) as JSZip.JSZipObject).async('uint8array'))));
	expect(best, 'some picture in the deck shows the photo').toBeGreaterThan(0.02);
});

// The positive control for everything above: a deck whose photo is GONE must say so, and must ship the drawn
// stand-in rather than a dead link. Without it "no warning" in the tests above could mean "never warns".
onEveryEngine('@smoke a photo deleted before export is named in the toast and drawn as the stand-in, never a dead link', async ({ page }) => {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Media', exact: true }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await addPhoto(page, 'Soon Gone.png');
	await expect(page.locator('[data-media-card="soon-gone"]')).toBeVisible();
	await setEditorContent(page, '# Gone\n\n![A green probe](asset:soon-gone)\n');
	await expect(page.locator('[aria-label="Live deck preview"] iframe.live').contentFrame().locator('img[alt="A green probe"]').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
	// The deck uses it, so the delete asks once more.
	page.on('dialog', (d) => void d.accept());
	const card = page.locator('[data-media-card="soon-gone"]');
	await card.getByRole('button', { name: 'Delete soon-gone' }).click();
	await card.getByRole('button', { name: /Confirm delete soon-gone/ }).click();
	await expect(card).toHaveCount(0);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const path = await download(page, 'webpage');
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /“soon-gone” could not be shown/ }).first()).toBeVisible({ timeout: 30_000 });
	const html = readFileSync(path, 'utf8');
	const tag = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).find((t) => /alt="A green probe"/.test(t));
	expect(tag, 'an <img> for the missing photo').toBeTruthy();
	expect(/\ssrc="([^"]*)"/.exec(tag as string)?.[1] ?? '', 'the stand-in, drawn').toMatch(/^data:image\/svg\+xml/);
	expect(html, 'no dead object URL').not.toMatch(/blob:https?:/);
});

// A Markdown file cannot hold a picture, so a deck that names a Library photo downloads as a .zip: the .md beside
// photos/<name>.png, with the reference rewritten to that path. The oracle is the downloaded archive: the photo
// bytes are the PNG the probe drew, and the .md names that path and leaves no `asset:` behind.
onEveryEngine('@smoke a Markdown export of a deck that names a photo carries the photo beside the .md', async ({ page }) => {
	await setUp(page);
	const path = await download(page, 'markdown');
	const zip = await JSZip.loadAsync(readFileSync(path));
	const files = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
	expect(files).toHaveLength(2);
	expect(files).toContain('photos/export-probe.png');
	const md = await zip.file(files.find((f) => f.endsWith('.md')) as string)!.async('string');
	expect(md).toContain('![A green probe](photos/export-probe.png)');
	expect(md).not.toContain('asset:');
	const png = await zip.file('photos/export-probe.png')!.async('nodebuffer');
	expect(await greenShare(page, png), 'the carried photo is the probe').toBeGreaterThan(0.9);
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Markdown ready/ }).first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /stand-in|not inside/i })).toHaveCount(0);
});

// The Marp bundle already has an photos/ folder for Lattice's sample art; the photo goes in the same one.
onEveryEngine('@smoke a Marp bundle carries the photo in photos/ and names it in the deck', async ({ page }) => {
	await setUp(page);
	const path = await download(page, 'marp');
	const zip = await JSZip.loadAsync(readFileSync(path));
	const photo = Object.keys(zip.files).find((f) => f.endsWith('/photos/export-probe.png'));
	expect(photo, 'the photo rides in the bundle').toBeTruthy();
	const md = Object.keys(zip.files).find((f) => /^[^/]+\/[^/]+\.md$/.test(f) && !/README|AGENTS/i.test(f));
	const deck = await zip.file(md as string)!.async('string');
	expect(deck).toContain('photos/export-probe.png');
	expect(deck).not.toContain('asset:export-probe');
	expect(await greenShare(page, await zip.file(photo as string)!.async('nodebuffer'))).toBeGreaterThan(0.9);
});

// The `.lattice` is the file a co-presenter EDITS from, so it carries the photos the deck names (the toggle
// is on by default) and the importer puts them back. The oracle is a SECOND browser profile with an empty
// Library opening the downloaded file and drawing the photo; a unit test of the zip would pass with the
// photo in the wrong place.
onEveryEngine('@smoke a .lattice carries the photo, and a fresh browser profile opens it with the picture', async ({ page, browser }) => {
	await setUp(page);
	const path = await download(page, 'lattice');
	const zip = await JSZip.loadAsync(readFileSync(path));
	expect(Object.keys(zip.files), 'the photo rides inside the file').toEqual(expect.arrayContaining(['media.json', 'media/export-probe.png']));
	// Anchor on the export's own toast, then say what must be absent: no stand-in warning when every photo went in.
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Lattice project ready/ }).first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /stand-in|not inside this file/i })).toHaveCount(0);

	const other = await browser.newContext({ baseURL: new URL(page.url()).origin, acceptDownloads: true });
	try {
		const p2 = await other.newPage();
		await gotoStudio(p2);
		await p2.setViewportSize({ width: 1440, height: 900 });
		await p2.locator('input[type="file"][accept*=".lattice"]').setInputFiles({ name: 'probe.lattice', mimeType: 'application/zip', buffer: readFileSync(path) });
		await expect(p2.getByText(/Added 1 photo from the file to your Library/).first()).toBeVisible({ timeout: 30_000 });
		const img = p2.locator('[aria-label="Live deck preview"] iframe.live').contentFrame().locator('img[alt="A green probe"]').first();
		await expect(img).toHaveAttribute('src', /^blob:/, { timeout: 40_000 });
		// The picture, not the stand-in: the browser's own decoder reads the pixel.
		const px = await img.evaluate(async (el) => {
			const i = el as HTMLImageElement;
			await i.decode();
			const c = document.createElement('canvas');
			c.width = i.naturalWidth;
			c.height = i.naturalHeight;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.drawImage(i, 0, 0);
			return { w: i.naturalWidth, rgb: Array.from(g.getImageData(10, 10, 1, 1).data.slice(0, 3)) };
		});
		expect(px).toEqual({ w: 640, rgb: GREEN });
	} finally {
		await other.close();
	}
});

// A re-openable PDF embeds the same `.lattice`, photos included (up to MAX_EMBEDDED_MEDIA_BYTES). The oracle is a
// SECOND browser profile with an empty Library importing the PDF and drawing the photo.
onEveryEngine('@smoke a re-openable PDF carries the photo, and a fresh browser profile opens it with the picture', async ({ page, browser }) => {
	await setUp(page);
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const sw = dialog.getByRole('switch', { name: 'Re-openable in Lattice' });
	if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'true');
	const pending = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const path = (await (await pending).path()) as string;
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /PDF ready/ }).first()).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /not inside the re-openable copy/i })).toHaveCount(0);

	const other = await browser.newContext({ baseURL: new URL(page.url()).origin, acceptDownloads: true });
	try {
		const p2 = await other.newPage();
		await gotoStudio(p2);
		await p2.setViewportSize({ width: 1440, height: 900 });
		await p2.locator('input[type="file"][accept*=".lattice"]').setInputFiles({ name: 'probe.pdf', mimeType: 'application/pdf', buffer: readFileSync(path) });
		await expect(p2.getByText(/Added 1 photo from the file to your Library/).first()).toBeVisible({ timeout: 30_000 });
		const img = p2.locator('[aria-label="Live deck preview"] iframe.live').contentFrame().locator('img[alt="A green probe"]').first();
		await expect(img).toHaveAttribute('src', /^blob:/, { timeout: 40_000 });
	} finally {
		await other.close();
	}
});

// The switch is real: turned off, the file keeps the name only and the toast says the photo is not inside it.
onEveryEngine('@smoke turning "Include photos" off leaves the photo out of the .lattice and says so', async ({ page }) => {
	await setUp(page);
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: /^Lattice project/ }).click();
	const sw = dialog.getByRole('switch', { name: 'Include photos' });
	await expect(sw, 'on by default').toHaveAttribute('aria-checked', 'true');
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	const pending = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /^Download project/ }).click();
	const zip = await JSZip.loadAsync(readFileSync((await (await pending).path()) as string));
	expect(Object.keys(zip.files).filter((n) => n.startsWith('media'))).toEqual([]);
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: /“export-probe”\) is not inside this file/ }).first()).toBeVisible({ timeout: 30_000 });
});
