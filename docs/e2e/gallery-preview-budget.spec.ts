import { expect, gotoStudio, test } from './studio-fixture';

// #1463 — scrolling the add-slide gallery used to accumulate one live engine iframe per
// tile the user had ever passed. Measured on the built site before the fix: opening the
// gallery held 12 live frames, and ONE scroll to the bottom of the browse grid took that
// to 62 while Chrome's resident set went ~1.1GB → ~1.6GB (~10MB per tile). That is a
// memory-exhaustion profile, and a renderer OOM presents as "the tab died and reloaded".
//
// The window is two-way now, over a shared budget (slide-thumb.tsx `PREVIEW_BUDGET`).
// This is the REAL-SURFACE oracle for the property that matters: however far you scroll,
// the number of live preview documents plateaus instead of climbing. It asserts against a
// ceiling with headroom rather than the exact budget — the in-band set is viewport-derived
// and may legitimately run over it (an on-screen tile is never recycled).
const CEILING = 48;

/** Live engine preview documents currently mounted in the page. */
const liveFrames = (page: import('@playwright/test').Page) => page.evaluate(() => document.querySelectorAll('iframe.live').length);

/**
 * Open the add-slide gallery at EITHER width. There is no header launcher on a phone: the row
 * lives in the StudioDrawer behind "Menu", and only on the Edit pane — so a desktop-shaped open
 * simply times out at 390px, which is what kept this spec desktop-only and left the mobile
 * budget number unmeasured. The search field is the ready signal, and its placeholder differs
 * per breakpoint (`Search slides…` vs `Search 61 slides — …`).
 */
async function openGallery(page: import('@playwright/test').Page, compact: boolean) {
	if (compact) {
		await page.getByRole('button', { name: 'Markdown source' }).click();
		await page.waitForTimeout(600);
		await page.getByRole('button', { name: 'Menu' }).click();
	}
	await page.getByRole('button', { name: 'Insert component' }).click();
	await page.getByPlaceholder(/Search slides|Search \d+ slides/).waitFor();
}

test('@crosswidth the add-slide gallery holds its live-preview count flat across a full scroll', async ({ page }, testInfo) => {
	// Three flick-scroll traversals of a 61-tile grid plus a search pass — comfortably past the
	// 60s suite default. Explicit rather than `test.slow()`, which would triple it.
	test.setTimeout(120_000);
	await gotoStudio(page);
	await openGallery(page, testInfo.project.name === 'mobile');
	// Let the first band paint, so the baseline is a real windowed set and not zero.
	await expect.poll(() => liveFrames(page), { timeout: 30_000 }).toBeGreaterThan(1);

	const scroller = page.locator('div.overflow-y-auto.overscroll-contain').first();
	const height = await scroller.evaluate((el) => el.scrollHeight);
	expect(height).toBeGreaterThan(0);

	// FLICK-SCROLL, not a stepped one, and that is the whole difference between this being an
	// oracle and being decoration. A stepped `scrollTo` + `waitForTimeout` hands the
	// IntersectionObserver task a clean idle window per step, so its entries never coalesce:
	// measured 0 multi-entry batches across 12 stepped runs (6 of them under deliberate host CPU
	// contention) versus 4–10 in every rAF-continuous run. Coalesced delivery is exactly what
	// corrupted the budget registry, so a stepped scroll cannot see the defect it guards against.
	// This drives the scroller from inside a requestAnimationFrame loop — how a human flings a
	// grid — and samples the live count as it goes.
	const flick = async (down: boolean) =>
		page.evaluate(
			async ([sel, goingDown]) => {
				const el = document.querySelectorAll(sel as string)[0] as HTMLElement;
				const peak = { n: 0 };
				await new Promise<void>((done) => {
					const step = () => {
						el.scrollTop += (goingDown ? 1 : -1) * 260;
						peak.n = Math.max(peak.n, document.querySelectorAll('iframe.live').length);
						const atEnd = goingDown ? el.scrollTop >= el.scrollHeight - el.clientHeight - 1 : el.scrollTop <= 0;
						if (atEnd) done();
						else requestAnimationFrame(step);
					};
					requestAnimationFrame(step);
				});
				return peak.n;
			},
			['div.overflow-y-auto.overscroll-contain', down] as const,
		);

	let browsePeak = 0;
	for (let pass = 0; pass < 3; pass++) {
		browsePeak = Math.max(browsePeak, await flick(true));
		await page.waitForTimeout(400);
		browsePeak = Math.max(browsePeak, await flick(false));
		await page.waitForTimeout(400);
	}
	// Settle, then read the steady state — the property the fix actually claims is that the count
	// PLATEAUS, and unlike the ceiling that claim is scale-free (it holds at any viewport, so it
	// does not quietly become a desktop-only assertion).
	await page.waitForTimeout(2500);
	const settled = await liveFrames(page);
	expect(browsePeak, `live preview documents peaked at ${browsePeak} across three flick-scrolls`).toBeLessThanOrEqual(CEILING);
	expect(settled, `after three full traversals the grid settled at ${settled} live documents`).toBeLessThanOrEqual(CEILING);

	// And the same under an active search — the condition the bug was reported against.
	await page.getByPlaceholder(/Search slides|Search \d+ slides/).fill('compare options');
	await page.waitForTimeout(1200);
	const searchHeight = await scroller.evaluate((el) => el.scrollHeight);
	let searchPeak = 0;
	for (let y = 0; y <= searchHeight; y += 250) {
		await scroller.evaluate((el, top) => el.scrollTo({ top }), y);
		await page.waitForTimeout(180);
		searchPeak = Math.max(searchPeak, await liveFrames(page));
	}
	expect(searchPeak, `live preview documents peaked at ${searchPeak} while scrolling search results`).toBeLessThanOrEqual(CEILING);

	// The window must still be a WINDOW — the tiles you are looking at are rendered, not
	// placeholders. (A fix that simply stopped mounting previews would also pass the caps.)
	await expect.poll(() => liveFrames(page), { timeout: 15_000 }).toBeGreaterThan(1);
});

// #1463 — no tile is watched. Every thumbnail frame is stamped `<html
// data-lattice-thumbnail>`, which routes the engine runtime's overflow / type-floor
// watcher to `off`: it installs no probe, no MutationObserver and no resize handler, so
// a scrolled grid is not running one per frame to draw marks nobody can read at ~260px.
//
// This is the REAL-SURFACE oracle, and it caught real chrome: before the change the
// shipped gallery painted an "Overflows" tab on the `image` tile and type-floor alarms
// on `state-chart` and `quadrant` — QA badges describing a catalog sample the author
// neither wrote nor can fix.
test('no add-slide gallery tile paints an authoring alarm', async ({ page }, testInfo) => {
	test.setTimeout(120_000);
	await gotoStudio(page);
	await openGallery(page, testInfo.project.name === 'mobile');

	const scroller = page.locator('div.overflow-y-auto.overscroll-contain').first();
	const height = await scroller.evaluate((el) => el.scrollHeight);
	for (let y = 0; y <= height; y += 250) {
		await scroller.evaluate((el, top) => el.scrollTo({ top }), y);
		await page.waitForTimeout(160);
	}
	// The watcher re-measures once webfonts land, so a too-early read can miss a mark.
	await page.waitForTimeout(4500);

	// Walk the GALLERY's frames only — scoped to the grid's scroller, deliberately. A
	// page-wide `page.frames()` sweep also picks up the Studio's own full-size preview
	// behind the dialog, which is an authoring surface and MUST still read `author`;
	// asserting `off` over that set fails for the right reason on the wrong frame.
	const tileFrames = scroller.locator('iframe.live');
	const n = await tileFrames.count();
	let inspected = 0;
	const marked: string[] = [];
	for (let i = 0; i < n; i += 1) {
		const found = await scroller
			.frameLocator('iframe.live >> nth=' + i)
			.locator('body')
			.evaluate(() => {
				const secs = document.querySelectorAll('section[data-lattice-slide]');
				if (!secs.length) return null;
				return {
					level: secs[0].getAttribute('data-lattice-overflow-marker'),
					name: secs[0].getAttribute('data-class') ?? '?',
					chrome: document.querySelectorAll('section.overflow, section.illegible, .overflow-tab, .illegible-tab').length,
				};
			})
			.catch(() => null);
		if (!found) continue;
		inspected += 1;
		// The level stamp is the LOAD-BEARING half: without it "zero chrome" could pass
		// because the runtime never booted in these frames at all.
		if (found.level !== 'off' || found.chrome > 0) marked.push(`${found.name} (level=${found.level}, chrome=${found.chrome})`);
	}

	// Against the FRAME COUNT, not a floor of 1: the per-frame read swallows errors and continues,
	// so `> 1` would pass while 31 of 33 frames went unread, and the claim is that EVERY tile is
	// unwatched. Not an exact equality though — `n` is captured before ~33 sequential cross-frame
	// evaluates addressed by `nth=i`, so a single recycle mid-loop shifts every later index and
	// would fail the run for a reason unrelated to the property under test. One frame of slack
	// keeps the census honest without making it a coin flip on a nightly tier.
	expect(inspected, `only ${inspected} of ${n} tile frames could be read`).toBeGreaterThanOrEqual(n - 1);
	expect(inspected, 'no gallery tile rendered a slide, so nothing was actually checked').toBeGreaterThan(1);
	expect(marked, `tile(s) still watched or still marked: ${marked.join(' · ')}`).toEqual([]);

	// And the CONTROL, in the same run: the Studio's own preview is an authoring surface
	// and keeps its watcher. Without this, "every tile reads off" would also pass if the
	// flag had been wired to every preview on the page.
	const main = await page
		.frameLocator('[aria-label="Live deck preview"] iframe.live')
		.locator('section[data-lattice-slide]')
		.first()
		.getAttribute('data-lattice-overflow-marker');
	expect(main, "the Studio's own preview must still be watched at author level").toBe('author');
});
