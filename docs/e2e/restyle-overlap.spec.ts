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
// use (Indaco and Cuoio ship with the engine), and that one file is held back 6 s. Click the slow
// palette, then Cuoio at once: Cuoio is newer and ready first, the slow one arrives later, and without
// the guard it takes the frame back.
//
// The assertion is a comparison, so a green run cannot come from every palette looking alike: the
// accent each palette gives the slide is measured on its own first, the three must differ, and the
// race must end on the NEWEST palette's accent with ONE stylesheet link.

const FRAME = '[aria-label="A slide re-rendered through the selected palette"] iframe.live';
const SLOW_THEME = '**/themes/a11y-achromatopsia.css';
// Long enough that Cuoio, which fetches nothing, lands first even on a loaded runner.
const SLOW_HOLD_MS = 6000;
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
	await expect
		.poll(async () => ((await sheetLinks(page)) === 1 ? await accentInFrame(page) : ''), {
			timeout: 30_000,
			message: `the frame never settled on one sheet with a new accent (was ${from || 'nothing'})`,
		})
		.not.toBe(from);
	return accentInFrame(page);
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
	await race.route(SLOW_THEME, async (route) => {
		await new Promise((r) => setTimeout(r, SLOW_HOLD_MS));
		await route.continue();
	});
	const raceTabs = await open(race);
	await expect.poll(() => accentInFrame(race), { timeout: 30_000 }).toBe(indaco);
	// The signal the late render is waiting on: its held-back theme file finishing.
	const slowLoaded = race.waitForEvent('requestfinished', { predicate: (r) => r.url().includes('a11y-achromatopsia.css'), timeout: 30_000 });
	let slowArrived = false;
	race.on('requestfinished', (r) => {
		if (r.url().includes('a11y-achromatopsia.css')) slowArrived = true;
	});
	await raceTabs.nth(SLOW).click();
	await raceTabs.nth(CUOIO).click();
	await expect(raceTabs.nth(CUOIO)).toHaveAttribute('aria-selected', 'true');

	await expect.poll(() => sheetLinks(race), { timeout: 20_000, message: 'two stylesheets are still attached' }).toBe(1);
	await expect.poll(() => accentInFrame(race), { timeout: 20_000, message: 'the frame did not end on the newest palette' }).toBe(cuoio);
	// The race only happened if the newer render landed BEFORE the older one's file arrived. If a loaded runner
	// made Cuoio slower than the hold, the older render wrote first, Cuoio won on top, and a green run proves
	// nothing about the guard. Say so loudly instead of passing.
	expect(slowArrived, 'race not exercised: the slow palette\'s file arrived before the newer render landed').toBe(false);
	// The slow render can only land once its theme file has arrived. Wait for that, then give the render that
	// follows it (parse, engine, sheet swap) a moment: a stale render taking the frame back would show here.
	await slowLoaded;
	await race.waitForTimeout(1500);
	expect(await accentInFrame(race), 'the slow, older render took the frame back from the newer one').toBe(cuoio);
	expect(await sheetLinks(race), 'the slow, older render left two stylesheets attached').toBe(1);
}

test('an older render that finishes late does not take the frame back from a newer one', async ({ page }) => {
	await run(page);
});

test('@webkit-phone an older render that finishes late does not take the frame back from a newer one', async ({ page }) => {
	await run(page);
});
