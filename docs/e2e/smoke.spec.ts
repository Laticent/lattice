import { currentSlide, expect, gotoStudio, railButtons, slideCount, test } from './studio-fixture';

test('@smoke studio loads: shell mounts and the engine paints the seeded deck', async ({ page }) => {
	await gotoStudio(page);
	// Cause-effect oracle: the seeded deck actually renders (non-empty painted
	// slide), and the rail exposes one button per slide with the count reflected in
	// the "Slide 1 / N" label — asserted relative to the seed so a change to the
	// bundled deck doesn't break this.
	await expect(currentSlide(page)).not.toBeEmpty();
	const n = await slideCount(page);
	expect(n).toBeGreaterThan(0);
	await expect(railButtons(page)).toHaveCount(n);
	await expect(page.getByText(`Slide 1 / ${n}`, { exact: true })).toBeVisible();
});
