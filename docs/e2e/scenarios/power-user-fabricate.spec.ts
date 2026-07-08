import { expect, gotoStudio, openInspector, railButtons, slideCount, test, toastText } from '../studio-fixture';

// Persona: a power user extending the system. Goal: fabricate an artifact, save
// it, and USE it afterward — the saved thing must round-trip into authoring, not
// just land in a library. Component: saved → insertable into the deck (a new
// slide carrying it). Theme: saved → listed and selectable from Look.
//
// Saved artifacts persist in the shared Workbench store (IndexedDB
// `lattice-workbench`); every test gets a fresh browser context, so the store
// starts empty and the names below are deterministic.

async function openFabricate(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await expect(page.getByRole('button', { name: 'Back to Compose' })).toBeVisible();
}

test('a fabricated component saves and inserts into the deck as a new slide', async ({ page }) => {
	await gotoStudio(page);
	const n = await slideCount(page);

	await openFabricate(page);
	await page.getByRole('button', { name: 'Component', exact: true }).click();

	// Save the gate-clean starter draft under its own name ("callout" — no shipped
	// component claims it). Renaming would rightly re-trip the scoped-CSS gate.
	await expect(page.getByRole('textbox', { name: 'Component name' })).toHaveValue('callout');
	await expect(page.getByText(/Palette-blind and scoped|ready to save/)).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toastText(page)).toContainText('component library');

	// Round-trip: back in Compose, the saved component is a first-class catalog
	// entry — searchable (the local bucket leads the palette), insertable, and the
	// deck grows a slide carrying it.
	await page.getByRole('button', { name: 'Back to Compose' }).click();
	await page.getByRole('button', { name: 'Insert component' }).click();
	const search = page.getByPlaceholder(/Search \d+ components/);
	await search.fill('callout');
	await page.getByRole('option', { name: /^callout/ }).first().click();

	await expect(toastText(page)).toContainText('Inserted');
	await expect(railButtons(page)).toHaveCount(n + 1);
});

test('a fabricated theme saves and is selectable from Look afterward', async ({ page }) => {
	await gotoStudio(page);
	await openFabricate(page);

	// The Theme tab opens with a full derived contract; name it and save. The
	// library titleizes the slug — "boardroom-teal" lists as "Boardroom Teal".
	await page.getByRole('textbox', { name: 'Theme name' }).fill('boardroom-teal');
	await expect(page.getByText(/Contract . \d+ roles/)).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toastText(page)).toContainText('theme library');

	// Round-trip: the saved theme is offered in the Inspector's Look → Theme picker
	// and picking it makes it the ACTIVE look (the trigger reflects the choice).
	await page.getByRole('button', { name: 'Back to Compose' }).click();
	await openInspector(page);
	await page.getByRole('button', { name: 'Choose deck theme' }).click();
	await page.getByRole('menuitem', { name: 'Boardroom Teal' }).click();
	await expect(page.getByRole('button', { name: 'Choose deck theme' })).toContainText('Boardroom Teal');
});
