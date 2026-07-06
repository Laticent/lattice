import { expect, gotoStudio, test } from './studio-fixture';

// The ⌘K command palette: opens on the keyboard shortcut, and each command runs
// its action and closes the dialog.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('Meta/Control+K opens the command palette', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeHidden();
});

test('"Reshape for a reader" opens the Architect coach', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	const search = page.getByPlaceholder('Search or run a command…');
	await search.fill('Reshape');
	await page.getByRole('option', { name: 'Reshape for a reader' }).click();

	// The command reveals the Architect coach (home of the Reshape card).
	await expect(page.getByRole('button', { name: 'Coach' })).toBeVisible();
});

test('"Present" opens the present overlay', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	const search = page.getByPlaceholder('Search or run a command…');
	await search.fill('Present');
	await page.getByRole('option', { name: 'Present', exact: true }).click();

	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
});
