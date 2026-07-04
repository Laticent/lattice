import { currentSlide, expect, gotoStudio, test } from './studio-fixture';

// Responsive behavior at mobile width (390): the studio collapses to a single
// swappable Edit/Preview pane, with the Architect and Inspector moving into
// sheets. The two-pane layout applies at ≥ tablet, so these are @mobile-tagged
// and run on the mobile project only.

test('@mobile the studio collapses to a swappable Edit/Preview pane', async ({ page }) => {
	await gotoStudio(page);

	// Default pane is Preview → the engine has painted (gotoStudio proved it) and
	// the editor is not mounted in the pane yet.
	await expect(page.getByLabel('Deck source')).toBeHidden();

	// Switch to the Edit pane → the editor mounts.
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await expect(page.getByLabel('Deck source')).toBeVisible();

	// Back to Preview → the deck is shown again, editor hidden.
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	await expect(page.getByLabel('Deck source')).toBeHidden();
	await expect(currentSlide(page)).not.toBeEmpty();
});

test('@mobile the Architect opens as a sheet, not a column', async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Toggle Architect' }).click();
	// The Coach/Chat tabs are reachable once the Architect sheet is open.
	await expect(page.getByRole('button', { name: 'Coach' })).toBeVisible();
});
