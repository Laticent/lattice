import type { Page } from '@playwright/test';
import { chooseGalleryFamily, expect, gotoStudio, isPhone, openAddSlide, test } from './studio-fixture';

// The add-slide gallery holding still and leaving room for its results (owner, 2026-11-23:
// "search is janky", "a preview in a place it is half visible", "the pills take way too
// much space", "we lost the match confidence score"). Each test pins one of the four fixes on
// the real Studio at every width the suite runs; the phone test also runs in WebKit's iPhone
// profile (@webkit-phone). Nothing here waits on a duration (HARD RULE #32).

const grid = (page: Page) => page.getByRole('dialog').locator('.overflow-y-auto').first();
const search = (page: Page) => page.getByPlaceholder(/Search/).filter({ visible: true }).first();
const strip = (page: Page) => page.getByRole('tablist', { name: 'Slide categories' }).filter({ visible: true });

async function pillsHoldStill(page: Page): Promise<void> {
	await gotoStudio(page);
	await openAddSlide(page);
	// One row: no pill sits below the first one.
	const tops = await strip(page).getByRole('tab').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
	expect(tops).toHaveLength(1);
	if (isPhone(page)) return; // a phone re-arranges on focus by design; the next test owns it
	await search(page).fill('ti');
	const before = await grid(page).evaluate((e) => Math.round(e.getBoundingClientRect().top));
	// The count changes width with every one of these ("80 slides" … "4 slides"); it used to sit
	// in the pill row and re-wrap it, moving the grid 40px at 820px.
	for (const q of ['tim', 'timeline', 'timeline-list', 'zq']) {
		await search(page).fill(q);
		await expect(page.getByRole('dialog').getByText(/^\d+ slides?$/).first()).toBeVisible();
		expect(await grid(page).evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(before);
	}
}

test('the family pills take one row, and typing does not move the grid @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await pillsHoldStill(page);
});

// The tablet width is where the count used to re-wrap the pills mid-typing, and the `tablet`
// project runs only @visual/@a11y — so this box is pinned here rather than left to a tag.
test.describe('at the 820px tablet width', () => {
	test.use({ viewport: { width: 820, height: 1180 } });
	test('the family pills take one row, and typing does not move the grid', async ({ page }) => {
		await pillsHoldStill(page);
	});
});

test('a phone typing gives the results the room: no pills while the field has focus @mobile @webkit-phone', async ({ page }) => {
	await gotoStudio(page);
	test.skip(!isPhone(page), 'phone layout only');
	await openAddSlide(page);
	await expect(page.getByText(/^Adds it /)).toBeVisible();
	// A family picked BEFORE typing keeps filtering, and the count in the field names it.
	await chooseGalleryFamily(page, 'Progression');
	await search(page).click();
	await search(page).fill('timeline');
	// While the field has focus there is nothing to tap but results (owner, 2026-11-23, from an iPhone:
	// any control here ends the typing, drops the keyboard and moves the page). The subtitle and the
	// whole strip step aside.
	await expect(page.getByText(/^Adds it /)).toBeHidden();
	await expect(page.getByRole('tablist', { name: 'Slide categories' }).filter({ visible: true })).toHaveCount(0);
	await expect(page.getByRole('dialog').getByText(/^(1 slide|\d+ slides) · Progression$/)).toBeVisible();
	// A full result tile fits between the top of the results and the docked search field. Measured
	// against the sheet as the panel sizes it for a focused field; the iOS probe (PROBE=picker-keyboard)
	// measures it with the real software keyboard up.
	const room = await grid(page).evaluate((e) => e.getBoundingClientRect().height);
	// The first result, whichever it is: the family filter decides which ones remain.
	const tile = await grid(page).getByRole('button', { name: /^Insert / }).first().evaluate((e) => (e.parentElement as HTMLElement).getBoundingClientRect().height);
	expect(room).toBeGreaterThanOrEqual(tile);
	// Leaving the field brings the strip back as it was.
	await search(page).blur();
	await expect(page.getByRole('button', { name: 'Slide categories: Progression, more' })).toBeVisible();
});

test('a new query starts at the top of its results @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await openAddSlide(page);
	await grid(page).evaluate((e) => {
		e.scrollTop = 900;
	});
	await expect.poll(() => grid(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
	await search(page).fill('list');
	await expect(page.getByRole('button', { name: /^Insert list/ }).first()).toBeVisible();
	await expect.poll(() => grid(page).evaluate((e) => e.scrollTop)).toBe(0);
});

test('every result says how it matched: the leader is the best match @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	await openAddSlide(page);
	await search(page).fill('timeline');
	const tiles = page.getByRole('dialog').getByRole('button', { name: /^Insert / });
	await expect(tiles.first()).toHaveAccessibleName(/^Insert timeline-list, best match/);
	const names = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
	expect(names.length).toBeGreaterThan(1);
	for (const n of names.slice(1)) expect(n).toMatch(/, (name|tag|look|category|description) match|, matches across fields|, close spelling|% as close a match/);
	await expect(page.getByRole('dialog').getByText('Best match', { exact: true })).toBeVisible();
	// One result reads "1 slide", not "1 slides" (seen on the owner's iPhone).
	await search(page).fill('policy-recommendation');
	await expect(page.getByRole('dialog').getByText(/^1 slide$/)).toBeVisible();
});
