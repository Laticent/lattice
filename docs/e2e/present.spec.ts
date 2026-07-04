import { expect, gotoStudio, slideCount, test } from './studio-fixture';

// The Present overlay: enter, navigate, switch reader lens, open the slide
// overview, and exit on Escape. The slide total is read from the seed deck so the
// counter assertions don't hard-code its size.

let total = 0;

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	total = await slideCount(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
});

test('present navigates through slides and exits on Escape', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible();

	// Scope to the overlay — the main preview also has a "Next slide" button.
	await dialog.getByRole('button', { name: 'Next slide' }).click();
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('the present reader lens trims the presented set', async ({ page }) => {
	const dialog = page.getByRole('dialog', { name: 'Present' });
	// The reader lens is a dropdown now (was a scrolling chip row): open it, pick Exec.
	await dialog.getByRole('button', { name: 'Reader view' }).click();
	await page.getByRole('menuitem', { name: 'Exec summary' }).click();
	// Exec keeps only headline slides → a strictly smaller denominator.
	const counter = await dialog.getByText(/^\d+ \/ \d+$/).first().textContent();
	const denom = Number((counter ?? '').split('/')[1]);
	expect(denom).toBeLessThan(total);
});

test('the slide overview opens with the G key and lists every slide', async ({ page }) => {
	await page.keyboard.press('g');
	const overview = page.getByRole('dialog', { name: 'Slide overview' });
	await expect(overview).toBeVisible();
	await expect(overview.getByRole('button', { name: /^Slide \d+$/ })).toHaveCount(total);

	await page.getByRole('button', { name: 'Close slide overview' }).click();
	await expect(overview).toBeHidden();
});
