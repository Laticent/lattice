import { expect, gotoStudio, readStorage, test } from './studio-fixture';

// Palette / theme selection. The persisted slug + the `html[data-palette]`
// attribute are deterministic oracles (the in-iframe re-theme is not directly
// readable, but these prove the cause propagated).

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

function paletteAttr(page: import('@playwright/test').Page): Promise<string | null> {
	return page.evaluate(() => document.documentElement.getAttribute('data-palette'));
}

// The target must NOT be the default palette (cuoio since #1285), or the
// `data-palette` half of the oracle is satisfied by the default and proves nothing
// about the picker. Burgundy is curated and unambiguously not the default.
test('topbar theme picker sets the active palette and persists it', async ({ page }) => {
	await expect.poll(() => paletteAttr(page)).toBe('cuoio'); // the default we are moving OFF
	await page.getByRole('button', { name: 'Theme' }).click();
	await page.getByRole('menuitem', { name: 'Burgundy' }).click();

	await expect.poll(() => readStorage(page, 'lattice-studio-palette')).toBe('burgundy');
	await expect.poll(() => paletteAttr(page)).toBe('burgundy');
});

test('the command palette also switches the theme', async ({ page }) => {
	// Palette-setting is also reachable from ⌘K (the inspector Look swatches were
	// retired); assert the same persisted-slug + attribute oracle.
	await page.keyboard.press('ControlOrMeta+k');
	await page.getByPlaceholder('Search or run a command…').fill('burgundy');
	await page.getByRole('option', { name: /burgundy/i }).first().click();

	await expect.poll(() => readStorage(page, 'lattice-studio-palette')).toBe('burgundy');
	await expect.poll(() => paletteAttr(page)).toBe('burgundy');
});
