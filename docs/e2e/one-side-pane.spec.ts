import { CHROME, caretSettled, editorFocusSettled, expect, gotoStudio, openChat, pressSettled, test } from './studio-fixture';

// ONE side pane at a time (engineering/decisions/2026-11-15-one-side-pane.md), on the real Studio.
// The unit tests pin the state; these pin what a person sees: one docked column, the drill-in chip,
// and where X goes.

const dockedPanes = (page: import('@playwright/test').Page) =>
	page.evaluate(() => [...document.querySelectorAll('[data-studio-split] [data-studio-pane]')].map((p) => p.id));

test.describe('desktop @crosswidth @webkit-tablet @gecko', () => {
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
	// The drawn caret Compose shows while the editor is not focused (clicking a rail button blurs it) has to stay on its
	// text when a pane opens or closes and the column re-flows. It was `position: fixed` from viewport coordinates and
	// was not re-measured on a layout change, so it stood where the text had been and bled outside the editor (owner,
	// 2026-11-15). The caret sits at the START of the title, so its offset from the title's block is the same at any width.
	test('Compose\'s drawn caret stays on its text, inside the editor, when a pane opens and closes', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
		const title = page.locator('#studio-pane-editor .cs-host .ProseMirror h1').first();
		await expect(title).toBeVisible();
		await title.click();
		// The click focuses Compose, and ProseMirror's 20 ms focus check writes its own selection back over a caret key
		// pressed inside that window: under load, Home was undone and the caret stayed where the click put it, mid-title
		// (3 of 20 Firefox runs at four workers), so the test measured from a premise that never held. Wait for the check
		// and the click's selection, then press Home and wait for its move (studio-fixture.ts, #3150).
		await editorFocusSettled(page);
		await caretSettled(page);
		await pressSettled(page, 'Home');
		const ghost = page.locator('#studio-pane-editor .lx-ghost-caret');
		// Its offset from the start of the title's text, and whether it lies inside the editor's scroll box.
		const caretFit = () =>
			page.evaluate(() => {
				const g = document.querySelector<HTMLElement>('#studio-pane-editor .lx-ghost-caret');
				const h = document.querySelector<HTMLElement>('#studio-pane-editor .cs-host .ProseMirror h1');
				const host = document.querySelector<HTMLElement>('#studio-pane-editor .cs-host');
				if (!g || !h || !host || getComputedStyle(g).display === 'none') return null;
				const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
				const text = walker.nextNode() as Text | null;
				if (!text) return null;
				const r = document.createRange();
				r.setStart(text, 0);
				r.setEnd(text, 1);
				const glyph = r.getBoundingClientRect();
				const c = g.getBoundingClientRect();
				const box = host.getBoundingClientRect();
				return {
					dx: Math.round(c.left - glyph.left),
					dy: Math.round(c.top + c.height / 2 - (glyph.top + glyph.height / 2)),
					inside: c.left >= box.left - 2 && c.right <= box.right + 2 && c.top >= box.top - 2 && c.bottom <= box.bottom + 2,
				};
			});
		for (const step of ['open', 'close', 'open', 'close']) {
			await page.getByRole('button', { name: CHROME.coach, exact: true }).first().click();
			await expect(page.getByRole('button', { name: CHROME.coach, exact: true }).first()).toHaveAttribute('aria-pressed', step === 'open' ? 'true' : 'false');
			await expect(ghost).toBeVisible();
			// Within 3px of the title's first letter, on its line, inside the editor: the column re-flowed under it.
			await expect.poll(caretFit, { message: `after Coach ${step}` }).toMatchObject({ inside: true });
			const f = await caretFit();
			expect(Math.abs(f?.dx ?? 99), `drawn caret ${f?.dx}px from the title's first letter after Coach ${step}`).toBeLessThanOrEqual(3);
			expect(Math.abs(f?.dy ?? 99), `drawn caret ${f?.dy}px off the title's line after Coach ${step}`).toBeLessThanOrEqual(4);
		}
	});
});

test.describe('tablet @crosswidth @webkit-tablet @gecko', () => {
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
