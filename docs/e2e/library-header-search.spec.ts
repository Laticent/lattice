import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// THE LIBRARY'S SEARCH FOLLOWS THE PANES' ONE PATTERN (engineering/decisions/2026-11-15-one-side-pane.md §3d).
//
// A search button in the header, the same height as the Import button beside it, opens the field in a row under the
// header, focused; Escape closes and clears it and leaves the Library open. The field used to sit open in the header,
// the one pane whose search did. Before that it was 44px tall beside a 32px Import on a tablet (the 16px text a coarse
// pointer gets so iOS does not zoom into a focused field), reported from the owner's tablet while testing PR #2897, so
// the heights are still compared, now between the two buttons.
//
// Touch on, because the coarse-pointer sizing only applies to a coarse pointer. A phone docks the search at the bottom
// instead, so 390 is not in this list.

test.use({ hasTouch: true });

for (const vp of [
	{ width: 1440, height: 900 },
	{ width: 820, height: 1180 },
]) {
	test(`@crosswidth @webkit-tablet @gecko the Library's search opens from a header button as tall as Import, at ${vp.width}px`, async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile', 'a phone docks the search at the bottom; the widths are set here');
		await page.setViewportSize(vp);
		await gotoStudio(page);
		if (vp.width >= 1200) await page.getByRole('button', { name: CHROME.library }).first().click();
		else {
			// From the keyboard: Firefox with touch emulation focuses the trigger on a click but does not open the menu.
			await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().press('Enter');
			await page.getByRole('menuitem', { name: /Library/ }).first().click();
		}
		const button = page.getByRole('button', { name: 'Search library', exact: true });
		const importButton = page.getByRole('button', { name: 'Import files', exact: true });
		// The signal: the REAL Library has mounted (its file input exists only there), not the loading shell that draws
		// the same two buttons inert. Gecko swapped one for the other between two reads, so Import read 0px. Then both
		// heights are read in ONE pass and compared once, so a mismatch still fails.
		await expect(page.getByTestId('library-import-input')).toBeAttached();
		await expect(button).toBeVisible();
		await expect(importButton).toBeVisible();
		const heights = () =>
			page.evaluate(() => {
				const h = (name: string) => [...document.querySelectorAll<HTMLElement>(`button[aria-label="${name}"]`)].find((b) => b.checkVisibility?.() ?? true)?.getBoundingClientRect().height ?? 0;
				return { search: h('Search library'), import: h('Import files') };
			});
		await expect.poll(async () => { const m = await heights(); return m.search > 0 && m.import > 0; }, { message: 'the Library header never laid out its buttons' }).toBe(true);
		const { search: searchH, import: importH } = await heights();
		expect(Math.abs(searchH - importH), `search button ${searchH}px beside a ${importH}px Import`).toBeLessThanOrEqual(1);
		// Open: the field, focused, and no field before it.
		await expect(page.getByRole('textbox', { name: 'Search library' })).toHaveCount(0);
		await button.click();
		const field = page.getByRole('textbox', { name: 'Search library' });
		await expect(field).toBeFocused();
		await page.screenshot({ path: testInfo.outputPath('library-search-open.png') });
		await field.fill('cuoio');
		// Escape closes and clears; the Library stays open.
		await field.press('Escape');
		await expect(field).toHaveCount(0);
		await expect(button).toBeVisible();
		// The Library is still open: on a tablet it is a sheet, whose own Escape (a document listener in the capture
		// phase) used to close it along with the search (found by the checker on #3222).
		await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
		// Focus is back on the search button, in the pane, not on <body>.
		await expect(button).toBeFocused();
		await button.click();
		await expect(page.getByRole('textbox', { name: 'Search library' })).toHaveValue('');
	});
}
