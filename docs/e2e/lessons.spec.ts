import { expect, gotoStudio, test } from './studio-fixture';

// Studio lessons (engineering/decisions/2026-10-05-studio-lessons.md). Search is the help: typing
// "pdf" offers the action AND the lesson, and a lesson points at the real control, waits for the
// user, and does the step itself if they wait. The oracles are real cause and effect on the live
// Studio: the sheet the lesson opened, the dialog the user's own click opened.

test.describe.configure({ timeout: 90_000 });

const STAGE = '.vetrina-stage';
const PALETTE = 'Search or run a command…';

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

/** Open search the way each width offers it: ⌘K at desktop, the menu's search row on a phone. */
async function search(page: import('@playwright/test').Page, q: string): Promise<void> {
	if ((page.viewportSize()?.width ?? 1440) < 700) {
		await page.getByRole('button', { name: 'Menu' }).click();
		await page.getByRole('button', { name: 'Search / commands' }).click();
	} else {
		await page.keyboard.press('ControlOrMeta+k');
	}
	await page.getByPlaceholder(PALETTE).fill(q);
}

test('searching "pdf" offers the action and the lesson, and the action opens the PDF step @crosswidth', async ({ page }) => {
	await search(page, 'pdf');
	await expect(page.getByRole('option', { name: 'Export as PDF…', exact: true })).toBeVisible();
	await expect(page.getByRole('option', { name: 'How do I export a PDF?', exact: true })).toBeVisible();
	await page.getByRole('option', { name: 'Export as PDF…', exact: true }).click();
	await expect(page.locator('[data-demo="pdf-download"]')).toBeVisible();
});

test('a lesson does the steps itself when the user waits, and leaves the download to them @crosswidth', async ({ page }) => {
	await search(page, 'pdf');
	await page.getByRole('option', { name: 'How do I export a PDF?', exact: true }).click();
	await expect(page.locator(STAGE)).toBeVisible();
	await expect(page.locator(STAGE)).toContainText('Click Share');
	// Nobody touches anything: after the turn window the lesson opens Share, then picks PDF.
	await expect(page.locator('[data-demo="share-pdf"]')).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('[data-demo="pdf-download"]')).toBeVisible({ timeout: 20_000 });
	await expect(page.locator(STAGE)).toContainText('Download PDF', { timeout: 20_000 });
	// The last step is the user's: the lesson ends without exporting anything.
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 30_000 });
	await expect(page.locator('[data-demo="pdf-download"]')).toBeEnabled();
});

test('a lesson moves on when the user presses the control themselves', async ({ page }) => {
	await search(page, 'present');
	await page.getByRole('option', { name: 'How do I present?', exact: true }).click();
	await expect(page.locator(STAGE)).toContainText('Click Present');
	await page.locator('button[data-demo="present"]').click();
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
	await expect(page.locator(STAGE)).toContainText('arrow keys');
});

test('any other input ends the lesson at once', async ({ page }) => {
	await search(page, 'theme');
	await page.getByRole('option', { name: 'How do I change the theme?', exact: true }).click();
	await expect(page.locator(STAGE)).toBeVisible();
	await page.keyboard.press('a');
	await expect(page.locator(STAGE)).toHaveCount(0);
});
