import { expect, test } from './studio-fixture';

// ── A slide engine that fails to load, on the REAL Studio (PR #3385) ──────────────────────────────────────
//
// The engine's import used to fail silently: the frame scheduler swallowed the rejection, so the preview kept
// its loading skeleton for good. DeckPreview now shows its failure card with Retry (DeckPreview.test.tsx pins
// the logic). This asks what only a browser answers (HARD RULE #23): the card appears in the built Studio, and
// a person can actually press Retry. They could not at first: the Studio's preview box is `pointer-events: none`
// (a swipe surface) and the card inherited it, so Retry took no click on any engine.
//
// The service worker is blocked so the route below meets the engine request: a worker answers it from its own
// cache otherwise. Waits are on signals (the card's text, the frame's reveal), never on a duration (#32).
//
// NOT `gotoStudio`. It waits for the preview's first painted slide, and with the engine blocked only the newcomer bake
// can paint one, so this spec would pass only while the bake keeps painting first, and fail with "never painted" if it
// did not. The card is this spec's own signal, so it opens the page and waits for that.

test.use({ serviceWorkers: 'block' });

// Every attempt, the retries included: after a failed import, load-engine.ts asks for `engine.js?retry=N`, a URL the
// browser's module map has not cached (a plain re-import would replay the failure with no fetch).
const ENGINE = '**/esm/engine.js*';

test('@crosswidth @webkit-phone @webkit-tablet @gecko an engine that fails to load shows the failure card, and Retry loads it', async ({ page }) => {
	await page.route(ENGINE, (route) => route.abort());
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	const card = page.locator('[aria-label="Live deck preview"] .nacre-failed').first();
	// Over a box with no slide: the full card. Over the newcomer bake's slide, if it painted first: a bar that keeps the
	// slide in view. Which one depends on which won the race, so either reads true.
	await expect(card.locator('.nacre-failed__text')).toHaveText(/the slide engine did not load(; check the connection, then Retry|, so edits will not show here)/i);
	// The browser's own message (a module URL, wider than a phone) belongs to the console, not the card.
	await expect(card.locator('.nacre-failed__text')).not.toContainText('engine.js');
	// A phone opens on the editor pane in some postures; the card lives in the preview. Checked here, once the card is
	// up, because the shell (and its pane switch) has certainly mounted by then.
	const previewTab = page.getByRole('button', { name: 'Preview', exact: true }).first();
	if (!(await card.isVisible()) && (await previewTab.isVisible())) await previewTab.click();

	// The engine is reachable again: a real click on Retry (no `force`, so a box that swallows pointer events
	// fails here) loads it, and the slide comes back.
	await page.unroute(ENGINE);
	await card.getByRole('button', { name: 'Retry' }).click();
	await expect(card).toHaveCount(0);
	await expect
		.poll(() => page.locator('[aria-label="Live deck preview"] iframe.live').first().evaluate((f: HTMLIFrameElement) => f.style.opacity).catch(() => ''))
		.toBe('1');
});
