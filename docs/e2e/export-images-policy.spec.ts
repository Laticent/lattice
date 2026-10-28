import { readFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { CHROME, expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The picture policy (lib/core/image-policy.js) on the REAL Studio: the Share → PDF panel's "Pictures"
// choice decides whether a large photo is embedded as the PNG the author added or re-encoded as a JPEG.
// The oracle is the downloaded FILE: the encoding and size of the page's largest image stream.
test.describe.configure({ timeout: 300_000 });

// `desktop` (Chromium) drops a title carrying `@webkit-*` unless it also carries `@crosswidth`, so each oracle is
// defined twice: the `@gecko` copy runs on Chromium desktop AND Firefox, the `@webkit-tablet` copy on real WebKit.
const onEveryEngine = (title: string, body: (fixtures: { page: Page; browser: Browser }) => Promise<void>) => {
	for (const tag of [' @gecko', ' @webkit-tablet']) test(`${title}${tag}`, body);
};

async function addBigPhoto(page: Page, name: string) {
	await page.evaluate(async (fileName) => {
		// Photo-like: a smooth gradient with a little grain, 1600 x 1000. A PNG of it is about 2.5 MB; its JPEG a fifth of that.
		const c = document.createElement('canvas');
		c.width = 1600;
		c.height = 1000;
		const g = c.getContext('2d') as CanvasRenderingContext2D;
		const grad = g.createLinearGradient(0, 0, 1600, 1000);
		grad.addColorStop(0, '#3a6ea5');
		grad.addColorStop(1, '#e8b04a');
		g.fillStyle = grad;
		g.fillRect(0, 0, 1600, 1000);
		const img = g.getImageData(0, 0, 1600, 1000);
		let seed = 12345;
		for (let i = 0; i < img.data.length; i += 4) {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			const n = ((seed >>> 24) % 13) - 6;
			img.data[i] += n;
			img.data[i + 1] += n;
			img.data[i + 2] += n;
		}
		g.putImageData(img, 0, 0);
		const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
		const dt = new DataTransfer();
		dt.items.add(new File([blob], fileName, { type: 'image/png' }));
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		for (let i = 0; i < 200; i++) {
			const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim().startsWith('Add photo')) as HTMLButtonElement | undefined;
			if (b) {
				// The probe must stay the PNG it is: ask the Library for the original.
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

/** The largest image stream on page 1: its filter and byte length. */
async function biggestImage(pdf: Uint8Array) {
	const doc = await PDFDocument.load(pdf, { updateMetadata: false });
	const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
	let best = { filter: '', bytes: 0 };
	for (const [, ref] of xobjects?.entries() ?? []) {
		const img = doc.context.lookup(ref);
		if (!(img instanceof PDFRawStream) || img.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
		const bytes = img.getContents().length;
		if (bytes > best.bytes) best = { filter: img.dict.get(PDFName.of('Filter'))?.toString() ?? '', bytes };
	}
	return best;
}

async function exportPdfWith(page: Page, pictures: RegExp | null) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	if (pictures) {
		await dialog.getByRole('combobox', { name: 'Pictures' }).click();
		await page.getByRole('option', { name: pictures }).click();
	}
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const bytes = new Uint8Array(readFileSync((await (await download).path()) as string));
	await page.keyboard.press('Escape');
	return biggestImage(bytes);
}

onEveryEngine('@smoke Share → PDF shrinks a big photo by default, and Original quality embeds it as added', async ({ page }) => {
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Media', exact: true }).click();
	await page.getByRole('button', { name: 'Filter' }).click();
	await page.getByRole('menuitemradio', { name: 'Images' }).click();
	await addBigPhoto(page, 'Grain.png');
	await expect(page.locator('[data-media-card="grain"]')).toBeVisible();
	await setEditorContent(page, '# Grain\n\n![A gradient photo](asset:grain)\n');
	await expect(page.locator('[aria-label="Live deck preview"] iframe.live').contentFrame().locator('img[alt="A gradient photo"]').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

	const optimized = await exportPdfWith(page, null);
	const original = await exportPdfWith(page, /Original quality/);
	expect(original.filter, 'Original quality embeds the PNG the author added').toBe('/FlateDecode');
	expect(original.bytes, 'the PNG is big enough for the test to mean something').toBeGreaterThan(900_000);
	expect(optimized.filter, 'the default re-encodes it as a JPEG').toBe('/DCTDecode');
	expect(optimized.bytes, 'and the file is much smaller').toBeLessThan(original.bytes * 0.5);
});

onEveryEngine('@smoke a 4K deck exports its PDF at HD by default, and 4K when the author picks it', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '---\nsize: 4k\n---\n\n# Resolution probe\n\n- One\n- Two\n');
	const pageWidth = async (resolution: RegExp | null) => {
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /^PDF/ }).click();
		// The control exists only because the deck is 4K, and says what the bigger file costs.
		await dialog.getByRole('combobox', { name: 'Resolution' }).click();
		await expect(page.getByRole('option', { name: /4K/ })).toContainText(/about 1\.6.? larger/);
		await page.getByRole('option', { name: resolution ?? /^HD/ }).click();
		const download = page.waitForEvent('download', { timeout: 240_000 });
		await dialog.getByRole('button', { name: /^Download PDF/ }).click();
		const bytes = new Uint8Array(readFileSync((await (await download).path()) as string));
		await page.keyboard.press('Escape');
		return (await PDFDocument.load(bytes, { updateMetadata: false })).getPage(0).getSize().width;
	};
	expect(await pageWidth(null), 'HD: 1280 px is 960 pt').toBe(960);
	expect(await pageWidth(/^4K/), '4K: 3840 px is 2880 pt').toBe(2880);
});
