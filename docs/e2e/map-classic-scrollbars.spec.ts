import { expect, test } from '@playwright/test';
import { gotoStudio, setEditorContent } from './studio-fixture';

/**
 * Classic scrollbars take layout space (Chrome and Edge on Windows, desktop Linux, Firefox, macOS set to
 * "always show"). Headless Chromium hides them by default, so a loop between the map rail's width and its
 * own scrollbar was invisible to every spec: tiles shrank when a scrollbar appeared, the content then fit,
 * the scrollbar went, the tiles grew, and React stopped at its update limit (#185), replacing the whole
 * island with the error screen. Found by a red team at a viewport height of 832 and with an 8-slide deck.
 * These run with the scrollbars SHOWN, which can only be set for the whole file.
 */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const RAIL = '[data-map-rail]';

test('the Studio map survives a deck edit and a height sweep with no crash', async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
	await setEditorContent(page, Array.from({ length: 8 }, (_, i) => `# S${i}`).join('\n\n---\n\n'));
	await expect(page.locator(`${RAIL} button[data-unit]`)).toHaveCount(8, { timeout: 15_000 });
	for (let h = 900; h >= 780; h -= 4) await page.setViewportSize({ width: 1440, height: h });
	await expect(page.getByText('hit an unexpected error')).toHaveCount(0);
	await expect(page.locator(RAIL)).toBeVisible();
});

test('the Playground map survives a height sweep with no error and still walks', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap')).toHaveClass(/is-live/);
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 30_000 });
	for (let h = 900; h >= 560; h -= 4) await page.setViewportSize({ width: 1440, height: h });
	await page.locator(`${RAIL} button[data-unit="2"]`).click();
	await expect(page.locator('#pg-walk .pg-walk-pos')).toContainText('3 /');
	expect(errors).toEqual([]);
});
