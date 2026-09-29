import { CHROME, expect, gotoStudio, persistedSource, test } from './studio-fixture';

// Find and replace in the deck editor (find-panel.tsx), driven on the real Studio.
// The unit tier covers the match counting; this covers what only a browser can: that
// the toolbar button and Ctrl+F put the caret in the find field, that typing builds the
// query instead of overwriting it (the @codemirror/search 6.5 `findNext` select trap),
// that Replace all edits the saved deck, and that Escape hands focus back to the editor.

test.describe('find and replace', () => {
	test('toolbar button opens the bar, typing searches incrementally, Escape returns to the editor', async ({ page }) => {
		await gotoStudio(page);
		await page.getByRole('button', { name: CHROME.findReplace, exact: true }).click();
		const find = page.getByRole('textbox', { name: 'Find', exact: true });
		await expect(find).toBeFocused();
		await find.pressSequentially('the');
		await expect(find).toHaveValue('the');
		const readout = page.locator('.cm-studio-find [aria-live]');
		await expect(readout).toHaveText(/^1 of \d+$/);
		await find.press('Enter');
		await expect(readout).toHaveText(/^2 of \d+$/);
		// The search-panel bindings work from INSIDE the bar, not only from the editor.
		await find.press('F3');
		await expect(readout).toHaveText(/^3 of \d+$/);
		// Escape stops at the bar: the Studio's window-level Escape (Focus mode, a Craft
		// reveal) must not act on the same keystroke.
		await page.evaluate(() => {
			(window as unknown as { __escSeen: boolean }).__escSeen = false;
			window.addEventListener('keydown', (e) => { if (e.key === 'Escape') (window as unknown as { __escSeen: boolean }).__escSeen = true; });
		});
		await find.press('Escape');
		expect(await page.evaluate(() => (window as unknown as { __escSeen: boolean }).__escSeen)).toBe(false);
		await expect(page.locator('.cm-studio-find')).toHaveCount(0);
		await expect(page.getByRole('textbox', { name: 'Deck source' })).toBeFocused();
	});

	test('Ctrl+F opens the bar, Ctrl+H from the field opens replace, Ctrl+Enter replaces every match in the saved deck', async ({ page }) => {
		await gotoStudio(page);
		await page.getByRole('textbox', { name: 'Deck source' }).click();
		await page.keyboard.press('ControlOrMeta+f');
		const find = page.getByRole('textbox', { name: 'Find', exact: true });
		await expect(find).toBeFocused();
		await find.pressSequentially('boardroom');
		// Ctrl+H from inside the find field opens the replace row (it used to reach the browser).
		await find.press('Control+h');
		const replace = page.getByRole('textbox', { name: 'Replace with' });
		await replace.fill('ZQXROOM');
		await replace.press('ControlOrMeta+Enter');
		await expect(page.locator('.cm-studio-find [aria-live]')).toHaveText('No results');
		await expect.poll(() => persistedSource(page)).toContain('ZQXROOM');
		expect(await persistedSource(page)).not.toMatch(/boardroom/i);
	});
});

// @crosswidth: at 390px there is no editor toolbar, so the command sheet is the ONLY way
// to reach find on a phone.
test('the command palette opens find from anywhere @crosswidth', async ({ page }) => {
	await gotoStudio(page);
	if ((page.viewportSize()?.width ?? 1440) < 700) {
		await page.getByRole('button', { name: 'Menu', exact: true }).click();
		await page.getByRole('button', { name: 'Search / commands' }).click();
	} else {
		await page.keyboard.press('ControlOrMeta+k');
	}
	await page.getByRole('option', { name: 'Find and replace in source' }).click();
	await expect(page.getByRole('textbox', { name: 'Find', exact: true })).toBeFocused();
});
