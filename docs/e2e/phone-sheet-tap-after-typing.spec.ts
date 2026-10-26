import type { Page } from '@playwright/test';
import { expect, gotoStudio, openDeckSettingsAt, openSection, test } from './studio-fixture';

// A TAP THAT ENDS THE TYPING LANDS WHERE THE FINGER IS (followup 2547-p2).
//
// A phone sheet is 54px taller while a text field in it has focus (`MOBILE_HEIGHT`). A tap on a control below the field
// blurs it at `mousedown`, the sheet used to shrink from the top at once, its body slid 54px down, and the click landed on
// whatever slid under the finger. Deck settings adds a second move: the typed-in row is pinned above the keyboard and
// drops back into the list on blur. `useSheetTapHold` (ui/panel.tsx) now holds both until the click has landed.
//
// Real taps, `.fill()` then a touchscreen tap at the control's box, in WebKit on the iPhone 15 Pro profile (`webkit-phone`)
// and in Chromium at 390px with touch on (`mobile`). That is touch EMULATION, not an iPhone: whether iOS Safari hit-tests
// before it moves the visual viewport for the closing keyboard is UNVERIFIED here.
//
// Each arm also runs once with the hold defeated, to prove the arm can fail: without it the same tap misses.

test.use({ hasTouch: true });

/** Tap the centre of a control's box, the way a finger does: no scroll-into-view, no actionability wait. */
async function tapAt(page: Page, box: { x: number; y: number; width: number; height: number }) {
	await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/** Strip the hold as soon as it is set: the sheet behaves as it did before the fix. */
async function defeatHold(page: Page) {
	await page.evaluate(() => {
		new MutationObserver((list) => {
			for (const m of list) if (m.target instanceof Element && m.target.hasAttribute('data-typing-held')) m.target.removeAttribute('data-typing-held');
		}).observe(document.body, { attributes: true, attributeFilter: ['data-typing-held'], subtree: true });
	});
}

async function openPhoneLibrary(page: Page) {
	await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
	await page.getByRole('button', { name: /^Library/ }).first().click();
	return page.getByRole('dialog', { name: 'Library' });
}

for (const held of [true, false]) {
	test(`@mobile @webkit-phone Library: typing a search, then tapping a section tab ${held ? 'selects it' : 'misses without the hold'}`, async ({ page }) => {
		await gotoStudio(page);
		if (!held) await defeatHold(page);
		const sheet = await openPhoneLibrary(page);
		const field = sheet.getByRole('searchbox').or(sheet.getByRole('textbox')).first();
		await field.tap();
		await field.fill('zz');
		const tab = sheet.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: 'Design', exact: true });
		const box = await tab.boundingBox();
		if (!box) throw new Error('no Design tab');
		await tapAt(page, box);
		if (held) await expect(tab).toHaveAttribute('aria-selected', 'true');
		else {
			await page.waitForTimeout(500);
			await expect(tab).toHaveAttribute('aria-selected', 'false');
		}
		await page.screenshot({ path: test.info().outputPath('after-tap.png') });
	});

	test(`@mobile @webkit-phone Deck settings: typing a deck name, then tapping Language ${held ? 'opens it' : 'misses without the hold'}`, async ({ page }) => {
		await gotoStudio(page);
		if (!held) await defeatHold(page);
		await openDeckSettingsAt(page, 390);
		await openSection(page, 'General');
		const name = page.getByPlaceholder('Follows the cover heading');
		await name.tap();
		await name.fill('Quarterly review');
		const language = page.getByRole('combobox', { name: 'Choose deck language' });
		const box = await language.boundingBox();
		if (!box) throw new Error('no Language select');
		await tapAt(page, box);
		if (held) {
			await expect(page.getByRole('listbox')).toBeVisible();
			await page.screenshot({ path: test.info().outputPath('after-tap.png') });
			// The blur still happened, so the name the field saves on blur is kept.
			await page.keyboard.press('Escape');
			await expect(name).toHaveValue('Quarterly review');
			return;
		} else {
			await page.waitForTimeout(500);
			await expect(page.getByRole('listbox')).toHaveCount(0);
		}
		await page.screenshot({ path: test.info().outputPath('after-tap.png') });
	});
}
