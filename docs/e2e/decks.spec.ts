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

// The switcher counts a saved deck's slides when it OPENS (studio-store `deckMetaFor`), not when the
// list loads at boot (engineering/decisions/2026-11-09-studio-react-mount-profile.md §4 lever 2). Both
// rows must still read right: the active deck's from the live editor, the other deck's from storage.
test('the switcher labels the active deck and a saved deck with their slide counts', async ({ page }) => {
	await gotoStudio(page);
	const first = (await deckSwitcher(page).textContent()) ?? '';
	const firstCount = /(\d+ slides?)$/.exec(first.trim())?.[1];
	expect(firstCount, `no slide count in the switcher button: "${first}"`).toBeTruthy();
	const firstTitle = first.trim().slice(0, -(firstCount as string).length).trim();

	await deckSwitcher(page).click();
	await page.getByRole('menuitem', { name: 'New deck' }).click();
	await expect(toastText(page)).toContainText('New deck created');

	await page.locator('header').getByRole('button', { name: /Untitled deck/ }).first().click();
	const rows = page.getByRole('menuitem');
	await expect(rows.filter({ hasText: 'Untitled deck' }).first()).toContainText('1 slide');
	await expect(rows.filter({ hasText: firstTitle }).first()).toContainText(firstCount as string);
});
