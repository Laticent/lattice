import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// THE LIBRARY'S HEADER SEARCH IS AS TALL AS THE BUTTON BESIDE IT.
//
// On a tablet the Library keeps its search in the 56px header next to the Import button. The field was 44px tall
// against a 32px button: on a touch screen its text is 16px (the coarse-pointer rule that stops iOS zooming into a
// focused field) and the box grew around it. Reported from the owner's tablet while testing PR #2897; measured 44 vs 32
// on an 810px iPad profile. `PanelSearch size="sm"` is a fixed 32px box for a header row.
//
// Touch on, because the 16px text only applies to a coarse pointer. A phone docks the search at the bottom instead,
// so 390 is not in this list.

test.use({ hasTouch: true });

for (const vp of [
	{ width: 1440, height: 900 },
	{ width: 820, height: 1180 },
]) {
	test(`@crosswidth @webkit-tablet @gecko the Library header search matches the Import button at ${vp.width}px`, async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile', 'a phone docks the search at the bottom; the widths are set here');
		await page.setViewportSize(vp);
		await gotoStudio(page);
		if (vp.width >= 1200) await page.getByRole('button', { name: CHROME.library }).first().click();
		else {
			// From the keyboard: Firefox with touch emulation focuses the trigger on a click but does not open the menu.
			await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().press('Enter');
			await page.getByRole('menuitem', { name: /Library/ }).first().click();
		}
		const search = page.getByRole('textbox', { name: 'Search library' });
		await expect(search).toBeVisible();
		const sizes = await search.evaluate((input) => {
			const box = input.parentElement as HTMLElement;
			const row = box.parentElement?.closest('.h-14') ?? box.parentElement;
			const button = row?.querySelector('button[aria-label="Import files"]');
			return { field: box.getBoundingClientRect().height, button: button?.getBoundingClientRect().height ?? -1, font: getComputedStyle(input).fontSize };
		});
		expect(sizes.button).toBeGreaterThan(0);
		expect(Math.abs(sizes.field - sizes.button), `field ${sizes.field}px beside a ${sizes.button}px button (text ${sizes.font})`).toBeLessThanOrEqual(1);
		await page.screenshot({ path: testInfo.outputPath('library-header.png') });
	});
}
