import { expect, gotoStudio, test } from './studio-fixture';

// The ⌘K command palette: opens on the keyboard shortcut, and each command runs
// its action and closes the dialog.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('Meta/Control+K opens the command palette', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByPlaceholder('Search or run a command…')).toBeHidden();
});

test('"Reshape for a reader" opens the Lenses panel', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	const search = page.getByPlaceholder('Search or run a command…');
	await search.fill('Reshape');
	await page.getByRole('option', { name: 'Reshape for a reader' }).click();

	// The command opens the Lenses panel (its own first-class home for reader views).
	await expect(page.getByRole('button', { name: 'Toggle Reader views' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: /Add a reader view/ })).toBeVisible();
});

test('"Present" opens the present overlay', async ({ page }) => {
	await page.keyboard.press('ControlOrMeta+k');
	const search = page.getByPlaceholder('Search or run a command…');
	await search.fill('Present');
	await page.getByRole('option', { name: 'Present', exact: true }).click();

	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
});

/**
 * FOCUS RETURNS TO THE PILL ON DISMISSAL (#1707).
 *
 * At desktop the palette is the header's own combobox, not a dialog, and that swap cost a
 * behavior Radix had been providing for free: a dialog restores focus to its trigger on
 * close, whereas an inline field that UNMOUNTS while focused drops focus to `<body>`.
 * Measured before the fix: after Escape, `document.activeElement` was BODY — so
 * Escape-then-Enter did nothing and a screen reader lost its place in the row. Tab only
 * appeared to work because Chromium resumes from the removed element's sequential-focus
 * position, which happens to be where the pill re-renders; that is luck, not behavior.
 *
 * The other half of the contract is that focus is reclaimed ONLY when it was orphaned. A
 * click into the editor moved focus deliberately, and yanking it back to the header would
 * fight the user — so that path is asserted too, in the opposite direction. Both cases run
 * against the real browser because focus is exactly the kind of thing jsdom models loosely.
 */
test('dismissing the inline search hands focus back to the pill — but never steals it', async ({ page }) => {
	const pill = page.getByRole('button', { name: 'Search or run a command' });
	const field = page.getByPlaceholder('Search or run a command…');

	// ESCAPE — focus was orphaned by the unmount, so the pill takes it back.
	await page.keyboard.press('ControlOrMeta+k');
	await expect(field).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(pill).toBeVisible();
	await expect(pill, 'Escape must return focus to the collapsed combobox (APG), not drop it on <body>').toBeFocused();

	// OUTSIDE CLICK — the user moved focus on purpose; leave it where they put it.
	await page.keyboard.press('ControlOrMeta+k');
	await expect(field).toBeFocused();
	await page.getByLabel('Deck source').click();
	await expect(pill).toBeVisible();
	await expect(pill, 'a click into the editor moved focus deliberately — the pill must not yank it back').not.toBeFocused();
});
