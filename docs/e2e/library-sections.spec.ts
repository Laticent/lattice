import type { Locator, Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// THE LIBRARY'S SECTION PILLS ARE ICONS WHERE WORDS DO NOT FIT, AND THE ROW NEVER MOVES UNDER A TAP
// (design §7 of engineering/decisions/2026-11-22-local-first-drive-storage.md, slice 4).
//
// Six labeled pills wrap at 320px, so the dock (280–480px) and the phone show icons, each named by its label for a
// screen reader and in a hint. Beside the kinds button (Design, Media) even six icons outgrow the dock's 280px
// minimum, so the strip folds into a More pill. Whatever folds, folds for every section alike: the room the pills
// get never changes with the section, because a row that refolds under the tap that picked a section moves the
// thing the finger is on.

const SECTIONS = ['All', 'Decks', 'Design', 'Media', 'Files', 'Plugins'];

async function openLibrary(page: Page, width: number) {
	if (width >= 1100) await page.getByRole('button', { name: CHROME.library }).click();
	else {
		await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
		await page.getByRole('button', { name: /^Library/ }).click();
	}
}

/** The pills shown in the row (tabs and the More pill), with their names and boxes. */
async function row(strip: Locator) {
	return strip.evaluate((tablist) => {
		const host = tablist.parentElement as HTMLElement;
		const els = [...tablist.querySelectorAll<HTMLElement>('[role="tab"]'), ...host.querySelectorAll<HTMLElement>(':scope > button[aria-haspopup]')];
		return els.map((e) => {
			const r = e.getBoundingClientRect();
			return { name: e.getAttribute('aria-label') || e.textContent || '', text: (e.textContent || '').trim(), top: Math.round(r.top), left: r.left, right: r.right, height: Math.round(r.height) };
		});
	});
}

async function pick(page: Page, strip: Locator, name: string) {
	const tab = strip.getByRole('tab', { name, exact: true });
	if (await tab.count()) await tab.click();
	else {
		await page.getByRole('button', { name: /^More library sections|^Library sections: / }).click();
		await page.getByRole('menuitemradio', { name }).click();
	}
}

async function rowHolds(page: Page, width: number) {
	const strip = page.getByRole('tablist', { name: 'Library sections' });
	await expect(strip).toBeVisible();
	const first = await row(strip);
	for (const name of SECTIONS) {
		await pick(page, strip, name);
		// The pick took: the pill or the More pill names it.
		await expect(page.getByRole('tab', { name, exact: true, selected: true }).or(page.getByRole('button', { name: `Library sections: ${name}, more` }))).toBeVisible();
		const now = await row(strip);
		// One row, inside the pane, icons only, every pill named, and the same pills as before the tap.
		expect(new Set(now.map((p) => p.top)).size, `${name}: one row`).toBe(1);
		for (const p of now) {
			expect(p.left, `${p.name} starts on screen`).toBeGreaterThanOrEqual(0);
			expect(p.right, `${p.name} ends on screen`).toBeLessThanOrEqual(width + 0.5);
			expect(p.text, `${p.name} draws an icon, not a word`).toBe('');
			expect(p.name.length, 'every pill has a name').toBeGreaterThan(0);
			// Never shorter than a labeled pill (32px dense, 34px roomy): icons do not shrink the touch target.
			expect(p.height, `${p.name} keeps a labeled pill's height`).toBeGreaterThanOrEqual(32);
		}
		expect(now.filter((p) => !p.name.includes('more') && !p.name.startsWith('More')).map((p) => p.name), `${name}: no pill moved under the tap`).toEqual(first.filter((p) => !p.name.includes('more') && !p.name.startsWith('More')).map((p) => p.name));
	}
	return first;
}

test.describe('at 320px, the narrowest phone', () => {
	test.use({ viewport: { width: 320, height: 640 } });
	test('six icon pills on one row, named, and still under every tap @gecko', async ({ page }) => {
		await gotoStudio(page);
		await openLibrary(page, 320);
		const first = await rowHolds(page, 320);
		// All six fit a 320px phone: nothing folds.
		expect(first.map((p) => p.name)).toEqual(SECTIONS);
	});
});

test('the docked Library at its 280px minimum keeps one still row, folding the least used into More', async ({ page }) => {
	await gotoStudio(page);
	await openLibrary(page, 1440);
	const handle = page.locator('[data-slot="resizable-handle"]:visible').first();
	await handle.focus();
	// The keyboard path of the resize handle (role="separator"): Home is the pane's minimum.
	await page.keyboard.press('Home');
	await expect.poll(async () => Math.round((await page.locator('[data-studio-pane]').first().boundingBox())?.width ?? 0)).toBe(280);
	const first = await rowHolds(page, 1440);
	// Beside the kinds button's place, six icons outgrow 280px, so the least used fold.
	expect(first.some((p) => p.name.startsWith('More') || p.name.endsWith(', more'))).toBe(true);
});

test('the phone Library shows the six sections as named icons @webkit-phone', async ({ page }) => {
	const width = page.viewportSize()?.width ?? 393;
	await gotoStudio(page);
	await openLibrary(page, width);
	const first = await rowHolds(page, width);
	expect(first.map((p) => p.name)).toEqual(SECTIONS);
});

test('a keyboard user sees each icon pill named in a hint as the arrows move through the docked Library', async ({ page }) => {
	await gotoStudio(page);
	await openLibrary(page, 1440);
	const strip = page.getByRole('tablist', { name: 'Library sections' });
	await strip.getByRole('tab', { name: 'All', exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(strip.getByRole('tab', { name: 'Decks', exact: true })).toBeFocused();
	await expect(page.getByRole('tooltip').filter({ hasText: 'Decks' })).toBeVisible();
});

test('the labeled sheet keeps words beside the icons @gecko', async ({ page }) => {
	await page.setViewportSize({ width: 820, height: 1180 });
	await gotoStudio(page);
	await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).click();
	await page.getByRole('menuitem', { name: /^Library/ }).click();
	const strip = page.getByRole('tablist', { name: 'Library sections' });
	for (const name of SECTIONS) await expect(strip.getByRole('tab', { name, exact: true })).toHaveText(name);
});
