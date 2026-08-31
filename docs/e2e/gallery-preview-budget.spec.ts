import { markersSettled, paintedMarkers } from './marker-chrome';
import { expect, gotoStudio, openAddSlide, test } from './studio-fixture';

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

test('@crosswidth the add-slide gallery holds its live-preview count flat across a full scroll', async ({ page }, testInfo) => {
	// Three flick-scroll traversals of a 61-tile grid plus a search pass — comfortably past the
	// 60s suite default. Explicit rather than `test.slow()`, which would triple it.
	test.setTimeout(120_000);
	await gotoStudio(page);
	// The cross-width open (drawer route on a phone) is `openAddSlide` in the fixture now —
	// it grew out of this spec's local helper when #1654 unified the launcher names and made
	// an open-coded `getByRole` ambiguous on desktop.
	await openAddSlide(page, testInfo.project.name === 'mobile');
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
	const browseHeight = await scroller.evaluate((el) => el.scrollHeight);
	await page.getByPlaceholder(/Search slides|Search \d+ slides/).fill('compare options');
	// The filtered grid is SHORTER than the browse grid, and that change is the signal the
	// 1200ms sleep was standing in for. Polling it means the search pass below always scrolls
	// the filtered height rather than, on a slow box, the stale browse height (#1526).
	await expect
		.poll(() => scroller.evaluate((el) => el.scrollHeight), { timeout: 30_000 })
		.toBeLessThan(browseHeight);
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

// #1463 — no GALLERY tile is watched. Each is stamped `data-lattice-specimen`, which
// routes the engine runtime's overflow / type-floor watcher to `off`: it installs no
// probe and no resize handler, so a scrolled grid is not running one per frame to draw
// marks describing a catalog sample the author neither wrote nor can fix.
//
// This is the REAL-SURFACE oracle, and it caught real chrome: before the change the
// shipped gallery painted an "Overflows" tab on the `image` tile and type-floor alarms
// on `state-chart` and `quadrant` — QA badges describing a catalog sample the author
// neither wrote nor can fix.
test('@crosswidth no add-slide gallery tile paints an authoring alarm', async ({ page }, testInfo) => {
	test.setTimeout(120_000);
	await gotoStudio(page);
	await openAddSlide(page, testInfo.project.name === 'mobile');

	const scroller = page.locator('div.overflow-y-auto.overscroll-contain').first();
	const height = await scroller.evaluate((el) => el.scrollHeight);
	for (let y = 0; y <= height; y += 250) {
		await scroller.evaluate((el, top) => el.scrollTo({ top }), y);
		await page.waitForTimeout(160);
	}
	// The watcher re-measures once webfonts land, so a too-early read can miss a mark —
	// `markersSettled` waits for the fonts AND for the re-measure to change nothing, rather
	// than for an interval guessed to cover both (#1526).
	await markersSettled(page, 'iframe.live');

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
			// `chrome` counts PAINTED markers, not marker ELEMENTS. The three tabs are
			// part of every rendered slide now (lib/core/fit-berth.js), so the old
			// element count would report chrome on every tile of a perfectly clean
			// gallery — and this assertion reads "no tile is watched or marked", so it
			// would have failed loudly rather than silently. ./marker-chrome states the
			// property once for the three specs that ask it.
			.evaluate(paintedMarkers)
			.then((m) => (m.slides ? { level: m.level, name: m.name, chrome: m.total } : null))
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

// #1463, the other half — and the one a whole round of review nearly shipped broken.
// Silencing the authoring alarms is right for the GALLERY, whose tiles are catalog samples.
// It is wrong for Present's slide overview, which shows the AUTHOR'S OWN deck: the whole
// point of a grid over your own slides is to spot the one that is clipped. The first cut
// declared the flag inside the shared `SlideThumbFace`, so the overview lost the signal too
// — measured on the real Studio at `rings=1, tabs=1` in the main preview against
// `rings=0, tabs=0` on the same slide's overview tile.
//
// This is the oracle for that. It seeds a deck whose second slide massively overflows, then
// requires the overview's tiles to be watched at the authoring level, so a future change
// that pushes `specimen` back down into the shared face fails here instead of shipping.
test("Present's slide overview keeps the authoring signal — those are the author's own slides", async ({ page }) => {
	test.setTimeout(120_000);
	await gotoStudio(page);

	const overflowing = `---\ntheme: cuoio\n---\n\n<!-- _class: content -->\n\n## Fits\n\n- short\n\n---\n\n<!-- _class: content -->\n\n## Overflows\n\n${Array.from(
		{ length: 60 },
		(_, i) => `- Line ${i} — ${'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(3)}`,
	).join('\n')}\n`;
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.insertText(overflowing);

	// The control: the authoring preview really does mark this deck. Without it, "the overview
	// is watched" could pass on a deck that simply does not overflow.
	//
	// This used to sleep 4s for the preview to re-render the pasted deck and then read the
	// attribute once. The attribute IS the signal, so it is polled instead: a slow re-render
	// no longer reads `null` and fails, and a fast one does not pay four seconds (#1526).
	await expect
		.poll(
			() =>
				page
					.frameLocator('[aria-label="Live deck preview"] iframe.live')
					.locator('section[data-lattice-slide]')
					.first()
					.getAttribute('data-lattice-overflow-marker')
					.catch(() => null),
			{ timeout: 30_000, message: 'the Studio preview must be an authoring surface' },
		)
		.toBe('author');

	await page.getByRole('button', { name: 'Present' }).click();
	// Present has to be up before `g` can open its overview; the dialog is that condition.
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible({ timeout: 30_000 });
	await page.keyboard.press('g');
	const overview = page.getByRole('dialog', { name: 'Slide overview' });
	await overview.waitFor();
	await markersSettled(page, 'iframe.live'); // fonts, then the re-measure settling — see #1526

	const tiles = overview.locator('iframe.live');
	const n = await tiles.count();
	expect(n, 'no overview tile rendered, so nothing was checked').toBeGreaterThan(1);

	const levels: (string | null)[] = [];
	for (let i = 0; i < n; i += 1) {
		const level = await overview
			.frameLocator('iframe.live >> nth=' + i)
			.locator('section[data-lattice-slide]')
			.first()
			.getAttribute('data-lattice-overflow-marker')
			.catch(() => null);
		if (level !== null) levels.push(level);
	}
	expect(levels.length, `only ${levels.length} of ${n} overview tiles could be read`).toBeGreaterThanOrEqual(n - 1);
	expect(
		levels.filter((l) => l !== 'author'),
		`overview tiles silenced at ${levels.filter((l) => l !== 'author').join(', ')} — these are the author's own slides`,
	).toEqual([]);
});
