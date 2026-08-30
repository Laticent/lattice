import { expect, gotoStudio, test, toastText } from './studio-fixture';

// The Share sheet — the deck's export path (PDF / PowerPoint / Markdown / Marp).
// The exports run the real pipeline; offline they either succeed or report a
// failure toast, so we assert the sheet structure and that an export reports a
// result (never a silent no-op). The sheet is a Radix dialog with no aria-label
// (labeled via aria-labelledby), and each row's accessible name is
// "<title><description>", so options are matched by a leading-anchored name.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

test('the Share sheet lists the export options', async ({ page }) => {
	const sheet = page.getByRole('dialog');
	await expect(sheet.getByRole('button', { name: /^PDF/ })).toBeVisible();
	await expect(sheet.getByRole('button', { name: /^PowerPoint/ })).toBeVisible();
	await expect(sheet.getByRole('button', { name: /^Markdown/ })).toBeVisible();
	await expect(sheet.getByRole('button', { name: /^Marp bundle/ })).toBeVisible();
});

test('exporting Markdown reports a result', async ({ page }) => {
	// /^Markdown/ avoids matching the "Print source … the Markdown" row.
	await page.getByRole('dialog').getByRole('button', { name: /^Markdown/ }).click();
	// Success ("Markdown ready.") or an honest failure ("Markdown failed: …") — but
	// never nothing.
	await expect(toastText(page)).toContainText(/Markdown (ready|failed)/);
});
