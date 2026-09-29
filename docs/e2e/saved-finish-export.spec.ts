import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import JSZip from 'jszip';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, shareExport, test } from './studio-fixture';

// A finish saved in Fabricate must survive the Studio's own exports (backdrop-register.md §4.9).
// It did not: the Studio scopes the engine stylesheet under `article.lattice >`, which lifts
// the engine's export flip (`--fin-texture: var(--fin-texture-opaque, none)`) above the saved
// finish's own export rule, and a saved finish declared no `-opaque` mirror for the flip to land
// on. Every layer fell to `none`, so the exported slide came out identical to `finish: none`
// while the preview showed the finish. The generator now writes the mirrors
// (lib/finishes/finish-generate.js `opaqueMirrorDecls`).
//
// The oracle compares two exports of the same slide, one wearing the saved finish and one with
// `finish: none`, pixel by pixel. Share → Images is one of the three raster lanes (PDF and PPTX
// photograph through the same capture); the zip carries each slide as a PNG.

test.describe.configure({ timeout: 240_000 });

const deck = (finish: string) =>
	`---\ntitle: Probe\nfinish: ${finish}\n---\n\n# Probe title\n\n---\n\n## A content slide\n\nBody text on a saved finish.\n`;

async function exportSlideTwo(page: Page): Promise<string> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await shareExport(page, 'images');
	const file = await download;
	const zip = await JSZip.loadAsync(readFileSync((await file.path()) as string));
	const entry = Object.keys(zip.files).find((n) => /slides\/[^/]*-02\.png$/.test(n));
	expect(entry, 'the image set carries slide 2').toBeTruthy();
	const png = await zip.file(entry as string)!.async('base64');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	return png;
}

// Save a Fabricate finish named `name` wearing the Grid texture, optionally with the Spotlight
// backdrop mask on, and return to Compose.
async function saveGridFinish(page: Page, name: string, { spotlight = false } = {}): Promise<void> {
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	await page.getByRole('textbox', { name: 'Finish name' }).fill(name);
	await page.getByRole('combobox', { name: 'Texture type' }).click();
	await page.getByRole('option', { name: 'Grid', exact: true }).click();
	if (spotlight) {
		const box = page.getByRole('checkbox', { name: 'Spotlight one area' });
		await box.click();
		await expect(box).toBeChecked();
		// Open the window to its widest (70%), so the whole-slide share clears the 3% bar.
		const radius = page.getByRole('slider', { name: 'Radius' });
		await radius.focus();
		await page.keyboard.press('End');
		await expect(radius).toHaveValue('70');
	}
	await page.getByRole('button', { name: /^Save/ }).first().click();
	await expect(page.getByText(/Saved/).first()).toBeVisible();
	await page.getByRole('button', { name: 'Back to Compose' }).click();
}

// The share of pixels that differ by more than 8 levels in any channel between two same-size
// PNGs (base64), decoded in the page.
async function differingShare(page: Page, a: string, b: string): Promise<number> {
	return page.evaluate(async ([a, b]) => {
		const load = async (b64: string) => {
			const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
			const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
			const canvas = new OffscreenCanvas(bmp.width, bmp.height);
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bmp, 0, 0);
			return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
		};
		const [pa, pb] = await Promise.all([load(a), load(b)]);
		if (pa.length !== pb.length) return 1;
		let n = 0;
		for (let i = 0; i < pa.length; i += 4) {
			if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > 8) n++;
		}
		return n / (pa.length / 4);
	}, [a, b] as const);
}

test('a finish saved in Fabricate is painted in the Studio image export', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await saveGridFinish(page, 'probegrid');

	await setEditorContent(page, deck('finish-probegrid'));
	const withFinish = await exportSlideTwo(page);
	await setEditorContent(page, deck('none'));
	const control = await exportSlideTwo(page);

	// Before the fix: 0.0 (identical). After: ~0.106 (the wash and the grid).
	expect(await differingShare(page, withFinish, control)).toBeGreaterThan(0.03);
});

// `finish-override:` REGENERATES the active saved finish's CSS from the merged recipe
// (StudioShell `finishExtraCss` → `generateFinishCss`), so it has to carry the `-opaque` mirrors
// too, or the override would export as `finish: none`. The override raises the grid from its
// default intensity 7 to 18, so the test also proves the override reached the export: it must
// differ from the same finish without the override.
test('a finish-override: regenerated finish is painted in the Studio image export', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await saveGridFinish(page, 'probeover');

	const overridden = `---\ntitle: Probe\nfinish: finish-probeover\nfinish-override:\n  texture:\n    intensity: 18\n---\n\n# Probe title\n\n---\n\n## A content slide\n\nBody text on a saved finish.\n`;
	await setEditorContent(page, overridden);
	const withOverride = await exportSlideTwo(page);
	await setEditorContent(page, deck('finish-probeover'));
	const baked = await exportSlideTwo(page);
	await setEditorContent(page, deck('none'));
	const control = await exportSlideTwo(page);

	const vsNone = await differingShare(page, withOverride, control);
	const vsBaked = await differingShare(page, withOverride, baked);
	console.log(`finish-override: vs none ${vsNone.toFixed(4)}, vs baked ${vsBaked.toFixed(4)}`);
	expect(vsNone, 'the overridden finish paints in the export').toBeGreaterThan(0.03);
	expect(vsBaked, 'and it is the OVERRIDDEN recipe that paints, not the baked one').toBeGreaterThan(0.005);
});

// A baked SPOTLIGHT keeps its feathered mask in the raster (the exporting rule filters the hard
// mirror out, backdrop-register.md §4.8) and hides the finish outside one window, so it is the
// saved finish most likely to export as nothing at all. At the default 38% radius the window is
// painted but covers ~2.5% of the slide's pixels, under the bar, so the test opens it to 70%.
test('a spotlight finish saved in Fabricate is painted in the Studio image export', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await saveGridFinish(page, 'probespot', { spotlight: true });

	await setEditorContent(page, deck('finish-probespot'));
	const withSpot = await exportSlideTwo(page);
	await setEditorContent(page, deck('none'));
	const control = await exportSlideTwo(page);

	const share = await differingShare(page, withSpot, control);
	console.log(`spotlight: vs none ${share.toFixed(4)}`);
	expect(share).toBeGreaterThan(0.03);
});

// Studio PRINT (desktop, 1-up) hands a vector document to `print()` in an offscreen frame, where
// the saved finish's `@media print` rule meets the engine's print flip at the same scoped
// specificity as the export flip. `print()` opens a dialog Playwright cannot drive, so it is
// stubbed; the test takes the exact document the dialog would have printed, prints it with
// Chromium's own print pipeline (`page.pdf()`, print media), rasterizes page 2 and compares it
// with the same path on `finish: none`. That is the dialog's engine, not the dialog itself.
async function printSlideTwo(page: Page, context: BrowserContext, testInfo: TestInfo, tag: string): Promise<string> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await dialog.getByRole('button', { name: 'Print', exact: true }).click();
	const frame = page.locator('iframe[style*="-10000px"]').last();
	await expect(frame).toBeAttached({ timeout: 60_000 });
	const srcdoc = (await frame.getAttribute('srcdoc')) as string;
	expect(srcdoc, 'the offscreen print document').toBeTruthy();
	// The print frame took focus to print, so an Escape must start from the sheet itself; the
	// Print drawer is a sub-view, so it can take one Escape to leave it and one to close.
	await expect(async () => {
		await dialog.getByRole('heading').first().click();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden({ timeout: 1_000 });
	}).toPass({ timeout: 15_000 });

	const printer = await context.newPage();
	await printer.goto('/');
	await printer.setContent(srcdoc, { waitUntil: 'load' });
	await printer.emulateMedia({ media: 'print' });
	await expect(printer.locator('.lattice')).toBeVisible({ timeout: 60_000 });
	await printer.evaluate(() => document.fonts.ready);
	const pdf = path.join(testInfo.outputDir, `print-${tag}.pdf`);
	await printer.pdf({ path: pdf, preferCSSPageSize: true });
	await printer.close();
	const stem = path.join(testInfo.outputDir, `print-${tag}`);
	execFileSync('pdftoppm', ['-f', '2', '-l', '2', '-r', '96', '-png', '-singlefile', pdf, stem]);
	return readFileSync(`${stem}.png`).toString('base64');
}

test('a finish saved in Fabricate is painted in the Studio print document', async ({ page, context }, testInfo) => {
	await page.addInitScript(() => { window.print = () => {}; });
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await saveGridFinish(page, 'probeprint');

	await setEditorContent(page, deck('finish-probeprint'));
	const withFinish = await printSlideTwo(page, context, testInfo, 'finish');
	await setEditorContent(page, deck('none'));
	const control = await printSlideTwo(page, context, testInfo, 'none');

	const share = await differingShare(page, withFinish, control);
	console.log(`print: vs none ${share.toFixed(4)}`);
	expect(share).toBeGreaterThan(0.03);
});

// The frame keyline (gallery, and Fabricate's Inset frame) is drawn on top of the finish now
// (backdrop-register.md §4.10). As the section's inset shadow it painted UNDER every finish layer,
// and an export face's wash ends on solid canvas, so no export had a frame. The oracle samples a
// row across the left keyline of an exported gallery slide: the line's pixels must differ from
// the canvas just inside it.
test('the gallery frame keyline survives the Studio image export', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, deck('gallery'));
	const png = await exportSlideTwo(page);
	const contrast = await page.evaluate(async (b64) => {
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
		const canvas = new OffscreenCanvas(bmp.width, bmp.height);
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(bmp, 0, 0);
		const y = Math.round(bmp.height / 2);
		const cqi = bmp.width / 100;
		// Darkest pixel inside the keyline band vs the canvas 2 cqi further in.
		const row = ctx.getImageData(0, y, Math.ceil(4 * cqi), 1).data;
		const lum = (x: number) => (row[x * 4] + row[x * 4 + 1] + row[x * 4 + 2]) / 3;
		let line = 255;
		for (let x = Math.floor(1.0 * cqi); x <= Math.ceil(1.45 * cqi); x++) line = Math.min(line, lum(x));
		return lum(Math.round(3.3 * cqi)) - line;
	}, png);
	// Before the fix: ~0 (no line). After: the keyline, tens of levels darker than the canvas.
	expect(contrast).toBeGreaterThan(15);
});
