import { currentSlide, expect, gotoStudio, livePreview, test } from './studio-fixture';

// Pixel-baseline visual regression at every viewport — the follow-up the
// experience-gating doc (2026-06-28, §"Baseline maintenance") deferred until
// the font environment could be pinned. It now is: the spec BLOCKS the Google
// Fonts requests and the config's stylePath (e2e/visual.css) pins the chrome
// to DejaVu. The preview iframe's slide fonts are vendored same-origin woff2 —
// untouched.
//
// SANDBOX vs CI — near-identical, NOT identical (corrected 2026-09-01). This
// header used to claim the render was "deterministic across the sandbox and CI
// (same pinned Chromium build = same rasterizer; same font bytes on both)".
// The browser pin holds and the rasterizer is the same; the output still is
// not byte-equal. #1426 diffed CI's own PNGs against the sandbox's on one
// commit: 2,627 differing px on desktop, 1,078 tablet, 765 mobile — all of it
// one text run's subpixel fringing, and 4–9x INSIDE maxDiffPixelRatio. A
// sandbox bless therefore passes in CI, on the margin rather than on identity.
// engineering/development.md carries the same correction.
//
// THE BLESSING RITUAL (never bless casually):
//   npm run test:e2e:bless   — regenerates the committed baselines under
//   e2e/visual.spec.ts-snapshots/. Run it (a) when a PR deliberately changes
//   the studio's look — re-bless in the SAME PR, like the slide golden-diffs —
//   or (b) when the @playwright/test version bumps (the version pin IS the
//   browser pin; a browser bump shifts every pixel).
//
// maxDiffPixelRatio (config) absorbs sub-pixel AA noise only; a real layout
// shift is far above it.

test('@visual studio renders at this viewport', async ({ page }) => {
	// No webfonts: the chrome falls back to the pinned stack everywhere, so a
	// font-swap can never race the screenshot (and the sandbox, whose proxy
	// blocks Chromium's font fetches anyway, produces baselines CI accepts —
	// see the header on why that is not the same as "CI-identical").
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

	await gotoStudio(page);
	await expect(currentSlide(page)).not.toBeEmpty();

	// Let both documents' fonts settle — the top chrome (now all-local) and the
	// preview iframe's vendored slide faces — before comparing pixels.
	await page.evaluate(() => document.fonts.ready);
	await livePreview(page).locator('body').evaluate((b) => b.ownerDocument.fonts.ready);

	await expect(page).toHaveScreenshot('studio.png');
});
