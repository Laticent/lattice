import { expect, gotoStudio, railButtons, stripAction, stripNote, test, typeDeck } from './studio-fixture';

// HIDE SLIDE / SHOW SLIDE (engineering/decisions/2026-11-06-hidden-slides.md). The slide menu's Hide slide writes
// `<!-- hide -->` on the slide; the strip marks it with the eye-off and keeps its place; the preview bar's chip is Show
// slide; one Undo takes it back. Present and every export leave a hidden slide out (unit-tested at the engine, the slice
// path and both export hosts).

const DECK = '# Alpha\n\na\n\n---\n\n# Bravo\n\nb\n\n---\n\n# Charlie\n\nc\n';
// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
const source = (page: import('@playwright/test').Page) => page.locator('.cm-content').first().evaluate((el) => (el as any).cmTile.root.view.state.doc.toString() as string);
const menu = (page: import('@playwright/test').Page) => page.locator('[data-strip-menu-content]');
const item = (page: import('@playwright/test').Page, id: string) => menu(page).locator(`[data-strip-action="${id}"]`);
const strip = (page: import('@playwright/test').Page) => page.locator('nav[aria-label="Slide navigator"]');

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await expect(railButtons(page)).toHaveCount(3);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko Hide slide hides the slide, marks it, and Show slide (the chip) brings it back', async ({ page }) => {
	await railButtons(page).nth(1).click();
	await strip(page).getByRole('button', { name: 'Slide actions' }).click();
	await expect(item(page, 'hide')).toHaveText(/Hide Slide/);
	await item(page, 'hide').click();
	await expect.poll(() => source(page)).toContain('<!-- hide -->\n# Bravo');
	await expect(stripNote(page)).toContainText('Slide hidden');
	// The strip keeps the slide in its place and says it is hidden.
	await expect(railButtons(page)).toHaveCount(3);
	await expect(railButtons(page).nth(1)).toHaveAccessibleName(/^Slide 2, hidden/);
	await expect(railButtons(page).nth(1).locator('[data-strip-hidden]')).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('hidden.png') });
	// The menu now offers Show slide.
	await strip(page).getByRole('button', { name: 'Slide actions' }).click();
	await expect(item(page, 'hide')).toHaveText(/Show Slide/);
	await page.keyboard.press('Escape');
	// The preview bar's chip shows it again.
	await page.locator('[data-preview-hidden]').filter({ visible: true }).first().click();
	await expect.poll(() => source(page)).toBe(DECK);
	await expect(railButtons(page).nth(1)).not.toHaveAccessibleName(/hidden/);
});

test('one Undo takes a Hide back', async ({ page }) => {
	// The caret sits at the deck's end, so slide 3 is current already.
	await stripAction(page, 'hide');
	await expect.poll(() => source(page)).toContain('<!-- hide -->\n# Charlie');
	await stripNote(page).getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => source(page)).toBe(DECK);
});
