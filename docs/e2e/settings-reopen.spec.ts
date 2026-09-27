import type { Page } from '@playwright/test';
import { countDocuments, documentsMade } from './preview-documents';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The deck settings panel and Present's slide overview STAY MOUNTED between opens, as Add slide
// does (ui/persistent-surface.tsx), because WebKit never frees a preview document whose frame is
// destroyed. Closing either used to unmount its preview pool, and every reopen made fresh
// documents: 8 for the deck panel's preset tiles, 14 for the overview (Playwright WebKit,
// engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md §5).
//
// What these pin: a reopen makes NO documents, and a kept panel still opens the way a fresh one
// did (at the top), while a closed one is nothing to anyone.

// The kept hosts, and the containers main drew the panel in — so the same test runs, and fails
// for the right reason, against a build without the kept panel.
const SETTINGS = '[data-settings-dock], [data-slot="persistent-surface-box"], [data-testid="studio-settings"], [data-testid="studio-tablet-inspector"], [data-slot="sheet-content"]';

/** Open the deck settings at the page's width, on the Deck scope. */
async function openDeckSettings(page: Page): Promise<void> {
	const width = page.viewportSize()?.width ?? 1440;
	if (width >= 1024) {
		await page.getByRole('button', { name: CHROME.deckScope }).first().click();
		return;
	}
	if (width > 500) {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
		await page.locator('[role=menuitem],[role=menuitemradio],button,[role=button]').filter({ hasText: CHROME.deckSettingsAt.tabletItem }).first().click();
	} else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
	}
	// Below desktop the panel opens slide-first; its own segment switches it to the deck.
	await page.getByRole('button', { name: CHROME.deckScope }).filter({ visible: true }).first().click();
}

async function closeDeckSettings(page: Page): Promise<void> {
	if ((page.viewportSize()?.width ?? 1440) <= 500) await page.keyboard.press('Escape');
	else await page.getByRole('button', { name: 'Collapse settings' }).filter({ visible: true }).first().click();
}

/** The deck body's scroller — the element the preset tiles scroll in. */
const deckScroller = (page: Page) => page.locator(SETTINGS).filter({ visible: true }).locator('.overflow-y-auto').filter({ visible: true }).first();

/** Preset tiles painted: the pool has put live frames over them. */
async function presetsPainted(page: Page): Promise<void> {
	await expect
		.poll(() => page.locator(SETTINGS).filter({ visible: true }).locator('iframe.live').count(), { timeout: 30_000, message: 'no preset preview painted' })
		.toBeGreaterThan(0);
}

// The tablet project runs only @visual/@a11y, so the tablet route (the docked column at 820px)
// is driven from the desktop project at that width.
for (const tablet of [false, true]) {
test(`@crosswidth${tablet ? '' : ' @webkit-phone'} reopening the deck settings makes no preview documents, and opens at the top${tablet ? ' — tablet (820px)' : ''}`, async ({ page }, testInfo) => {
	test.skip(tablet && testInfo.project.name !== 'desktop', 'the tablet width is driven from the desktop project');
	test.setTimeout(150_000);
	if (tablet) await page.setViewportSize({ width: 820, height: 1180 });
	await countDocuments(page);
	await gotoStudio(page);

	await openDeckSettings(page);
	await presetsPainted(page);
	// Scroll it, so a reopen that kept the old position would show.
	await deckScroller(page).evaluate((el) => {
		el.scrollTop = el.scrollHeight;
	});
	await closeDeckSettings(page);
	await expect(page.locator(SETTINGS).filter({ visible: true }), 'the settings stayed on screen after close').toHaveCount(0);
	const before = await documentsMade(page);

	for (let i = 0; i < 2; i++) {
		await openDeckSettings(page);
		await presetsPainted(page);
		expect(await deckScroller(page).evaluate((el) => el.scrollTop), `reopen #${i + 1} kept the last scroll position`).toBe(0);
		await closeDeckSettings(page);
		await expect(page.locator(SETTINGS).filter({ visible: true })).toHaveCount(0);
	}
	expect((await documentsMade(page)) - before, 'two reopens of the deck settings made preview documents').toBe(0);
});
}

test('@crosswidth reopening Present’s slide overview makes no preview documents, and a closed one is not a dialog', async ({ page }) => {
	test.setTimeout(150_000);
	await countDocuments(page);
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Present' }).first().click();
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible({ timeout: 30_000 });

	const overview = page.getByRole('dialog', { name: 'Slide overview' });
	const painted = () =>
		expect.poll(() => overview.locator('iframe.live').count(), { timeout: 30_000, message: 'no overview tile painted' }).toBeGreaterThan(0);
	await page.keyboard.press('g');
	await painted();
	await page.keyboard.press('Escape');
	await expect(overview, 'a closed overview is still exposed as a dialog').toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Present' }), 'Escape in the overview closed Present too').toBeVisible();
	const before = await documentsMade(page);

	for (let i = 0; i < 2; i++) {
		await page.keyboard.press('g');
		await painted();
		await page.keyboard.press('Escape');
		await expect(overview).toHaveCount(0);
	}
	expect((await documentsMade(page)) - before, 'two reopens of the overview made preview documents').toBe(0);
});
