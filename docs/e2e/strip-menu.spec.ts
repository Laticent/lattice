import { CHROME, expect, gotoStudio, railButtons, stripNote, test, typeDeck } from './studio-fixture';

// THE SLIDE MENU on both strips (2026-10-27-slide-structure-strip.md §5, lib/strip-actions). Four doors, one menu:
// the ⋯ beside the current slide, a right-click, Shift+F10, and a tap on the slide that is already current. Opening
// it makes its slide current, so the action's target is never in doubt.

const DECK = '# Alpha\n\na\n\n---\n\n# Bravo\n\nb\n\n---\n\n# Charlie\n\nc\n\n---\n\n# Delta\n\nd\n';
// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
const source = (page: import('@playwright/test').Page) => page.locator('.cm-content').first().evaluate((el) => (el as any).cmTile.root.view.state.doc.toString() as string);
const order = async (page: import('@playwright/test').Page) => [...(await source(page)).matchAll(/^# (\w+)/gm)].map((m) => m[1]).join(' ');
const menu = (page: import('@playwright/test').Page) => page.locator('[data-strip-menu-content]');
const item = (page: import('@playwright/test').Page, id: string) => menu(page).locator(`[data-strip-action="${id}"]`);
const counter = (page: import('@playwright/test').Page) => page.getByText(/^Slide \d+ \/ \d+$/).first();

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await typeDeck(page, DECK);
	await expect(railButtons(page)).toHaveCount(4);
});

test('a right-click opens the slide’s menu, makes it current, and its action takes that slide', async ({ page, isMobile }) => {
	test.skip(isMobile, 'no right-click on a phone; the tap-again arm covers touch');
	await railButtons(page).nth(0).click();
	await railButtons(page).nth(2).click({ button: 'right' });
	await expect(menu(page)).toBeVisible();
	await expect(counter(page)).toHaveText('Slide 3 / 4');
	await expect(menu(page).getByRole('menuitem')).toHaveText([/New slide before/, /Duplicate/, /Move left/, /Move right/, /Delete/]);
	await item(page, 'duplicate').click();
	await expect.poll(() => order(page)).toBe('Alpha Bravo Charlie Charlie Delta');
	await expect(stripNote(page)).toContainText('Slide duplicated');
	await expect(menu(page)).toBeHidden();
});

test('@crosswidth the ⋯ beside the current slide opens it; a disabled item stays, with its reason', async ({ page }) => {
	// The caret sits at the deck's end, so slide 4 is current already, and a tap on it would open its menu.
	await expect(counter(page)).toHaveText('Slide 4 / 4');
	await page.locator('nav[aria-label="Slide navigator"]').getByRole('button', { name: 'Slide actions' }).click();
	await expect(item(page, 'move-later')).toBeDisabled();
	await expect(item(page, 'move-later')).toContainText('Already last');
	await item(page, 'move-earlier').click();
	await expect.poll(() => order(page)).toBe('Alpha Bravo Delta Charlie');
	await expect(counter(page)).toHaveText('Slide 3 / 4');
});

test('@parity a tap on the current slide opens its menu; a tap on another slide still picks it', async ({ page }) => {
	await railButtons(page).nth(1).click();
	await expect(counter(page)).toHaveText('Slide 2 / 4');
	await expect(menu(page)).toHaveCount(0);
	await railButtons(page).nth(1).click();
	await expect(menu(page)).toBeVisible();
	await item(page, 'new-before').click();
	// The gallery opens with its target fixed at open: before Bravo.
	await expect(page.getByRole('dialog').filter({ visible: true }).first()).toBeVisible();
	await page.getByRole('button', { name: /^Insert Blank/i }).first().click();
	await expect.poll(() => source(page)).toMatch(/^# Alpha[\s\S]*^## New slide[\s\S]*^# Bravo/m);
	await expect(railButtons(page)).toHaveCount(5);
});

test('Shift+F10 opens the menu from the keyboard, and Escape hands focus back to the slide', async ({ page, isMobile }) => {
	test.skip(isMobile, 'a keyboard arm; the desktop project covers it');
	await railButtons(page).nth(1).focus();
	await page.keyboard.press('Shift+F10');
	await expect(menu(page)).toBeVisible();
	await expect(counter(page)).toHaveText('Slide 2 / 4');
	await page.keyboard.press('Escape');
	await expect(menu(page)).toBeHidden();
	await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-unit'))).toBe('1');
});

test('the slide map carries the same menu', async ({ page, isMobile }) => {
	test.skip(isMobile, 'the map toggle lives in the desktop preview bar');
	await page.getByRole('button', { name: 'Slide map' }).first().click();
	const map = page.locator('[data-strip="map"]');
	await expect(map.locator('button[data-unit]').first()).toBeVisible();
	await map.locator('button[data-unit="2"]').click({ button: 'right' });
	await expect(menu(page)).toBeVisible();
	await expect(counter(page)).toHaveText('Slide 3 / 4');
	await expect(map.getByRole('button', { name: 'Slide actions' })).toBeVisible();
	await item(page, 'delete').click();
	await expect.poll(() => order(page)).toBe('Alpha Bravo Delta');
	await expect(stripNote(page)).toContainText('Slide deleted');
});

test('the palette has every action of the menu', async ({ page, isMobile }) => {
	test.skip(isMobile, 'the palette arm runs on the desktop project');
	await railButtons(page).nth(1).click();
	await page.keyboard.press('ControlOrMeta+k');
	const field = page.getByPlaceholder('Search or run a command…');
	for (const label of ['New slide before this one…', 'Duplicate slide', 'Move slide left', 'Move slide right', 'Delete slide']) {
		await field.fill(label);
		await expect(page.getByRole('option', { name: label })).toBeVisible();
	}
	await page.getByRole('option', { name: 'Delete slide' }).click();
	await expect.poll(() => order(page)).toBe('Alpha Charlie Delta');
});

test('no menu at the Read stop', async ({ page, isMobile }) => {
	test.skip(isMobile, 'the phone has no posture dial');
	await expect(page.getByRole('button', { name: 'Slide actions' }).filter({ visible: true })).toHaveCount(1);
	await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
	await expect(page.getByRole('button', { name: 'Slide actions' }).filter({ visible: true })).toHaveCount(0);
});
