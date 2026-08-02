import { appendToEditor, currentSlide, expect, gotoStudio, persistedSource, railButtons, readStorage, slideCount, test } from './studio-fixture';

// Persistence: edits and the palette choice survive a full reload (the app
// restores from localStorage — the cause-effect the user relies on).

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
	await page.getByLabel('Deck source').waitFor({ state: 'visible' });
	await currentSlide(page).waitFor({ state: 'visible' });
}

test('a deck edit survives a reload', async ({ page }) => {
	await gotoStudio(page);
	const n = await slideCount(page);

	// A leading `---` makes this a NEW slide (the splitter separates on `---`).
	await appendToEditor(page, '\n\n---\n\n<!-- _class: statement -->\n\n# PERSISTMARKER\n');
	await expect.poll(() => persistedSource(page)).toContain('PERSISTMARKER');
	await expect(railButtons(page)).toHaveCount(n + 1);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);

	// The app restored the edited (n+1)-slide deck from storage.
	await expect(railButtons(page)).toHaveCount(n + 1);
	await expect.poll(() => persistedSource(page)).toContain('PERSISTMARKER');
});

// Deliberately NOT the default palette (cuoio since #1285): restoring the default
// after a reload is what happens with an empty store, so a default target would let
// this pass without anything being persisted or restored at all.
test('the palette choice survives a reload', async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Theme' }).click();
	await page.getByRole('menuitem', { name: 'Burgundy' }).click();
	await expect.poll(() => readStorage(page, 'lattice-studio-palette')).toBe('burgundy');

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);

	// The app re-applied the persisted palette on load.
	await expect
		.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-palette')))
		.toBe('burgundy');
});
