import type { Page } from '@playwright/test';
import { expect, test } from './studio-fixture';

// ── A slide engine that fails to load, on the REAL Studio (PR #3385) ──────────────────────────────────────
//
// The engine's import used to fail silently: the frame scheduler swallowed the rejection, so the preview kept
// its loading skeleton for good. DeckPreview now shows its failure card with Retry (DeckPreview.test.tsx pins
// the logic). This asks what only a browser answers (HARD RULE #23): the card appears in the built Studio, a
// person can actually press Retry, and the engine then LOADS. Retry took no click at first: the Studio's preview
// box is `pointer-events: none` (a swipe surface) and the card inherited it.
//
// The service worker is blocked so the routes below meet the engine's requests: a worker answers them from its
// own cache otherwise. Waits are on signals (the card, the engine global, the frame's reveal), never on a
// duration (#32).
//
// NOT `gotoStudio`. It waits for the preview's first painted slide, and with the engine blocked only the newcomer bake
// can paint one, so this spec would pass only while the bake keeps painting first, and fail with "never painted" if it
// did not. The card is this spec's own signal, so it opens the page and waits for that.

test.use({ serviceWorkers: 'block' });

// The engine's ENTRY, every attempt included: after a failed import, load-engine.ts asks for `engine.js?retry=N`, a
// URL the browser's module map has not cached (a plain re-import would replay the failure with no fetch).
const ENTRY = '**/esm/engine.js*';
// The entry's SUB-FILES. `?retry=N` renames only the entry, so these keep their URLs; a browser build that keeps a failed
// one recovers only on a reload or in a new tab, which is why a failed Retry makes the card offer both.
const SUB_FILES = '**/esm/chunk-*.js';

const card = (page: Page) => page.locator('[aria-label="Live deck preview"] .nacre-failed').first();
// `false` while a navigation is in flight: Reload replaces the document, and an evaluate that straddles the swap throws
// "Execution context was destroyed" (1 run in 20 on webkit-phone). A poll's next turn reads the new document.
const engineLoaded = (page: Page) =>
	page.evaluate(() => !!(window as { LatticePlayground?: unknown }).LatticePlayground).catch(() => false);

/** Open the Studio and wait for the failure card's text; show the preview pane on a phone. */
async function openToCard(page: Page): Promise<void> {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	// Over a box with no slide: the full card. Over the newcomer bake's slide: a bar that keeps the slide in view.
	// Which one depends on whether the bake has revealed, so either reads true.
	await expect(card(page).locator('.nacre-failed__text')).toHaveText(/the slide engine did not load(; check the connection, then Retry|, so edits will not show here)/i);
	// The browser's own message (a module URL, wider than a phone) belongs to the console, not the card.
	await expect(card(page).locator('.nacre-failed__text')).not.toContainText('engine.js');
	// A phone opens on the editor pane in some postures; the card lives in the preview. Checked here, once the card is
	// up, because the shell (and its pane switch) has certainly mounted by then.
	const previewTab = page.getByRole('button', { name: 'Preview', exact: true }).first();
	if (!(await card(page).isVisible()) && (await previewTab.isVisible())) await previewTab.click();
}

/** The engine is in, the card is gone, and the slide shows. The ENGINE is the signal: a card that clears and a
 *  frame already showing the bake read the same before the engine loads as after. */
async function expectRecovered(page: Page): Promise<void> {
	await expect.poll(() => engineLoaded(page)).toBe(true);
	await expect(card(page)).toHaveCount(0);
	await expect
		.poll(() => page.locator('[aria-label="Live deck preview"] iframe.live').first().evaluate((f: HTMLIFrameElement) => f.style.opacity).catch(() => ''))
		.toBe('1');
}

test('@crosswidth @webkit-phone @webkit-tablet @gecko an engine whose entry fails to load shows the failure card, and Retry loads it', async ({ page }) => {
	await page.route(ENTRY, (route) => route.abort());
	await openToCard(page);
	// The engine is reachable again: a real click on Retry (no `force`, so a box that swallows pointer events
	// fails here) imports the entry under a fresh URL, and the engine loads.
	await page.unroute(ENTRY);
	await card(page).getByRole('button', { name: 'Retry' }).click();
	await expectRecovered(page);
});

// A failed SUB-FILE, the path the card advises. Whether a browser fetches a failed sub-file again on Retry, on a reload or
// only in a new tab depends on the browser's BUILD, not on Lattice: Playwright 1.56's Chromium and Gecko needed a reload
// and its WebKit a new tab, while 1.65's recover a dropped or 503'd sub-file on Retry (Chromium, Gecko) or on a reload
// (WebKit) (PR #3385, measured). So this test asserts the product's promise, which holds on any build:
//   1. The sub-files stay blocked through Retry, so Retry fails on every engine, and the card must then offer Reload and
//      say "reload, or open the page in a new tab".
//   2. With the sub-files reachable, following that advice loads the engine: the reload does, or else a new tab does.
test('@crosswidth @webkit-phone @webkit-tablet @gecko an engine whose sub-file fails offers Reload after a failed Retry, and its advice loads the engine', async ({ page, context }) => {
	await page.route(SUB_FILES, (route) => route.abort());
	await openToCard(page);
	await card(page).getByRole('button', { name: 'Retry' }).click();
	const reload = card(page).getByRole('button', { name: 'Reload' });
	await expect(reload).toBeVisible();
	await expect(card(page).locator('.nacre-failed__text')).toContainText(/still did not load.*reload, or open the page in a new tab/i);
	expect(await engineLoaded(page)).toBe(false);

	await page.unroute(SUB_FILES);
	await reload.click();
	await page.waitForLoadState('domcontentloaded');
	// After the reload, the engine loads, or (a build that keeps the failure past a reload) the card is back.
	const failedAgain = card(page).locator('.nacre-failed__text');
	await expect.poll(async () => (await engineLoaded(page)) || (await failedAgain.count()) > 0).toBe(true);
	if (await engineLoaded(page)) {
		const previewTab = page.getByRole('button', { name: 'Preview', exact: true }).first();
		if (!(await page.locator('[aria-label="Live deck preview"] iframe.live').first().isVisible()) && (await previewTab.isVisible())) await previewTab.click();
		await expectRecovered(page);
		return;
	}
	// The card's other advice: a new tab loads it.
	const fresh = await context.newPage();
	await fresh.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await expect.poll(() => engineLoaded(fresh)).toBe(true);
	await expect(card(fresh)).toHaveCount(0);
});
