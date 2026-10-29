import { addedNote, CHROME, expect, gotoStudio, openAddSlide, railButtons, slideCount, test } from './studio-fixture';

// The add-slide gallery over the component catalog: open, search, insert → a new
// slide carrying that component's skeleton (rail count +1). The gallery replaced
// the old cmdk text list — tiles are live-preview buttons named "Insert <name>"
// (the tile action names the component; the DOOR says "New slide").

test('inserting a component adds a slide from the catalog', async ({ page }) => {
	await gotoStudio(page);
	const n = await slideCount(page);

	await openAddSlide(page);

	// One door, one name: the launcher says "New slide" and what opens is titled
	// "New slide" too. Asserted HERE, on the real built Studio, and not only in jsdom —
	// the launcher/panel disagreement this fixes is exactly the class of defect a
	// component test can miss because it never renders the shipped chrome together.
	await expect(page.getByRole('dialog', { name: CHROME.addSlideDialog })).toBeVisible();

	const search = page.getByPlaceholder(/Search \d+ slides/);
	await expect(search).toBeVisible();
	await search.fill('divider');

	// Pick the matching tile — each tile is a button labeled "Insert <name> — …".
	await page.getByRole('button', { name: /^Insert divider/i }).first().click();

	await expect(addedNote(page)).toContainText('Added after');
	await expect(railButtons(page)).toHaveCount(n + 1);
});
