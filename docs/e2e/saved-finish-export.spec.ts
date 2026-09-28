import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { expect, gotoStudio, setEditorContent, shareExport, test } from './studio-fixture';

// A finish saved in Fabricate must survive the Studio's own exports (followups.d 2388-p1).
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

test('a finish saved in Fabricate is painted in the Studio image export', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	await page.getByRole('textbox', { name: 'Finish name' }).fill('probegrid');
	await page.getByRole('combobox', { name: 'Texture type' }).click();
	await page.getByRole('option', { name: 'Grid', exact: true }).click();
	await page.getByRole('button', { name: /^Save/ }).first().click();
	await expect(page.getByText(/Saved/).first()).toBeVisible();
	await page.getByRole('button', { name: 'Back to Compose' }).click();

	await setEditorContent(page, deck('finish-probegrid'));
	const withFinish = await exportSlideTwo(page);
	await setEditorContent(page, deck('none'));
	const control = await exportSlideTwo(page);

	// Decode both PNGs in the page and count the pixels that differ by more than 8 levels.
	const differing = await page.evaluate(async ([a, b]) => {
		const load = async (b64: string) => {
			const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
			const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
			const canvas = new OffscreenCanvas(bmp.width, bmp.height);
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bmp, 0, 0);
			return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
		};
		const [pa, pb] = await Promise.all([load(a), load(b)]);
		let n = 0;
		for (let i = 0; i < pa.length; i += 4) {
			if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > 8) n++;
		}
		return n / (pa.length / 4);
	}, [withFinish, control] as const);
	// Before the fix: 0.0 (identical). After: ~0.106 (the wash and the grid).
	expect(differing).toBeGreaterThan(0.03);
});
