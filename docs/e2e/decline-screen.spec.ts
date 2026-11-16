import type { Page } from '@playwright/test';
import { expect, gotoStudio, openSection, test } from './studio-fixture';

// The decline screen, "continue anyway" and the Performance mode setting, on the real Studio and Playground
// (engineering/decisions/2026-11-12-device-capability-tiers.md §6, §7). Every engine and width the device-tier specs run on.
//
// HARD RULE #32: the runner's own machine never decides. A decline is either pinned (`?tier=unsupported`) or caused on
// purpose by turning one required feature off in the page (CSS.supports answers no for `:has()`); every unpinned assertion
// is about what does NOT happen. Every wait is on the screen, the banner or the attribute, never a duration.

const SCREEN = '[data-testid="device-decline"]';
const BANNER = '[data-testid="device-banner"]';
const tier = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-device-tier'));

/** The runtime has decided once the CPU probe has saved its score. */
async function runtimeRan(page: Page): Promise<void> {
	await expect.poll(() => page.evaluate(() => localStorage.getItem('lattice-device-cpu')), { timeout: 150_000, message: 'the tier runtime never ran' }).not.toBeNull();
}

test.describe.configure({ timeout: 240_000 });

test('@crosswidth @webkit-phone @webkit-tablet @gecko a pinned decline covers the Studio; continue anyway runs it as Lite under a banner', async ({ page }) => {
	await page.goto('/studio/?tier=unsupported', { waitUntil: 'domcontentloaded' });
	const screen = page.locator(SCREEN);
	await expect(screen).toBeVisible();
	await expect(screen.getByRole('heading', { name: "Lattice can't run well in this browser." })).toBeFocused();
	await expect(screen).toContainText('?tier=unsupported');
	// The app beneath is out of reach while the screen is up.
	await expect(page.locator('body > [inert]').first()).toBeAttached();
	for (const name of ['Copy system report', 'Continue anyway']) await expect(screen.getByRole('button', { name })).toBeInViewport({ ratio: 1 });

	await screen.getByRole('button', { name: 'Continue anyway' }).click();
	await expect(screen).toHaveCount(0);
	await expect(page.locator(BANNER)).toBeVisible();
	await expect(page.locator(BANNER)).toContainText(/Lite mode:/);
	// One line at every width: it covers as little of the app as it can.
	expect((await page.locator(BANNER).boundingBox())?.height ?? 99).toBeLessThan(32);
	expect(await tier(page)).toBe('lite');
	await expect(page.locator('body > [inert]')).toHaveCount(0);

	// The rest of the session stays past the screen: a reload keeps Lite and the banner.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.locator(BANNER)).toBeVisible();
	expect(await tier(page)).toBe('lite');
	await expect(page.locator(SCREEN)).toHaveCount(0);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko a browser without CSS :has() is declined by name, unpinned', async ({ page }) => {
	await page.addInitScript(() => {
		const real = CSS.supports.bind(CSS);
		CSS.supports = ((a: string, b?: string) => (b === undefined && /:has\(/.test(a) ? false : b === undefined ? real(a) : real(a, b))) as typeof CSS.supports;
	});
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	const screen = page.locator(SCREEN);
	await expect(screen).toBeVisible({ timeout: 150_000 });
	await expect(screen).toContainText("It needs CSS :has(), which this browser doesn't support.");
	expect(await tier(page)).toBe('unsupported');
	// The decline is saved, so the next visit declines from its first paint. Saved once the CPU probe has answered: until
	// then the tier is interim and nothing is written (device-tier.ts), and on WebKit the screen can show first.
	await expect.poll(() => page.evaluate(() => localStorage.getItem('lattice-device-tier')), { timeout: 150_000 }).toBe('unsupported');
});

test('@crosswidth @webkit-phone @gecko unpinned, a supported browser is never declined', async ({ page }) => {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await runtimeRan(page);
	expect(await tier(page)).toMatch(/^(full|lite)$/);
	await expect(page.locator(SCREEN)).toHaveCount(0);
	await expect(page.locator(BANNER)).toHaveCount(0);
});

test('@crosswidth @webkit-phone @gecko a pinned decline covers the Playground too', async ({ page }) => {
	await page.goto('/playground/?tier=unsupported', { waitUntil: 'domcontentloaded' });
	await expect(page.locator(SCREEN)).toBeVisible({ timeout: 60_000 });
	await page.locator(SCREEN).getByRole('button', { name: 'Continue anyway' }).click();
	await expect(page.locator(BANNER)).toBeVisible();
	expect(await tier(page)).toBe('lite');
});

test('@crosswidth @gecko the Performance mode setting switches the tier at once and keeps it for the next visit', async ({ page }) => {
	await gotoStudio(page);
	await runtimeRan(page);
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'General');
	const group = page.getByRole('group', { name: 'Performance mode' });
	await expect(group.getByRole('button', { name: 'Auto', pressed: true })).toBeVisible();
	await group.getByRole('button', { name: 'Full' }).click();
	await expect.poll(() => tier(page)).toBe('full');
	await group.getByRole('button', { name: 'Lite' }).click();
	await expect.poll(() => tier(page)).toBe('lite');
	await expect(group.getByRole('button', { name: 'Lite', pressed: true })).toBeVisible();
	expect(await page.evaluate(() => [localStorage.getItem('lattice-device-tier-override'), localStorage.getItem('lattice-device-tier')])).toEqual(['lite', 'lite']);
	await group.getByRole('button', { name: 'Full' }).click();
	await expect.poll(() => tier(page)).toBe('full');
});
