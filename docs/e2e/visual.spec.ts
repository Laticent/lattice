import { currentSlide, expect, gotoStudio, livePreview, railButtons, test } from './studio-fixture';
import { VISUAL_DECK_ID, VISUAL_DECK_SLIDES, VISUAL_DECK_SOURCE, VISUAL_DECK_TITLE } from './visual-fixture';

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
// THE SUBJECT IS A FIXTURE, NOT THE SEEDED DECK (2026-09-02). The shot used to be
// taken on `DECKS[0]`, so the welcome deck's copy — including the live catalog
// counts its own gate keeps current — was baked into three committed PNGs, and
// adding a component turned them red. `visual-fixture.ts` now supplies the deck;
// its header carries the full reasoning. Nothing the repo counts appears in it.
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

	// Seed the FIXTURE deck before the island hydrates, so the shot is taken against
	// content this directory owns rather than against `DECKS[0]` — see visual-fixture.ts
	// for why the seeded welcome deck could not go on being the subject. Written the
	// same way `gotoStudio` seeds the posture: an init script, so the store reads it on
	// its first load and never paints the built-in first.
	await page.addInitScript(
		({ id, title, source }) => {
			try {
				localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id, title, builtin: false }]));
				// JSON-encoded, not raw: the store reads every key through a `JSON.parse`
				// helper, so a bare string throws there and is swallowed as `null` — which
				// silently boots the BLANK STARTER deck instead. Measured while writing this.
				localStorage.setItem(`lattice-studio-src-${id}`, JSON.stringify(source));
				localStorage.setItem('lattice-studio-active', JSON.stringify({ deckId: id, slideIndex: 0 }));
				// `migrateWelcome` appends the built-in welcome deck to any saved index that
				// lacks it, once. Harmless to the shot (it appends, so index[0] is still the
				// fixture) but it writes storage mid-run; setting the flag keeps the seeded
				// state exactly what this script wrote.
				localStorage.setItem('lattice-studio-welcome-migrated', '1');
			} catch {
				/* storage unavailable — the app falls back to its built-ins and the shot fails loudly */
			}
		},
		{ id: VISUAL_DECK_ID, title: VISUAL_DECK_TITLE, source: VISUAL_DECK_SOURCE },
	);

	await gotoStudio(page);
	// Anti-vacuity: prove the seed took — and prove it on the SOURCE, not just the name.
	// The title comes from the index entry, so it is set even when the source key fails
	// to load and the app falls back to the one-slide blank starter; the first draft of
	// this seed did exactly that, and a title-only check photographed the starter deck
	// and called it a baseline. The slide count can only come from the source.
	await expect(page.getByRole('button', { name: new RegExp(VISUAL_DECK_TITLE) })).toBeVisible();
	await expect(railButtons(page)).toHaveCount(VISUAL_DECK_SLIDES);
	await expect(currentSlide(page)).not.toBeEmpty();

	// Let both documents' fonts settle — the top chrome (now all-local) and the
	// preview iframe's vendored slide faces — before comparing pixels.
	await page.evaluate(() => document.fonts.ready);
	await livePreview(page).locator('body').evaluate((b) => b.ownerDocument.fonts.ready);

	await expect(page).toHaveScreenshot('studio.png');
});
