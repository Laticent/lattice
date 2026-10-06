import { expect, gotoStudio, SHARE_EXPORTS, test } from './studio-fixture';

// PRINT ALWAYS PRINTS (the owner's Windows run, 2026-10-05: "don't astonish users"). For
// 2-up, 4-up and the notes handout, Print used to build the PDF and open it in a new tab,
// which a blocked pop-up (and the desktop app, which opens no windows) turned into a SAVE.
// Now every layout prints through the panel's hidden print frame, so Print reaches the
// print dialog and only "Download PDF" makes a file.

test.describe.configure({ timeout: 240_000 });

for (const layout of ['4-up', 'Notes'] as const) {
	test(`Print at ${layout} opens the print dialog: no new window, no download`, async ({ page }) => {
		// `print()` opens a modal Playwright cannot dismiss: count the calls instead, in every
		// frame (the print frame is a child of the Studio's document).
		await page.addInitScript(() => {
			const top = window.top as unknown as { __prints?: number; __opens?: number };
			window.print = () => {
				top.__prints = (top.__prints || 0) + 1;
			};
			const open = window.open;
			window.open = (...args: Parameters<typeof window.open>) => {
				top.__opens = (top.__opens || 0) + 1;
				return open.apply(window, args);
			};
		});
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		const downloads: string[] = [];
		page.on('download', (d) => downloads.push(d.suggestedFilename()));

		const dialog = page.getByRole('dialog');
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		await dialog.getByRole('button', { name: SHARE_EXPORTS.print.row }).click();
		await dialog.getByRole('radio', { name: layout, exact: true }).click();
		const print = dialog.getByRole('button', { name: 'Print', exact: true });
		await expect(print).toBeEnabled({ timeout: 60_000 });
		await print.click();

		await expect.poll(() => page.evaluate(() => (window as unknown as { __prints?: number }).__prints || 0), { timeout: 120_000 }).toBe(1);
		expect(await page.evaluate(() => (window as unknown as { __opens?: number }).__opens || 0)).toBe(0);
		expect(downloads).toEqual([]);
		// The frame holds the deck's sheets: 7 slides are 2 sheets at 4-up, 7 pages as notes.
		const frame = page.frameLocator('iframe[style*="-10000px"]');
		await expect(frame.locator('section.sheet')).toHaveCount(layout === '4-up' ? 2 : 7);
		await expect(frame.locator('section.sheet img').first()).toHaveAttribute('src', /^data:image\//);
		await expect(print).toBeEnabled();
	});
}

test('Ctrl+P opens the Print deck panel, not a print of the Studio', async ({ page }) => {
	await page.addInitScript(() => {
		window.print = () => {
			(window.top as unknown as { __prints?: number }).__prints = ((window.top as unknown as { __prints?: number }).__prints || 0) + 1;
		};
	});
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('ControlOrMeta+p');
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { __prints?: number }).__prints || 0)).toBe(0);
	// With a dialog in front, Ctrl+F leaves the panes behind it alone.
	await page.keyboard.press('ControlOrMeta+f');
	await expect(page.locator('.cm-studio-find, .cs-findbar')).toHaveCount(0);
});
