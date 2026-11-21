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
// The entry's SUB-FILES. `?retry=N` renames only the entry, so these keep their URLs, and every engine replays a failed
// one in the page: after a failed Retry the card offers Reload (and, for WebKit, a new tab).
const SUB_FILES = '**/esm/chunk-*.js';

const card = (page: Page) => page.locator('[aria-label="Live deck preview"] .nacre-failed').first();
const engineLoaded = (page: Page) => page.evaluate(() => !!(window as { LatticePlayground?: unknown }).LatticePlayground);

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

// A failed SUB-FILE, engine by engine, as measured (PR #3385). Each branch asserts what that engine does, so a change on
// any of them goes red; none is skipped.
//   Chromium and Gecko replay the failure in the page: Retry fails, the card offers Reload, and Reload recovers.
//   WebKit replays it across a reload and a navigation too (a fresh-URL navigation, a 60 s wait: still failed); only a new
//   tab recovers. Retry fails, the card offers Reload and names a new tab, and a new tab in the same context recovers.
test('@crosswidth @webkit-phone @webkit-tablet @gecko an engine whose sub-file fails says how to recover on each engine, and that way works', async ({ page, browserName, context }) => {
	await page.route(SUB_FILES, (route) => route.abort());
	await openToCard(page);
	await page.unroute(SUB_FILES);
	await card(page).getByRole('button', { name: 'Retry' }).click();
	const reload = card(page).getByRole('button', { name: 'Reload' });
	await expect(reload).toBeVisible();
	await expect(card(page).locator('.nacre-failed__text')).toContainText(/still did not load.*reload, or open the page in a new tab/i);
	if (browserName !== 'webkit') {
		await reload.click();
		await page.waitForLoadState('domcontentloaded');
		await expect.poll(() => engineLoaded(page)).toBe(true);
		const previewTab = page.getByRole('button', { name: 'Preview', exact: true }).first();
		if (!(await card(page).isVisible()) && !(await page.locator('[aria-label="Live deck preview"] iframe.live').first().isVisible()) && (await previewTab.isVisible())) await previewTab.click();
		await expectRecovered(page);
		return;
	}
	// WebKit: the page the card offered stays failed after its own reload (the card is back, offering Retry), and a new
	// tab loads the engine.
	await reload.click();
	await page.waitForLoadState('domcontentloaded');
	await expect(card(page).locator('.nacre-failed__text')).toHaveText(/the slide engine did not load/i);
	expect(await engineLoaded(page)).toBe(false);
	const fresh = await context.newPage();
	await fresh.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await expect.poll(() => engineLoaded(fresh)).toBe(true);
	await expect(card(fresh)).toHaveCount(0);
});
