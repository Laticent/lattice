import { CHROME, expect, gotoStudio, openChat, openInspector, test } from './studio-fixture';

// The Studio's docked panels share one size contract (studio/dock-layout.ts,
// engineering/decisions/2026-10-20-studio-split-panel-sizing.md): docks open at 320 (never under
// 280) and the editor takes 46% of the editor|preview pair; a window too narrow for all four
// columns folds the editor to its rail instead of squeezing the others under their minimums.

const widths = (page: import('@playwright/test').Page) =>
	page.evaluate(() => {
		const out: Record<string, number> = {};
		for (const p of document.querySelectorAll('[data-studio-split] [data-slot="resizable-panel"]')) out[p.id] = p.getBoundingClientRect().width;
		return out;
	});

for (const w of [1280, 1440, 1920, 2560]) {
	test(`desktop ${w}: both docks open, docks >= 280 and the pair splits 46:54`, async ({ page }) => {
		await page.setViewportSize({ width: w, height: 900 });
		await gotoStudio(page);
		await openInspector(page);
		await openChat(page);
		await expect.poll(async () => (await widths(page))['studio-assistant'] ?? 0).toBeGreaterThanOrEqual(279);
		const s = await widths(page);
		expect(s['studio-settings']).toBeGreaterThanOrEqual(279);
		expect(s['studio-editor']).toBeGreaterThanOrEqual(299);
		expect(s['studio-preview']).toBeGreaterThanOrEqual(299);
		if (w >= 1440) {
			expect(s['studio-settings']).toBeCloseTo(320, -1);
			expect(s['studio-editor'] / (s['studio-editor'] + s['studio-preview'])).toBeCloseTo(0.46, 2);
		}
	});
}

test('desktop 1100: both docks open folds the editor to its rail, silently, and unfolds when one closes', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await gotoStudio(page);
	await openInspector(page);
	await openChat(page);
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeLessThan(60);
	const s = await widths(page);
	expect(s['studio-settings']).toBeGreaterThanOrEqual(279);
	expect(s['studio-assistant']).toBeGreaterThanOrEqual(279);
	await expect(page.getByText('Editor collapsed.')).toHaveCount(0);
	await page.getByRole('button', { name: CHROME.chat, exact: true }).first().click();
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeGreaterThan(299);
});

test('desktop 1100: a returning visitor with an old saved layout still folds silently and can unfold', async ({ page }) => {
	await page.addInitScript(() => {
		const g = 1048 - 3;
		localStorage.setItem('lattice-docs-split-studio', JSON.stringify({ 'studio-assistant,studio-editor,studio-preview,studio-settings': { 'studio-settings': (260 / g) * 100, 'studio-assistant': (200 / g) * 100, 'studio-editor': (296 / g) * 100, 'studio-preview': (296 / g) * 100 } }));
	});
	await page.setViewportSize({ width: 1100, height: 800 });
	await gotoStudio(page);
	await openInspector(page);
	await openChat(page);
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeLessThan(60);
	await expect(page.getByText('Editor collapsed.')).toHaveCount(0);
	expect(await page.evaluate(() => sessionStorage.getItem('lattice-docs-split-studio-collapsed'))).toBeNull();
	await page.getByRole('button', { name: CHROME.chat, exact: true }).first().click();
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeGreaterThan(299);
});

test('desktop 1100: expanding a folded editor makes room by closing the assistant panel', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await gotoStudio(page);
	await openInspector(page);
	await openChat(page);
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeLessThan(60);
	await page.getByRole('button', { name: /Expand editor/ }).first().click();
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeGreaterThan(299);
	expect((await widths(page))['studio-assistant']).toBeUndefined();
});

test('desktop: narrowing the window with both docks open folds the editor instead of squeezing panels', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await openInspector(page);
	await openChat(page);
	await page.setViewportSize({ width: 1180, height: 900 });
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeLessThan(60);
	const s = await widths(page);
	expect(s['studio-settings']).toBeGreaterThanOrEqual(279);
	expect(s['studio-assistant']).toBeGreaterThanOrEqual(279);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeGreaterThan(299);
});

test('desktop 1100: expanding an editor the person collapsed makes room instead of swapping the panes', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await gotoStudio(page);
	await openInspector(page);
	await page.getByRole('button', { name: /Collapse editor/ }).first().click();
	await openChat(page);
	await page.getByRole('button', { name: /Expand editor/ }).first().click();
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeGreaterThan(299);
	expect((await widths(page))['studio-preview']).toBeGreaterThan(299);
	await expect(page.getByText('Preview collapsed — rendering paused.')).toHaveCount(0);
});

test('desktop: a fold and unfold from resizing returns both docks to the contract widths', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await openInspector(page);
	await openChat(page);
	await page.setViewportSize({ width: 1180, height: 900 });
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeLessThan(60);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(async () => Math.round((await widths(page))['studio-settings'])).toBe(320);
	const s = await widths(page);
	expect(Math.round(s['studio-assistant'])).toBe(320);
	expect(s['studio-editor'] / (s['studio-editor'] + s['studio-preview'])).toBeCloseTo(0.46, 2);
});

test('desktop: a reload restores the person\'s editor collapse without re-showing the toast', async ({ page }) => {
	// A MutationObserver, not a polled count: the toast lives ~1.5s and a poll can miss it.
	await page.addInitScript(() => {
		(window as unknown as { __toasted: boolean }).__toasted = false;
		new MutationObserver(() => {
			if (document.body?.innerText.includes('Editor collapsed.')) (window as unknown as { __toasted: boolean }).__toasted = true;
		}).observe(document, { subtree: true, childList: true, characterData: true });
	});
	const toasted = () => page.evaluate(() => (window as unknown as { __toasted: boolean }).__toasted);
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await page.getByRole('button', { name: /Collapse editor/ }).first().click();
	await expect.poll(toasted).toBe(true); // their own collapse still says so
	await page.reload();
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeLessThan(60);
	await page.waitForTimeout(4000);
	expect(await toasted()).toBe(false);
	expect(await page.evaluate(() => sessionStorage.getItem('lattice-docs-split-studio-collapsed'))).toBe('a');
});
