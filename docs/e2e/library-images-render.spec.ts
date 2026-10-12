import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// `asset:<name>` renders in the live preview, on the real Studio
// (engineering/decisions/2026-10-12-library-media-assets.md §2).
//
// What jsdom cannot show and this does: the picture is a `blob:` object URL minted in the page,
// painted inside a sandboxed preview frame under its own content-security policy. A unit test
// proves the engine rewrote the reference; only a real frame proves the browser then LOADED it.
//   · a prose image and a background image both paint (naturalWidth > 0 / a blob: background),
//   · deleting the asset re-renders the slide to the drawn stand-in, not a broken image,
//   · the Library card counts the deck that names the asset.

async function addPng(page: Page, name: string, size: { w: number; h: number; color?: string } = { w: 800, h: 600 }) {
	await page.evaluate(
		async ({ fileName, w, h, color }) => {
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.fillStyle = color;
			g.fillRect(0, 0, w, h);
			const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
			const dt = new DataTransfer();
			dt.items.add(new File([blob], fileName, { type: 'image/png' }));
			const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
			input.files = dt.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		},
		{ fileName: name, w: size.w, h: size.h, color: size.color ?? '#10a05a' },
	);
}

test('@smoke a Library photo paints in the live preview, and deleting it falls back to the stand-in @webkit-tablet @gecko', async ({ page }, testInfo) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await addPng(page, 'Probe Photo.png');
	await expect(page.locator('[data-media-card="probe-photo"]')).toBeVisible();

	// A prose image on the first slide.
	await setEditorContent(page, '# Library photo\n\n![A green probe](asset:probe-photo)\n');
	const prose = livePreview(page).locator('img[alt="A green probe"]').first();
	await expect(prose).toBeVisible({ timeout: 30_000 });
	await expect.poll(async () => prose.getAttribute('src'), { message: 'the reference resolved to an object URL' }).toMatch(/^blob:/);
	await expect
		.poll(async () => prose.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : -1)), { message: 'the browser LOADED the picture inside the sandboxed frame' })
		.toBe(800);

	// The Library counts the deck that names it (the shell persists the source on a short debounce).
	await expect(page.locator('[data-media-card="probe-photo"]').getByText(/used in 1 deck/)).toBeVisible({ timeout: 15_000 });
	await page.screenshot({ path: testInfo.outputPath('asset-renders.png') });

	// An image slide's background paints too.
	await setEditorContent(page, '<!-- _class: image -->\n\n## Cover\n\n![bg](asset:probe-photo)\n');
	await expect
		.poll(async () => livePreview(page).locator('.lattice-bg').first().evaluate((el) => getComputedStyle(el).backgroundImage), { timeout: 30_000 })
		.toMatch(/blob:/);

	// Delete the asset. The slide must re-render to the drawn stand-in — not keep the dead blob URL,
	// and not show a broken-image icon.
	await setEditorContent(page, '# Library photo\n\n![A green probe](asset:probe-photo)\n');
	await expect(livePreview(page).locator('img[alt="A green probe"]').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
	await page.locator('[data-media-card="probe-photo"]').getByRole('button', { name: 'Delete probe-photo' }).click();
	await page.locator('[data-media-card="probe-photo"]').getByRole('button', { name: /Confirm delete probe-photo/ }).click();
	await expect(page.locator('[data-media-card="probe-photo"]')).toHaveCount(0);
	await expect(livePreview(page).locator('img[alt="A green probe"]').first()).toHaveAttribute('src', /^data:image\/svg\+xml/, { timeout: 30_000 });
	await page.screenshot({ path: testInfo.outputPath('asset-deleted.png') });
});

test('@smoke a deck-only photo renders in its own deck, and flipping it to shared keeps it rendering @webkit-tablet @gecko', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await page.getByRole('tab', { name: 'This deck' }).click();
	await addPng(page, 'Mine.png');
	const card = page.locator('[data-media-card="mine"]');
	await expect(card.getByText('This deck', { exact: true })).toBeVisible();

	await setEditorContent(page, '# Mine\n\n![mine](asset:mine)\n');
	const img = livePreview(page).locator('img[alt="mine"]').first();
	await expect(img).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
	const before = await img.getAttribute('src');

	await card.getByRole('button', { name: /Share to all decks/ }).click();
	await expect(card.getByText('All decks', { exact: true })).toBeVisible();
	// Same name, same object URL: a scope flip must not blink the picture out and back.
	await expect(img).toHaveAttribute('src', before as string);
	expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(800);
});

// The collage reads each photo's SHAPE to pack them edge to edge. Library photos are blob: URLs the
// build-time reader cannot open, so the live preview has to learn the shape another way; this
// proves the tiles paint and fill the frame, not just that the references resolved.
test('@smoke a collage of Library photos paints every tile and fills its frame @webkit-tablet @gecko', async ({ page }, testInfo) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	const shapes = [
		{ n: 'tall', w: 600, h: 900, color: '#d02828' },
		{ n: 'wide', w: 1200, h: 600, color: '#2840d0' },
		{ n: 'square', w: 800, h: 800, color: '#10a05a' },
		{ n: 'pano', w: 1800, h: 600, color: '#d0a028' },
	];
	for (const s of shapes) {
		await addPng(page, `${s.n}.png`, s);
		await expect(page.locator(`[data-media-card="${s.n}"]`)).toBeVisible();
	}
	await setEditorContent(page, `<!-- _class: collage -->\n\n## Library photos\n\n${shapes.map((s) => `- ![${s.n}](asset:${s.n})`).join('\n')}\n`);
	const imgs = livePreview(page).locator('img[src^="blob:"]');
	await expect(imgs).toHaveCount(4, { timeout: 30_000 });
	const loaded = await imgs.evaluateAll((els) => (els as HTMLImageElement[]).map((el) => ({ w: el.naturalWidth, box: el.getBoundingClientRect().width * el.getBoundingClientRect().height })));
	for (const l of loaded) {
		expect(l.w, 'each tile loaded a picture').toBeGreaterThan(0);
		expect(l.box, 'each tile has a real box').toBeGreaterThan(400);
	}
	await page.screenshot({ path: testInfo.outputPath('collage-assets.png') });
});

// The presenter is a second surface: its own frame, its own sanitizer pass. It has to load the same
// object URL the preview did, or a deck that looked right while editing shows a hole on stage.
test('@smoke a Library photo paints in the Present overlay @webkit-tablet @gecko', async ({ page }, testInfo) => {
	test.slow();
	await gotoStudio(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await addPng(page, 'Stage.png', { w: 800, h: 450, color: '#2840d0' });
	await expect(page.locator('[data-media-card="stage"]')).toBeVisible();
	await setEditorContent(page, '# On stage\n\n![on stage](asset:stage)\n');
	await expect(livePreview(page).locator('img[alt="on stage"]').first()).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const stage = dialog.locator('iframe').first().contentFrame().locator('img[alt="on stage"]').first();
	await expect(stage).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
	await expect.poll(async () => stage.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : -1))).toBe(800);
	await page.screenshot({ path: testInfo.outputPath('present-asset.png') });
});
