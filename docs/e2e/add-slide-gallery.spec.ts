import { addedNote, CHROME, expect, gotoStudio, openAddSlide, railButtons, slideCount, test } from './studio-fixture';

// The add-slide gallery over the component catalog: open, search, insert → a new
// slide carrying that component's skeleton (rail count +1). The gallery replaced
// the old cmdk text list — tiles are live-preview buttons named "Insert <name>"
// (the tile action names the component; the DOOR says "New slide").

test('inserting a component adds a slide from the catalog', async ({ page }) => {
	await gotoStudio(page);
	const n = await slideCount(page);

	await openAddSlide(page);

	// One door, one name: the launcher says "New slide" and what opens is titled
	// "New slide" too. Asserted HERE, on the real built Studio, and not only in jsdom —
	// the launcher/panel disagreement this fixes is exactly the class of defect a
	// component test can miss because it never renders the shipped chrome together.
	await expect(page.getByRole('dialog', { name: CHROME.addSlideDialog })).toBeVisible();

	const search = page.getByPlaceholder(/Search \d+ slides/);
	await expect(search).toBeVisible();
	await search.fill('divider');

	// Pick the matching tile — each tile is a button labeled "Insert <name> — …".
	await page.getByRole('button', { name: /^Insert divider/i }).first().click();

	await expect(addedNote(page)).toContainText('Added after');
	await expect(railButtons(page)).toHaveCount(n + 1);
});

// A re-ranked result list never shows one component's preview on another's tile (followup 3507-p2). The gallery's
// previews come from a pool of frames that move between tiles; a moved frame used to keep the last tile's picture
// until its patch painted, so `movie` then `science` put the video slide's poster on the `math` tile for a beat.
// The check runs on EVERY animation frame from the second query until every tile has painted, so a single frame of
// the wrong picture fails it. Counted in frames, not milliseconds (HARD RULE #32).
const VIDEO_POSTER = 'Watch the 90-second';
test('a new search never shows the previous result’s preview on a tile @crosswidth @webkit-phone @gecko', async ({ page }) => {
	await gotoStudio(page);
	await openAddSlide(page);
	const search = page.getByPlaceholder(/Search/).filter({ visible: true }).first();
	const shown = () =>
		page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('[data-slide-frame]')]
				.filter((f) => f.parentElement && getComputedStyle(f.parentElement).visibility === 'visible')
				.map((f) => f.querySelector('iframe')?.contentDocument?.body?.innerText ?? ''),
		);
	await search.fill('movie');
	await expect.poll(async () => (await shown()).some((t) => t.includes(VIDEO_POSTER))).toBe(true);

	// Watch every frame: a visible pool frame holding the video slide once `science` is in is the defect.
	await page.evaluate((needle) => {
		const w = window as unknown as { __stale: number; __watch: boolean };
		w.__stale = 0;
		w.__watch = true;
		const tick = () => {
			if (!w.__watch) return;
			// Only once `video` has left the results: before that its poster on its own tile is right.
			const videoListed = [...document.querySelectorAll('button')].some((b) => /^Insert video\b/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
			if (videoListed) {
				requestAnimationFrame(tick);
				return;
			}
			for (const f of document.querySelectorAll<HTMLElement>('[data-slide-frame]')) {
				if (f.parentElement && getComputedStyle(f.parentElement).visibility === 'visible' && (f.querySelector('iframe')?.contentDocument?.body?.innerText ?? '').includes(needle)) w.__stale++;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, VIDEO_POSTER);
	await search.fill('science');
	await expect(page.getByRole('button', { name: /^Insert math/i }).first()).toBeVisible();
	// Settled: three tiles painted, none of them the video slide.
	await expect.poll(async () => (await shown()).filter((t) => t.trim()).length).toBeGreaterThanOrEqual(3);
	const stale = await page.evaluate(() => {
		const w = window as unknown as { __stale: number; __watch: boolean };
		w.__watch = false;
		return w.__stale;
	});
	expect(stale, 'frames in which a visible tile showed the video slide after the search changed').toBe(0);
});
