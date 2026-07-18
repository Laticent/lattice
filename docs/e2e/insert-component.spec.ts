import { expect, gotoStudio, railButtons, slideCount, test, toastText } from './studio-fixture';

// The add-slide gallery over the component catalog: open, search, insert → a new
// slide carrying that component's skeleton (rail count +1). The gallery replaced
// the old cmdk text list — tiles are live-preview buttons named "Insert <name>".

test('inserting a component adds a slide from the catalog', async ({ page }) => {
	await gotoStudio(page);
	const n = await slideCount(page);

	await page.getByRole('button', { name: 'Insert component' }).click();

	const search = page.getByPlaceholder(/Search \d+ slides/);
	await expect(search).toBeVisible();
	await search.fill('divider');

	// Pick the matching tile — each tile is a button labelled "Insert <name> — …".
	await page.getByRole('button', { name: /^Insert divider/i }).first().click();

	await expect(toastText(page)).toContainText('Inserted');
	await expect(railButtons(page)).toHaveCount(n + 1);
});
