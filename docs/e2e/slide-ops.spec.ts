import { expect, gotoStudio, railButtons, slideCount, test, toastText } from './studio-fixture';

// Slide structural ops via the rail toolbar. The rail button count is the
// primary structural oracle (one button per slide — a fuzz invariant), asserted
// relative to the seed deck's size; toasts are the secondary signal.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('add slide grows the deck by one', async ({ page }) => {
	const n = await slideCount(page);
	await page.getByRole('button', { name: 'Add slide' }).click();
	await expect(toastText(page)).toContainText('Slide added');
	await expect(railButtons(page)).toHaveCount(n + 1);
});

test('duplicate slide grows the deck by one', async ({ page }) => {
	const n = await slideCount(page);
	await page.getByRole('button', { name: 'Duplicate slide' }).click();
	await expect(toastText(page)).toContainText('Slide duplicated');
	await expect(railButtons(page)).toHaveCount(n + 1);
});

// Delete is destructive, so it confirms IN PLACE: the first click ARMS the
// button (it flips to "Confirm delete slide", red, for 3s), the second click
// deletes. A single click changes nothing by design — which is exactly what an
// earlier version of this test (and #692's manual repro) misread as a dead
// button. The two-step flow IS the oracle.
test('delete slide arms, confirms, and shrinks the deck by one', async ({ page }) => {
	const n = await slideCount(page);
	await railButtons(page).nth(2).click();

	await page.getByRole('button', { name: 'Delete slide' }).click();
	// Armed, not deleted: the control flips to its confirm state, deck unchanged.
	const confirm = page.getByRole('button', { name: 'Confirm delete slide' });
	await expect(confirm).toBeVisible();
	await expect(railButtons(page)).toHaveCount(n);

	await confirm.click();
	await expect(toastText(page)).toContainText('Slide deleted');
	await expect(railButtons(page)).toHaveCount(n - 1);
});

test('move slide later reorders the deck', async ({ page }) => {
	// Capture slides 1 and 2 by their class, then assert they swap.
	const first = await railButtons(page).nth(0).getAttribute('aria-label');
	const second = await railButtons(page).nth(1).getAttribute('aria-label');
	expect(first).not.toBe(second);

	await page.getByRole('button', { name: 'Move slide later' }).click();

	// Slide 1 now carries what was slide 2's class, and vice-versa (labels are
	// "Slide {n} — {class}"; compare just the class suffix).
	const classOf = (label: string | null) => (label ?? '').split('—')[1]?.trim();
	await expect(railButtons(page).nth(0)).toHaveAttribute('aria-label', new RegExp(`— ${classOf(second)}$`));
	await expect(railButtons(page).nth(1)).toHaveAttribute('aria-label', new RegExp(`— ${classOf(first)}$`));
});

test('move earlier is disabled on the first slide', async ({ page }) => {
	// Slide 1 is active on load → cannot move any earlier.
	await expect(page.getByRole('button', { name: 'Move slide earlier' })).toBeDisabled();
});
