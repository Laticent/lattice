import type { Page } from '@playwright/test';
import { expect, test } from './studio-fixture';

// The device tier's slice 1b on the real Studio: the inline boot script applies a saved tier (or a `?tier=` pin)
// before first paint, and lib/device-tier.ts decides this visit's tier after the first slide, saves it for the next
// visit, and caches the CPU probe it runs in a worker. engineering/decisions/2026-11-12-device-capability-tiers.md.
//
// HARD RULE #32: which tier THIS machine gets is the runner's business (CI draws in software), so an unpinned run
// asserts only the shape of what was saved. Every wait is on a signal: the attribute, or the probe's saved score.

const TIER_KEY = 'lattice-device-tier';
const CPU_KEY = 'lattice-device-cpu';
const TIERS = /^(full|lite|unsupported)$/;

const tierAttr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-device-tier'));
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** Seed localStorage before the page's own scripts run. */
async function seed(page: Page, entries: Record<string, string>): Promise<void> {
	await page.addInitScript((e) => {
		for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
	}, entries);
}

/** The runtime has run once the probe's score is saved (it runs after the first slide and a quiet moment). */
async function runtimeRan(page: Page): Promise<void> {
	await expect.poll(() => stored(page, CPU_KEY), { timeout: 60_000, message: 'the CPU probe never saved a score' }).not.toBeNull();
}

test('@crosswidth @webkit-phone @webkit-tablet @gecko a saved tier is on <html> before the app runs', async ({ page }) => {
	await seed(page, { [TIER_KEY]: 'lite' });
	// At DOMContentLoaded only the inline boot script has run: the app sets the tier after its first slide and a quiet
	// moment, so an attribute here can only have come from the pre-paint read.
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	expect(await tierAttr(page)).toBe('lite');
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko a saved value that is not a tier is ignored', async ({ page }) => {
	await seed(page, { [TIER_KEY]: 'turbo" onload="x' });
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	expect(await tierAttr(page)).toBeNull();
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko a ?tier= pin wins before first paint and is never saved', async ({ page }) => {
	await seed(page, { [TIER_KEY]: 'full' });
	await page.goto('/studio/?tier=unsupported', { waitUntil: 'domcontentloaded' });
	expect(await tierAttr(page)).toBe('unsupported');
	await runtimeRan(page);
	expect(await tierAttr(page)).toBe('unsupported');
	expect(await stored(page, TIER_KEY)).toBe('full');
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko unpinned, the app decides a tier after the first slide and saves it for the next visit', async ({ page }) => {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await runtimeRan(page);
	const saved = await stored(page, TIER_KEY);
	expect(saved).toMatch(TIERS);
	expect(await tierAttr(page)).toBe(saved);
	const cpu = JSON.parse((await stored(page, CPU_KEY)) ?? 'null') as { score: number; at: number };
	expect(Number.isInteger(cpu.score) && cpu.score >= 0).toBe(true);

	// The next visit paints the saved tier before the app runs.
	await page.reload({ waitUntil: 'domcontentloaded' });
	expect(await tierAttr(page)).toBe(saved);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko the System panel shows the speed test the app saved', async ({ page }) => {
	// Fresh by the PAGE's own clock, so the test never depends on the runner's date (HARD RULE #32).
	await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ score: 123, at: Date.now() })), CPU_KEY);
	await page.goto('/studio/?system&tier=full', { waitUntil: 'domcontentloaded' });
	const value = page.locator('[data-testid="system-overlay"] dt').filter({ hasText: /^Speed test$/ }).locator('xpath=following-sibling::dd[1]');
	await expect(value).toHaveText('123 units');
});
