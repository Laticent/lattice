import { expect, test } from './studio-fixture';

// ── The video provider registry, on the REAL Playground ─────────────────────────────
//
// `lib/core/video-providers.mjs` is read by TWO consumers: the static transform that
// builds the poster, badge and QR, and the parent-hosted playback lightbox
// (`docs/src/playground/video-overlay.js`). Before the registry existed those were two
// tables with their own regexes, and the second one drifting was invisible — a missed
// provider degraded playback to "opens a tab" with nothing going red.
//
// Every other test of this is a unit test of pure functions. Per HARD RULE #23 that
// left the load-bearing claim — "the lightbox consumer works at runtime" — resting on a
// proxy, and `studio-smoke` carried no video-overlay spec at all, so the surface had
// never been driven. This spec drives it.
//
// Three things it can see that a unit test cannot:
//
//  1. THE BRIDGE IS WIRED END TO END. The poster lives inside a same-origin `srcdoc`
//     iframe; the player must NOT (an iframe in slide HTML is stripped by
//     `sanitizeSlideHtml`, HARD RULE #22). So a tap has to cross the in-frame link
//     guard (`deck-preview.js`) into `window.__videoPlay` and mount in the PARENT.
//     Four separate modules have to agree for that to happen.
//  2. THE PLAYER SRC IS REBUILT FROM THE PARSED ID. The registry's `embed` template is
//     the only thing that may produce a player src — never the author's href. That is
//     the property that stops a hostile URL becoming an iframe src, and it is only
//     really proved where a real browser parses a real URL.
//  3. A FOREIGN ORIGIN WEARS NO PROVIDER BADGE. Both former tables matched a provider
//     name anywhere in the URL, so `https://evil.example/#instagram.com/reel/X`
//     rendered a slide with a "Watch on Instagram" badge and a QR encoding the
//     attacker's origin. The fix matches the PARSED host; this asserts the outcome on
//     the rendered surface rather than on the parser in isolation.

// BOTH ARMS WERE MUTATION-PROVED before landing, because a green e2e spec that cannot
// fail is worse than no spec — it converts an unverified claim into a certified one:
//
//   - break the registry's `embed` template  -> arm 1 fails on the iframe src;
//   - restore the old substring host match   -> arm 2 fails: the hostile deck renders a
//                                               `figure.video-embed` again.
//
// That second mutation also found something about THIS FILE worth knowing: the two arms
// are served by DIFFERENT bundles. The overlay is astro/vite-bundled from `docs/src`, so
// `npm run build:e2e` refreshes it; the static video transform rides
// `docs/public/playground/lattice-playground.js`, which the ROOT `npm run build`
// produces and `sync:playground` only copies. A kernel change verified with an astro
// rebuild alone tests arm 1 and silently skips arm 2.

const SOURCE_KEY = 'lattice-docs-pg-source';
const ID = 'aqz-KE-bpKQ';
const WATCH = `https://www.youtube.com/watch?v=${ID}`;
const EMBED = `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`;

const deck = (url: string) => `---
marp: true
---

<!-- _class: video qr -->

## Watch the tour.

- ${url}
- Scan to watch \`caption\`
`;

// The engine paint is not the subject here; stub the heavy externals the way
// playground-state.spec.ts does so nothing is network-gated. The provider embed is
// stubbed too: the assertion is the iframe's SRC, and a real cross-origin load would
// make this spec depend on youtube-nocookie.com being reachable from the runner.
test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/youtube-nocookie\.com/, (route) =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub player</title>' }),
	);
});

async function openDeck(page: import('@playwright/test').Page, source: string) {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, source],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const preview = page.frameLocator('#preview');
	await expect(preview.locator('.lattice')).toBeVisible({ timeout: 40_000 });
	return preview;
}

test('@smoke the registry drives the poster AND the parent-hosted player', async ({ page }) => {
	const preview = await openDeck(page, deck(WATCH));

	// ANTI-VACUITY: the video transform must have RUN. Without this, "no foreign origin
	// leaked" below would be trivially true because nothing rendered at all.
	const poster = preview.locator('a.video-poster');
	await expect(poster).toHaveCount(1, { timeout: 30_000 });
	await expect(preview.locator('figure.video-embed[data-provider="youtube"]')).toHaveCount(1);
	await expect(preview.locator('.video-provider')).toHaveText(/Watch on YouTube/);
	// The QR is generated from the SAME registry row — `qrTile` encodes `provider.url`,
	// so a QR proves the watch target travelled all the way to the scannable artifact.
	// Target the video figure's own tile: a bare `svg` selector picks up the engine's
	// hidden marker berth instead.
	await expect(preview.locator('.video-qr .qr-tile svg')).toHaveCount(1);
	await expect(preview.locator('.video-qr .qr-tile svg')).toBeVisible();

	// The poster link is the registry's canonical watch URL — not whatever was authored.
	await expect(poster).toHaveAttribute('href', WATCH);

	// The bridge is installed on the FRAME's window by the parent (installVideoBridge).
	// Wait for it rather than racing hydration: the preview painting does not imply the
	// effect that installs the hook has run.
	await expect
		.poll(
			async () =>
				await page.evaluate(() => {
					const fr = document.querySelector('#preview') as HTMLIFrameElement | null;
					return typeof (fr?.contentWindow as unknown as { __videoPlay?: unknown })?.__videoPlay;
				}),
			{ timeout: 30_000 },
		)
		.toBe('function');

	// A tap must NOT open a tab — the guard suppresses navigation when the parent
	// mounts a player. `target="_blank"` means a regression here is a popup.
	let popped = false;
	page.on('popup', () => {
		popped = true;
	});

	await poster.click();

	const modal = page.locator('.pg-video-modal[role="dialog"]');
	await expect(modal).toBeVisible({ timeout: 15_000 });

	// THE CLAIM: the src is the registry row's template + the PARSED id, never the href.
	await expect(modal.locator('iframe')).toHaveAttribute('src', EMBED);

	expect(popped, 'a tap opened a tab instead of the in-page player').toBe(false);
	expect(page.url()).toContain('/playground/');
});

test('@smoke a provider name in a URL fragment wears no provider badge', async ({ page }) => {
	// The exact string both former tables resolved as Instagram. `instagram.com` is in
	// the FRAGMENT, so the parsed host is evil.example and no provider owns it.
	const preview = await openDeck(page, deck('https://evil.example/#instagram.com/reel/DaStLQkuN3Q'));

	// ANTI-VACUITY: the deck rendered and the slide is the `video` component — so a zero
	// count below means the transform DECLINED, not that the page failed to paint.
	await expect(preview.locator('section.video')).toHaveCount(1, { timeout: 30_000 });

	await expect(preview.locator('figure.video-embed')).toHaveCount(0);
	await expect(preview.locator('a.video-poster')).toHaveCount(0);
	await expect(preview.locator('.video-provider')).toHaveCount(0);
	// And nothing anywhere on the slide claims a provider.
	await expect(preview.locator('section.video')).not.toContainText(/Watch on/);
});
