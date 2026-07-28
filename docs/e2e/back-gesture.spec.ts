import { expect, type Page, test } from '@playwright/test';

// #1226 — the back gesture must dismiss the top overlay, never leave the Studio.
//
// WHY THIS SPEC EXISTS AT ALL, and why it is the repo's only WebKit project: the first
// implementation of this guard passed review and every Chromium check, and still failed
// on a real iPhone — it owned one history entry per open level and the entries raced.
// It was reverted. History traversal timing is ENGINE behavior, so a Chromium project
// cannot stand in for it, and a verification that lives in a scratch file nobody can
// re-run is not a guard (HARD RULE #23).
//
// `page.goBack()` drives the SAME history navigation the iOS edge-swipe maps onto —
// that navigation is the mechanism under test. The physical gesture is an OS input
// Playwright cannot synthesize, so THAT remains unverified here and is called so.

const MENU = 'Menu';
const HOST = 'Deck';

const settle = (page: Page) => page.waitForTimeout(650);
const dialog = (page: Page) => page.locator('[role=dialog]');
/** `.last()` — during a hand-off the outgoing drawer and its child are briefly BOTH
 *  mounted, and the topmost is the surface under test. Reading `.first()` here made an
 *  earlier version of this check assert against the drawer that was leaving, and pass
 *  vacuously. */
const title = (page: Page) => dialog(page).last().locator('h2,[data-slot=sheet-title]').first();

async function openStudio(page: Page) {
	await page.goto('/studio/', { waitUntil: 'networkidle' });
	await expect(page.getByRole('button', { name: 'More controls' })).toBeVisible();
	await page.waitForTimeout(1200);
}

test.describe('@webkit the back gesture never leaves the Studio (#1226)', () => {
	test('pops one level at a time: door → index → closed → actually leaves', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'More controls' }).click();
		await settle(page);
		await expect(title(page)).toHaveText(MENU);

		await page.getByRole('button', { name: 'Themes', exact: true }).click();
		await settle(page);
		await expect(title(page)).toHaveText('Themes');

		// A door pops to the index — the sheet stays open. This is the step the reverted
		// implementation got wrong: the door never opened at all.
		await page.goBack();
		await settle(page);
		await expect(title(page)).toHaveText(MENU);

		await page.goBack();
		await settle(page);
		await expect(dialog(page)).toHaveCount(0);
		expect(page.url()).toContain('/studio');

		// Only with nothing open does back mean "leave".
		await page.goBack();
		await settle(page);
		expect(page.url()).not.toContain('/studio');
	});

	test('every drawer opened from the bar closes on back and stays in the Studio', async ({ page }) => {
		await openStudio(page);
		for (const opener of ['Toggle Coach', 'Toggle Chat', 'Settings', 'Share', 'Workspace settings']) {
			await page.getByRole('button', { name: opener, exact: true }).first().click();
			await settle(page);
			await expect(dialog(page).first()).toBeVisible();
			await page.goBack();
			await settle(page);
			await expect(dialog(page)).toHaveCount(0);
			expect(page.url(), `${opener} left the Studio`).toContain('/studio');
		}
	});

	test('a panel launched from the menu returns to the menu, not to the deck', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'More controls' }).click();
		await settle(page);
		await page.getByRole('button', { name: 'Library', exact: true }).click();
		await settle(page);
		await expect(title(page)).toHaveText('Library');
		// The chevron names where it actually goes — and the destination is a property of
		// the LAUNCH PATH, so the same panel names a different one from the bar (below).
		await expect(page.getByRole('button', { name: `Back to ${MENU}` })).toBeVisible();

		await page.goBack();
		await settle(page);
		await expect(title(page)).toHaveText(MENU);
	});

	test('the same panel launched from the bar points at the deck', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'Toggle Coach', exact: true }).click();
		await settle(page);
		await expect(page.getByRole('button', { name: `Back to ${HOST}` })).toBeVisible();
	});

	test('dismissing by the chevron leaves NO history residue', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'More controls' }).click();
		await settle(page);
		await page.getByRole('button', { name: `Back to ${HOST}` }).click();
		await settle(page);
		await expect(dialog(page)).toHaveCount(0);

		// The entry we pushed has to be spent, or this back would be eaten by a drawer
		// that is no longer on screen (acceptance check 3).
		await page.goBack();
		await settle(page);
		expect(page.url()).not.toContain('/studio');
	});

	test('dismissing by the scrim leaves NO history residue', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'More controls' }).click();
		await settle(page);
		await page.locator('[data-slot=sheet-overlay], .sheet-overlay').first().click({ position: { x: 5, y: 5 }, force: true });
		await settle(page);
		await expect(dialog(page)).toHaveCount(0);

		await page.goBack();
		await settle(page);
		expect(page.url()).not.toContain('/studio');
	});

	test('a reload with a panel open ADOPTS its entry instead of stacking a second one', async ({ page }) => {
		// The document is new after a reload but the entry we pushed survives, marked.
		// Before the module read that marker, the next panel to open pushed a SECOND entry
		// on top of the orphan and every cycle after the reload left one more behind.
		await openStudio(page);
		await page.getByRole('button', { name: 'More controls' }).click();
		await settle(page);
		const len = await page.evaluate(() => history.length);

		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForTimeout(1800);
		await expect(dialog(page)).toHaveCount(0);

		// Re-open, then close: the adopted entry is reused and then spent, so the depth
		// comes back to where it started rather than growing.
		await page.getByRole('button', { name: 'More controls' }).click();
		await settle(page);
		expect(await page.evaluate(() => history.length)).toBe(len);
		await page.getByRole('button', { name: `Back to ${HOST}` }).click();
		await settle(page);
		expect(await page.evaluate(() => history.length)).toBe(len);
	});

	test('the phone header has no Close, and its lone action holds the 44px floor', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'More controls' }).click();
		await settle(page);
		await page.getByRole('button', { name: 'Reader views', exact: true }).click();
		await settle(page);

		await expect(dialog(page).last().getByRole('button', { name: 'Close' })).toHaveCount(0);
		const add = dialog(page).last().getByRole('button', { name: 'Add a reader view' });
		const box = await add.boundingBox();
		expect(box?.width, 'action width').toBeGreaterThanOrEqual(44);
		expect(box?.height, 'action height').toBeGreaterThanOrEqual(44);
	});
});
