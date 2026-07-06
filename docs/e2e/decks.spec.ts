import { expect, gotoStudio, readStorage, test, toastText } from './studio-fixture';

// Deck lifecycle: create and rename decks. The persisted deck index and the
// switcher title are the oracles, asserted relative to the seeded deck set.

function deckCount(page: import('@playwright/test').Page): Promise<number> {
	return readStorage(page, 'lattice-studio-deck-index').then((v) => (v ? JSON.parse(v).length : 0));
}

// The header deck-switcher button (shows "<title><n slides>").
function deckSwitcher(page: import('@playwright/test').Page) {
	return page.locator('header').getByRole('button', { name: /slides$/ }).first();
}

test('creating a new deck adds it to the index and switches to it', async ({ page }) => {
	await gotoStudio(page);

	// Deck CRUD lives in the deck switcher (not the Workspace launcher).
	await deckSwitcher(page).click();
	await page.getByRole('menuitem', { name: 'New deck' }).click();

	await expect(toastText(page)).toContainText('New deck created');
	await expect(page.getByRole('button', { name: /Untitled deck/ })).toBeVisible();
	// New deck persists the full seeded list + the new one → at least two entries.
	await expect.poll(() => deckCount(page)).toBeGreaterThanOrEqual(2);
});

test('renaming a deck updates the switcher title', async ({ page }) => {
	await gotoStudio(page);
	// Rename uses window.prompt — accept with a new title before triggering it.
	page.once('dialog', (d) => d.accept('Renamed E2E Deck'));

	await deckSwitcher(page).click();
	await page.getByRole('menuitem', { name: /^Rename/ }).click();

	await expect(toastText(page)).toContainText('Renamed to');
	await expect(page.getByRole('button', { name: /Renamed E2E Deck/ })).toBeVisible();
});
