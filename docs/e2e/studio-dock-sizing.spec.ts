import { layoutSettled, schedulerDrained, timersDrained } from './barriers';
import { expect, gotoStudio, openChat, openInspector, test } from './studio-fixture';

// The Studio's docked panels share one size contract (studio/dock-layout.ts,
// engineering/decisions/2026-10-20-studio-split-panel-sizing.md): docks open at 320 (never under
// 280) and the editor takes 46% of the editor|preview pair; a window too narrow for every column
// folds the editor to its rail instead of squeezing the others under their minimums. Since
// 2026-11-15-one-side-pane.md only ONE side pane docks at a time, so at every desktop width
// (1100 and up) the editor keeps its minimum: the fold that two docks forced at 1100 is gone.

const widths = (page: import('@playwright/test').Page) =>
	page.evaluate(() => {
		const out: Record<string, number> = {};
		for (const p of document.querySelectorAll('[data-studio-split] [data-slot="resizable-panel"]')) out[p.id] = p.getBoundingClientRect().width;
		return out;
	});

for (const w of [1280, 1440, 1920, 2560]) {
	test(`desktop ${w}: one side pane at a time, the dock >= 280 and the pair splits 46:54`, async ({ page }) => {
		await page.setViewportSize({ width: w, height: 900 });
		await gotoStudio(page);
		await openInspector(page);
		await openChat(page);
		// ONE side slot (2026-11-15-one-side-pane.md): Chat replaced the settings dock.
		await expect.poll(async () => (await widths(page))['studio-assistant'] ?? 0).toBeGreaterThanOrEqual(279);
		const s = await widths(page);
		expect(s['studio-settings']).toBeUndefined();
		expect(s['studio-editor']).toBeGreaterThanOrEqual(299);
		expect(s['studio-preview']).toBeGreaterThanOrEqual(299);
		if (w >= 1440) {
			expect(s['studio-assistant']).toBeCloseTo(320, -1);
			expect(s['studio-editor'] / (s['studio-editor'] + s['studio-preview'])).toBeCloseTo(0.46, 2);
		}
	});
}

test('desktop 1100: one open pane never folds the editor, whichever pane holds the slot', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await gotoStudio(page);
	await openInspector(page);
	await expect.poll(async () => (await widths(page))['studio-settings'] ?? 0).toBeGreaterThanOrEqual(279);
	expect((await widths(page))['studio-editor']).toBeGreaterThan(299);
	await openChat(page);
	await expect.poll(async () => (await widths(page))['studio-assistant'] ?? 0).toBeGreaterThanOrEqual(279);
	const s = await widths(page);
	expect(s['studio-settings']).toBeUndefined();
	expect(s['studio-editor']).toBeGreaterThan(299);
	expect(s['studio-preview']).toBeGreaterThan(299);
	await expect(page.getByText('Editor collapsed.')).toHaveCount(0);
});

test('desktop 1100: a returning visitor with a saved TWO-dock layout opens one pane, unfolded, with no toast', async ({ page }) => {
	// The four-panel key the two-slot model saved. It can no longer be reached, so it must not leak in.
	await page.addInitScript(() => {
		const g = 1048 - 3;
		localStorage.setItem('lattice-docs-split-studio', JSON.stringify({ 'studio-assistant,studio-editor,studio-preview,studio-settings': { 'studio-settings': (260 / g) * 100, 'studio-assistant': (200 / g) * 100, 'studio-editor': (296 / g) * 100, 'studio-preview': (296 / g) * 100 } }));
	});
	await page.setViewportSize({ width: 1100, height: 800 });
	await gotoStudio(page);
	await openInspector(page);
	await openChat(page);
	await expect.poll(async () => (await widths(page))['studio-assistant'] ?? 0).toBeGreaterThanOrEqual(279);
	expect((await widths(page))['studio-editor']).toBeGreaterThan(299);
	await expect(page.getByText('Editor collapsed.')).toHaveCount(0);
	expect(await page.evaluate(() => sessionStorage.getItem('lattice-docs-split-studio-collapsed'))).toBeNull();
});

test('desktop: narrowing the window to 1100 with a pane open keeps every column at or above its minimum', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await openChat(page);
	await page.setViewportSize({ width: 1100, height: 900 });
	await expect.poll(async () => Math.round((await widths(page))['studio-assistant'] ?? 0)).toBeGreaterThanOrEqual(279);
	const s = await widths(page);
	expect(s['studio-editor']).toBeGreaterThan(299);
	expect(s['studio-preview']).toBeGreaterThan(299);
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

test('desktop: a resize down and back keeps the dock inside its contract and every column at its minimum', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await openChat(page);
	await page.setViewportSize({ width: 1100, height: 900 });
	await expect.poll(async () => (await widths(page))['studio-editor']).toBeGreaterThan(299);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(async () => (await widths(page))['studio-preview']).toBeGreaterThan(299);
	// Inside 280–480, not back at exactly 320: the panels are sized in percentages, so the 280 floor
	// at 1100 carries back up as a wider share (371 measured). That drift predates one-pane — two
	// docks hid it because their fold re-ran the ideal layout — and is a follow-up of its own.
	const s = await widths(page);
	expect(s['studio-assistant']).toBeGreaterThanOrEqual(279);
	expect(s['studio-assistant']).toBeLessThanOrEqual(481);
	expect(s['studio-editor']).toBeGreaterThan(299);
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
	// The restore has landed. A toast for it would come from the collapse the restore looks like: a ResizeObserver
	// reports it after the frame's layout (layoutSettled), Sonner publishes on a zero-delay timer and flushes it to the
	// DOM synchronously (sonner's Toaster subscriber), so a zero-delay timer queued after that runs after any publish,
	// and the MutationObserver above has seen the toast by then (it accumulates, so the toast's short life cannot hide
	// it). Was a 4000 ms wait (HARD RULE #32). NOT on the page clock: a faked requestAnimationFrame runs the restore's
	// two-frame settle off the real frames, the restore then reads as the person's own collapse, and the toast shows
	// (9 runs in 165 when this test installed the clock).
	await layoutSettled(page);
	await timersDrained(page);
	await schedulerDrained(page);
	expect(await toasted()).toBe(false);
	expect(await page.evaluate(() => sessionStorage.getItem('lattice-docs-split-studio-collapsed'))).toBe('a');
});
