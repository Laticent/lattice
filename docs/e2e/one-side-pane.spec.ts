import { CHROME, expect, gotoStudio, openChat, test } from './studio-fixture';

// ONE side pane at a time (engineering/decisions/2026-11-15-one-side-pane.md), on the real Studio.
// The unit tests pin the state; these pin what a person sees: one docked column, the drill-in chip,
// and where X goes.

const dockedPanes = (page: import('@playwright/test').Page) =>
	page.evaluate(() => [...document.querySelectorAll('[data-studio-split] [data-studio-pane]')].map((p) => p.id));

test.describe('desktop @webkit-tablet @gecko', () => {
	test.skip(({ viewport }) => (viewport?.width ?? 1440) < 1100, 'the activity rail is a desktop surface');

	test('every rail pane replaces the one showing: never more than one docked column', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		for (const name of [CHROME.coach, CHROME.deckScope, CHROME.chat, CHROME.slideSettings, CHROME.lenses, CHROME.library]) {
			await page.getByRole('button', { name, exact: true }).first().click();
			await expect(page.getByRole('button', { name, exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
			await expect.poll(async () => (await dockedPanes(page)).length).toBe(1);
		}
		// Clicking the open pane's icon closes it: back to the canvas, not to the pane before.
		await page.getByRole('button', { name: CHROME.library, exact: true }).first().click();
		await expect.poll(async () => (await dockedPanes(page)).length).toBe(0);
		await expect(page.getByRole('button', { name: CHROME.lenses, exact: true }).first()).toHaveAttribute('aria-pressed', 'false');
	});

	test('a drill-in shows a chip back to its source; the chip returns there, and closing goes to the canvas', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await openChat(page);
		await page.getByRole('button', { name: 'Attach from your Library' }).click();
		await page.getByRole('button', { name: 'Open Library ↗' }).click();
		const chip = page.getByRole('button', { name: 'Back to Chat' });
		await expect(chip).toBeVisible();
		await expect(page.getByRole('button', { name: CHROME.library, exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
		await chip.click();
		await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toBeVisible();
		await expect(chip).toHaveCount(0);
		// The title still fits beside the chip at the dock's default width.
		// Drill in again, then close (the docked Library closes from its rail icon): the canvas, not Chat.
		await page.getByRole('button', { name: 'Attach from your Library' }).click();
		await page.getByRole('button', { name: 'Open Library ↗' }).click();
		await expect(page.getByRole('button', { name: 'Back to Chat' })).toBeVisible();
		const title = page.locator('[data-studio-pane] h2').first();
		expect(await title.evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true);
		await page.getByRole('button', { name: CHROME.library, exact: true }).first().click();
		await expect.poll(async () => (await dockedPanes(page)).length).toBe(0);
		await expect(page.getByRole('button', { name: CHROME.chat, exact: true }).first()).toHaveAttribute('aria-pressed', 'false');
	});

	test('opening another pane from the rail drops the chip', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await openChat(page);
		await page.getByRole('button', { name: 'Attach from your Library' }).click();
		await page.getByRole('button', { name: 'Open Library ↗' }).click();
		await expect(page.getByRole('button', { name: 'Back to Chat' })).toBeVisible();
		await page.getByRole('button', { name: CHROME.coach, exact: true }).first().click();
		await page.getByRole('button', { name: CHROME.library, exact: true }).first().click();
		await expect(page.getByRole('button', { name: CHROME.library, exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('button', { name: 'Back to Chat' })).toHaveCount(0);
	});
});

test.describe('tablet @webkit-tablet @gecko', () => {
	test.skip(({ viewport }) => (viewport?.width ?? 1440) < 1100, 'driven from the desktop project at 820');

	test('Esc in the docked settings closes them and keeps focus on a control, not <body> (no rail at this width)', async ({ page }) => {
		await page.setViewportSize({ width: 820, height: 1180 });
		await gotoStudio(page);
		await page.getByRole('button', { name: 'More controls' }).first().click();
		await page.getByRole('menuitem', { name: /Settings — deck/ }).click();
		const dock = page.locator('[data-settings-dock]');
		await expect(dock).toBeVisible();
		// The menu hands focus back to "More controls" as it closes; wait for that, THEN move into the dock,
		// or the menu's late focus-return pulls focus out again and Esc never starts inside the pane.
		await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('More controls');
		await dock.getByRole('button', { name: 'Slide scope' }).focus();
		await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-settings-dock]'))).toBe(true);
		await page.keyboard.press('Escape');
		await expect(dock).toBeHidden();
		// Focus lands on a control outside the closed pane, never on <body>.
		await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('More controls');
		// And a second Esc leaves it closed.
		await page.keyboard.press('Escape');
		await expect(dock).toBeHidden();
	});
});

test.describe('phone @mobile @webkit-phone', () => {
	test.skip(({ viewport }) => (viewport?.width ?? 1440) > 500, 'the phone sheets');

	test('a drill-in relabels the sheet\'s back chevron to its source, and the chevron returns there', async ({ page }) => {
		await gotoStudio(page);
		await page.getByRole('button', { name: CHROME.chat, exact: true }).first().click();
		await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toBeVisible();
		await page.getByRole('button', { name: 'Attach from your Library' }).click();
		await page.getByRole('button', { name: 'Open Library ↗' }).click();
		const back = page.getByRole('dialog').getByRole('button', { name: 'Back to Chat' });
		await expect(back).toBeVisible();
		await back.click();
		await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Back to Chat' })).toHaveCount(0);
	});
});
