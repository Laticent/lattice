import { expect, gotoStudio, test } from './studio-fixture';

// #1463 — scrolling the add-slide gallery used to accumulate one live engine iframe per
// tile the user had ever passed. Measured on the built site before the fix: opening the
// gallery held 12 live frames, and ONE scroll to the bottom of the browse grid took that
// to 62 while Chrome's resident set went ~1.1GB → ~1.6GB (~10MB per tile). That is a
// memory-exhaustion profile, and a renderer OOM presents as "the tab died and reloaded".
//
// The window is two-way now, over a shared budget (slide-thumb.tsx `PREVIEW_BUDGET`).
// This is the REAL-SURFACE oracle for the property that matters: however far you scroll,
// the number of live preview documents plateaus instead of climbing. It asserts against a
// ceiling with headroom rather than the exact budget — the in-band set is viewport-derived
// and may legitimately run over it (an on-screen tile is never recycled).
const CEILING = 48;

/** Live engine preview documents currently mounted in the page. */
const liveFrames = (page: import('@playwright/test').Page) => page.evaluate(() => document.querySelectorAll('iframe.live').length);

test('the add-slide gallery holds its live-preview count flat across a full scroll', async ({ page }) => {
	// Two full traversals of a 61-tile grid, each step pausing long enough for the window
	// to act — comfortably past the 60s suite default even though it does no waiting on a
	// slow oracle. Explicit rather than `test.slow()`, which would triple it.
	test.setTimeout(120_000);
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Insert component' }).click();
	await page.getByPlaceholder(/Search \d+ slides/).waitFor();
	// Let the first band paint, so the baseline is a real windowed set and not zero.
	await expect.poll(() => liveFrames(page), { timeout: 30_000 }).toBeGreaterThan(1);

	const scroller = page.locator('div.overflow-y-auto.overscroll-contain').first();
	const height = await scroller.evaluate((el) => el.scrollHeight);
	expect(height).toBeGreaterThan(0);

	// Down and back — the reported repro, and the shape that made the old one-way window
	// monotonic (it reached 62 live frames on this same grid, and kept climbing with looks
	// panels open).
	let browsePeak = 0;
	for (let y = 0; y <= height; y += 250) {
		await scroller.evaluate((el, top) => el.scrollTo({ top }), y);
		await page.waitForTimeout(160);
		browsePeak = Math.max(browsePeak, await liveFrames(page));
	}
	for (let y = height; y >= 0; y -= 250) {
		await scroller.evaluate((el, top) => el.scrollTo({ top }), y);
		await page.waitForTimeout(120);
		browsePeak = Math.max(browsePeak, await liveFrames(page));
	}
	expect(browsePeak, `live preview documents peaked at ${browsePeak} while scrolling the browse grid`).toBeLessThanOrEqual(CEILING);

	// And the same under an active search — the condition the bug was reported against.
	await page.getByPlaceholder(/Search \d+ slides/).fill('compare options');
	await page.waitForTimeout(1200);
	const searchHeight = await scroller.evaluate((el) => el.scrollHeight);
	let searchPeak = 0;
	for (let y = 0; y <= searchHeight; y += 250) {
		await scroller.evaluate((el, top) => el.scrollTo({ top }), y);
		await page.waitForTimeout(180);
		searchPeak = Math.max(searchPeak, await liveFrames(page));
	}
	expect(searchPeak, `live preview documents peaked at ${searchPeak} while scrolling search results`).toBeLessThanOrEqual(CEILING);

	// The window must still be a WINDOW — the tiles you are looking at are rendered, not
	// placeholders. (A fix that simply stopped mounting previews would also pass the caps.)
	await expect.poll(() => liveFrames(page), { timeout: 15_000 }).toBeGreaterThan(1);
});
