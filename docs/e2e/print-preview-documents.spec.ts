import { countDocuments, documentsMade } from './preview-documents';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

// The Print drawer must not build a preview document per page. WebKit never frees a destroyed
// preview document (preview-pool.tsx has the measurements), so on an iPad every document the
// drawer built was memory the tab kept for the rest of the session.
//
// Measured on the real Studio before the drawer's cells moved onto the preview pool (documents
// created; `documentsMade` counts each iframe AND each srcdoc write, so one document reads 2):
//
//   first open        +2    5 sheet flips at 1-up  +10    switch to 4-up  +8
//   2 flips at 4-up  +16    reopen                 +2     print, then reprint unchanged  +2, +2
//
// After: flips +0, reprint +0. Opening still builds the pool's first frame (+2), and 4-up grows
// the pool to four frames once (+6); both are one-time, not per page.

test.describe.configure({ timeout: 240_000 });

const DECK = `---\ntitle: Probe\n---\n\n${Array.from({ length: 12 }, (_, i) => `## Slide ${i + 1}\n\nBody ${i + 1}.`).join('\n\n---\n\n')}\n`;

test('paging the Print drawer and reprinting build no new preview documents', async ({ page }) => {
	// `print()` opens a modal Playwright cannot dismiss; everything up to it is the real path.
	await page.addInitScript(() => { window.print = () => {}; });
	await countDocuments(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);

	const dialog = page.getByRole('dialog');
	const next = dialog.getByRole('button', { name: 'Next sheet' });
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
	await expect(next).toBeEnabled({ timeout: 60_000 });
	await expect(dialog.getByRole('img', { name: 'Print preview slide 1' })).toBeVisible();
	// The pool assigns its frames on a short debounce, so count from once they exist.
	const frames = dialog.locator('[data-slide-frame] iframe');
	await expect(frames).toHaveCount(1, { timeout: 30_000 });

	let before = await documentsMade(page);
	for (let i = 2; i <= 6; i++) {
		await next.click();
		await expect(dialog.getByRole('img', { name: `Print preview slide ${i}` })).toBeVisible();
	}
	expect(await documentsMade(page), 'five sheet flips at 1-up re-point the pooled frame').toBe(before);

	await dialog.getByRole('radio', { name: '4-up', exact: true }).click();
	// Slide 6 was showing, so 4-up clamps to the last sheet (slides 9–12); two flips wrap to
	// sheet 1 and then sheet 2.
	await expect(dialog.getByRole('img', { name: 'Print preview slide 12' })).toBeVisible();
	await expect(frames).toHaveCount(4, { timeout: 30_000 });
	before = await documentsMade(page);
	await next.click();
	await expect(dialog.getByRole('img', { name: 'Print preview slide 1' })).toBeVisible();
	await next.click();
	await expect(dialog.getByRole('img', { name: 'Print preview slide 8' })).toBeVisible();
	expect(await documentsMade(page), 'two sheet flips at 4-up re-point the four pooled frames').toBe(before);

	// Only 1-up prints through the offscreen frame; N-up builds a PDF instead.
	await dialog.getByRole('radio', { name: '1-up', exact: true }).click();
	const print = dialog.getByRole('button', { name: 'Print', exact: true });
	await print.click();
	await expect(page.locator('iframe[style*="-10000px"]')).toBeAttached({ timeout: 60_000 });
	await expect(print).toBeEnabled({ timeout: 60_000 });
	before = await documentsMade(page);
	await print.click();
	await expect(print).toBeEnabled({ timeout: 60_000 });
	expect(await documentsMade(page), 'reprinting the same deck prints the frame it already has').toBe(before);
	await expect(page.locator('iframe[style*="-10000px"]')).toHaveCount(1);
});
