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

test('an untagged deck has no reader-view switcher in Present (heuristics retired)', async ({ page }) => {
	// The old author-blind exec/onepager heuristics are retired: a deck with no `lenses:` registry has
	// nothing to switch to, so Present shows a static "Full deck" label — not a dropdown. (Building +
	// approving a reader view, then switching to it in Present, is covered by lenses.spec — which also
	// carries the z-order regression guard for the picker-behind-the-overlay bug.)
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog.getByText('Full deck')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Reader view' })).toHaveCount(0);
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible(); // full deck, not trimmed
});

test('the slide overview opens with the G key and lists every slide', async ({ page }) => {
	await page.keyboard.press('g');
	const overview = page.getByRole('dialog', { name: 'Slide overview' });
	await expect(overview).toBeVisible();
	await expect(overview.getByRole('button', { name: /^Slide \d+$/ })).toHaveCount(total);

	await page.getByRole('button', { name: 'Close slide overview' }).click();
	await expect(overview).toBeHidden();
});
