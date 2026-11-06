import { BEACON_HOST, HOSTILE, SEEDED_KEY } from './hostile-deck';
import { storedOpenRouterKey } from './openrouter-key-helper';
import { expect, gotoStudio, LIVE_PREVIEW, livePreview, test, typeDeck } from './studio-fixture';

// A SHARED DECK CANNOT READ THE AUTHOR'S OPENROUTER KEY.
//
// The preview frame is a same-origin, unsandboxed `srcdoc` iframe. TWO walls stand between a
// hostile deck and `localStorage`, where the author's key lives. A script that got past both
// could read the key and send it anywhere: `top.location`, `parent.fetch`, a form post.
//
//   1. `sanitizeSlideHtml`, which `single-slide-render.ts` runs on every slide before it enters
//      the frame. This spec drives it.
//   2. The frame's `script-src 'nonce-…' 'strict-dynamic'` (lib/core/subresource-csp.mjs), which
//      refuses any inline handler or script the sanitizer missed. This spec checks it is present.
//
// Each wall was measured alone, 2026-11-06, by building with `sanitizeOnce` returning its input:
//   · without the script-src (#3048), this spec went RED: img onerror, details ontoggle, iframe
//     srcdoc and an onerror after a <style> read the key;
//   · with it, the spec stays GREEN on desktop and mobile Chromium, Gecko, and WebKit phone and
//     tablet. The handlers sit in the frame's DOM and the browser refuses to run them.
// The bare <script> vectors stay inert even unguarded, because the preview inserts markup through
// paths that do not run <script>; they are kept as a tripwire in case that ever changes.
// (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §4, HARD RULE #22.)
//
// The vectors live in `hostile-deck.ts`, shared with `byok-key-isolation-surfaces.spec.ts`. Typing the deck is how the markup arrives here; a
// deck opened from a share link or a `.lattice` file lands in the same renderer.

test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko a hostile deck in the preview cannot read the stored OpenRouter key', async ({ page }) => {
	test.slow();
	const beacons: string[] = [];
	await page.route(`${BEACON_HOST}/**`, async (route) => {
		beacons.push(route.request().url());
		await route.abort();
	});
	await page.addInitScript((key) => {
		try {
			localStorage.setItem('lattice-db-or-key', key);
		} catch {
			/* storage unavailable — the leak check below would pass vacuously, so the control catches it */
		}
	}, SEEDED_KEY);
	await gotoStudio(page);
	await typeDeck(page, HOSTILE);

	// Positive control: the hostile slide really rendered in the preview frame. Without this
	// a broken render would pass the leak check below for the wrong reason.
	await expect(livePreview(page).getByText('Isolation probe')).toBeVisible({ timeout: 30_000 });
	await expect(livePreview(page).getByText('Probe body text.')).toBeVisible();
	// The key is still there for the author's own surfaces.
	// The page itself can still recover it (sealed at rest, §9): that is what a payload would be after.
	expect(await storedOpenRouterKey(page)).toBe(SEEDED_KEY);

	// Wait for the signal the handlers ride on: every image in the frame has settled (loaded or
	// failed), so an `onerror` that survived would already have run, then one frame for the
	// queued `toggle`/`load` events.
	const frame = page.locator(LIVE_PREVIEW).contentFrame();
	// `decode()` settles once an image has loaded or failed. Firefox never marks a refused
	// image `complete`, so that flag is not the signal. The test's own timeout bounds a hung decode.
	await frame.locator('img').evaluateAll((imgs) => Promise.allSettled(imgs.map((i) => (i as HTMLImageElement).decode())));
	await frame.locator('body').evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

	// The second wall is in place: the frame's policy refuses any script without the page's nonce.
	const policy = await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
	expect(policy, 'the preview frame carries the nonce script-src').toMatch(/script-src 'nonce-[\w-]{16,}' 'strict-dynamic'/);
	expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);

	const leaked = await page.evaluate(() => (window as unknown as { __byokLeak?: string[] }).__byokLeak ?? []);
	expect(leaked, 'no payload in the deck should run in the preview frame').toEqual([]);
	expect(beacons, 'no payload should reach the beacon host').toEqual([]);
});
