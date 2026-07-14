import { currentSlide, expect, gotoStudio, railButtons, slideCount, test } from './studio-fixture';

// Preview navigation + reader lenses. The outer "Slide N / M" label and the rail
// count are the reliable outer-DOM oracles; the painted slide *changing* is
// asserted through the preview iframe (resilient to the seed deck's exact text).

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

// The slide's first heading is a stable content token (resilient to whitespace
// re-render, unlike the whole innerText).
function slideHeading(page: import('@playwright/test').Page): Promise<string> {
	return currentSlide(page).locator('h1, h2, h3').first().innerText();
}

test('next / previous move through the deck and repaint the slide', async ({ page }) => {
	const n = await slideCount(page);
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
	const head1 = await slideHeading(page);
	expect(head1.length).toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Next slide' }).click();
	await expect(page.getByText(`Slide 2 / ${n}`, { exact: true })).toBeVisible();
	// The painted heading actually changed.
	await expect(currentSlide(page)).not.toContainText(head1);

	await page.getByRole('button', { name: 'Previous slide' }).click();
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
	await expect(currentSlide(page)).toContainText(head1);
});

test('clicking a rail slide jumps to it and repaints', async ({ page }) => {
	const n = await slideCount(page);
	const head1 = await slideHeading(page);

	await railButtons(page).nth(2).click();
	await expect(page.getByText(`Slide 3 / ${n}`, { exact: true })).toBeVisible();
	await expect(currentSlide(page)).not.toContainText(head1);
});

// The Compose-preview reader-view reshape (build a view → preview it → the preview trims → Clear
// restores) now lives in lenses.spec ("previewing a reader view reshapes the Compose preview…"), which
// authors a real reader view first. The old author-blind exec/onepager heuristics that used to fill this
// picker for an untagged deck are retired, so there's nothing to reshape here without a reader view.
