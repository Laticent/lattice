import { CHROME, expect, gotoStudio, openSection, test } from './studio-fixture';

// A Settings picker's open list stays on the screen at phone width, and a tap outside it closes it.
//
// Radix places an item-aligned list from the TRIGGER's width, so a list whose longest row is
// wider than the trigger (`Auto — Component's own` in a 176px trigger) ran to 395px on a 393px
// screen. `useInScreen` in ui/select.tsx slides it back inside Radix's own 10px margin. The
// outside tap is the tap-away layer (ui/tap-away.tsx), which WebKit needs because it delivers
// no event at all for a tap on a `pointer-events: none` body.

for (const tag of ['@mobile', '@webkit-phone']) {
	test(`settings: a wide picker list stays on the screen, and an outside tap closes it ${tag}`, async ({ page }) => {
		await gotoStudio(page);
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
		await openSection(page, CHROME.deckTab.look);
		const trigger = page.getByRole('combobox', { name: 'Tag color' }).filter({ visible: true }).first();
		await trigger.scrollIntoViewIfNeeded();
		await trigger.click();
		const list = page.locator('[data-slot=select-content]');
		await expect(list).toBeVisible();
		const { left, right, vw } = await list.evaluate((el) => {
			const r = el.getBoundingClientRect();
			return { left: r.left, right: r.right, vw: window.innerWidth };
		});
		expect(left).toBeGreaterThanOrEqual(10);
		expect(right).toBeLessThanOrEqual(vw - 10);
		// A tap on the row's own label, outside the list, closes it and opens nothing else.
		await page.getByText('How card tags are filled.').first().click({ force: true });
		await expect(page.getByRole('listbox')).toHaveCount(0);
	});
}
