import { expect, type Page, test } from '@playwright/test';

// TWO OVERLAPPING RENDERS ON ONE REAL FRAME (#2916).
//
// The Studio's preview queues its renders, so two never overlap there. The landing page's palette
// picker does not: a second click starts a render while the first is still busy. The frame's rule is
// that the NEWEST render that asks for a sheet or writes a slide owns the frame, so an older render
// that finishes late stands down instead of swapping the sheet out from under a newer one (the swap
// would drop the newer render's link, which then never loads, and the slide would write under the
// wrong palette). A jsdom test pins that with the frame's `load` fired by hand; this drives it in a
// real browser, where the sheet really loads.
//
// TWO CLICKS IN A ROW DO NOT MAKE THE RACE. A control run with the guard removed passed this test
// three times when the two palettes were equally quick: the older render simply finished first. So the
// older render is made SLOW on purpose. The colour-blind-safe palette fetches its theme file on first
// use (Indaco and Cuoio ship with the engine), and that one file is HELD until the newer render has
// landed: click the slow palette, then Cuoio at once, wait for the frame to show Cuoio, and only then let
// the slow file through. Without the guard the slow render then takes the frame back. The hold used to be
// a fixed 6 s, which made the order likely rather than certain (a loaded runner could take longer than
// that to render Cuoio) and cost every run six seconds; the release on a signal makes it certain.
//
// The assertion is a comparison, so a green run cannot come from every palette looking alike: the
// accent each palette gives the slide is measured on its own first, the three must differ, and the
// race must end on the NEWEST palette's accent with ONE stylesheet link.

const FRAME = '[aria-label="A slide re-rendered through the selected palette"] iframe.live';
const SLOW_THEME = '**/themes/a11y-achromatopsia.css';
const INDACO = 0;
const CUOIO = 1;
const SLOW = 2;

async function accentInFrame(page: Page): Promise<string> {
	return page.evaluate((sel) => {
		const doc = (document.querySelector(sel) as HTMLIFrameElement | null)?.contentDocument;
		const section = doc?.querySelector('.lattice section') as HTMLElement | null;
		if (!doc || !section) return '';
		return getComputedStyle(section).getPropertyValue('--accent').trim();
	}, FRAME);
}

async function sheetLinks(page: Page): Promise<number> {
	return page.evaluate((sel) => {
		const doc = (document.querySelector(sel) as HTMLIFrameElement | null)?.contentDocument;
		return doc ? doc.querySelectorAll('link[rel=stylesheet]').length : -1;
	}, FRAME);
}

async function open(page: Page) {
	// The carousel auto-advances every 2.6 s unless the visitor prefers reduced motion; a test that
	// clicks palettes by hand must not have a timer clicking them too.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	const tabs = page.getByRole('tablist', { name: 'Choose a palette' }).getByRole('tab');
	await tabs.first().scrollIntoViewIfNeeded();
	await expect(page.locator(FRAME)).toBeVisible({ timeout: 30_000 });
	expect(await tabs.count(), 'the picker needs three palettes').toBeGreaterThanOrEqual(3);
	return tabs;
}

/** Click a palette and wait until the frame shows IT: the accent has left `from`, and one sheet is attached. */
async function settle(page: Page, tabs: ReturnType<Page['getByRole']>, tab: number, from = '') {
	await tabs.nth(tab).click();
	await expect(tabs.nth(tab)).toHaveAttribute('aria-selected', 'true');
	// The accent is kept FROM the poll, and only once it is a real one. The poll used to return '' while two sheets
	// were attached (a swap in flight), which passed `not.toBe(from)`; the read after it then caught the frame
	// mid-swap, still on the old palette, and two palettes "looked alike" (7 of 48 loaded runs once a palette change
	// waits for a loading document and restyles it, single-slide-render.ts; 1 of 48 before).
	let accent = '';
	await expect
		.poll(
			async () => {
				accent = (await sheetLinks(page)) === 1 ? await accentInFrame(page) : '';
				return accent !== '' && accent !== from;
			},
			{ timeout: 30_000, message: `the frame never settled on one sheet with a new accent (was ${from || 'nothing'})` },
		)
		.toBe(true);
	return accent;
}

async function run(page: Page) {
	// The reference: what each palette gives the slide when it is the only render.
	const tabs = await open(page);
	const indaco = await settle(page, tabs, INDACO);
	const cuoio = await settle(page, tabs, CUOIO, indaco);
	const slow = await settle(page, tabs, SLOW, cuoio);
	expect(new Set([indaco, cuoio, slow]).size, `the three palettes must look different to tell them apart (${indaco} ${cuoio} ${slow})`).toBe(3);

	// The race, on a fresh page (nothing cached) with the slow palette's theme file held back.
	const race = await page.context().newPage();
	let release = () => {};
	const held = new Promise<void>((done) => {
		release = done;
	});
	await race.route(SLOW_THEME, async (route) => {
		await held;
		await route.continue();
	});
	const raceTabs = await open(race);
	await expect.poll(() => accentInFrame(race), { timeout: 30_000 }).toBe(indaco);
	// The signal the late render is waiting on: its held-back theme file finishing.
	const slowLoaded = race.waitForEvent('requestfinished', { predicate: (r) => r.url().includes('a11y-achromatopsia.css'), timeout: 30_000 });
	await raceTabs.nth(SLOW).click();
	await raceTabs.nth(CUOIO).click();
	await expect(raceTabs.nth(CUOIO)).toHaveAttribute('aria-selected', 'true');

	// The newer render lands while the older one is still waiting on its file: the race, by construction.
	await expect.poll(() => sheetLinks(race), { timeout: 20_000, message: 'two stylesheets are still attached' }).toBe(1);
	await expect.poll(() => accentInFrame(race), { timeout: 20_000, message: 'the frame did not end on the newest palette' }).toBe(cuoio);
	// Now the older render's file arrives. It can only land once that file has finished; then the render that follows it
	// (parse, engine, sheet swap) runs to its end, and the stage counts it out (RestyleShowcase.tsx `rendersPending`). A
	// stale render taking the frame back would show once that count is zero. It used to be a 1500 ms wait.
	release();
	await slowLoaded;
	await expect(race.locator('[aria-label="A slide re-rendered through the selected palette"]')).toHaveAttribute('data-renders-pending', '0', { timeout: 30_000 });
	expect(await accentInFrame(race), 'the slow, older render took the frame back from the newer one').toBe(cuoio);
	expect(await sheetLinks(race), 'the slow, older render left two stylesheets attached').toBe(1);
}

test('an older render that finishes late does not take the frame back from a newer one', async ({ page }) => {
	await run(page);
});

test('@webkit-phone an older render that finishes late does not take the frame back from a newer one', async ({ page }) => {
	await run(page);
});
