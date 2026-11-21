import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * A mouse wheel over a horizontal-only strip scrolls it sideways (docs/src/lib/wheel-sideways.ts): the Studio's
 * slide pills and the horizontal slide map. The owner reported both as no longer scrolling with the mouse
 * (2026-11-21); in every engine a vertical wheel ignores a horizontal-only scroller, so the strip answers it.
 * The wheel lands mid-strip, nowhere near the scrollbar, so it never relies on Windows' wheel-over-the-bar.
 */

// Classic scrollbars ON (headless Chromium hides them): the layout real Windows users get, and the one where a
// bar takes space. File-wide, as map-classic-scrollbars.spec.ts does.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

async function wheelMidStrip(page: Page, strip: Locator) {
	await expect.poll(() => strip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(20);
	const before = await strip.evaluate((el) => el.scrollLeft);
	const box = await strip.boundingBox();
	if (!box) throw new Error('strip has no box');
	await page.mouse.move(box.x + box.width / 2, box.y + Math.min(8, box.height / 2));
	await page.mouse.wheel(0, 240);
	await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
}

async function openStudio(page: Page) {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cs-host .ProseMirror')).toBeVisible();
}

test('@gecko Studio: a mouse wheel over the slide pills scrolls them sideways', async ({ page }) => {
	await openStudio(page);
	await wheelMidStrip(page, page.locator('nav[data-strip="pills"]'));
});

test('@gecko Studio: a mouse wheel over the horizontal slide map scrolls it sideways', async ({ page }) => {
	await openStudio(page);
	await page.getByRole('button', { name: 'Slide map' }).first().click();
	const scroller = page.locator('.overflow-x-scroll').filter({ has: page.locator('button') }).first();
	await wheelMidStrip(page, scroller);
});

test('@gecko Studio: the slide map shows no scrollbar, even with classic scrollbars', async ({ page }) => {
	await openStudio(page);
	await page.getByRole('button', { name: 'Slide map' }).first().click();
	const scroller = page.locator('[data-map-rail] [data-scrollbar="none"]').first();
	await expect(scroller).toBeVisible();
	// The owner's call (2026-11-21): no bar at all, rather than an empty reserved strip when nothing scrolls.
	expect(await scroller.evaluate((el) => (el as HTMLElement).offsetHeight - el.clientHeight)).toBe(0);
});
