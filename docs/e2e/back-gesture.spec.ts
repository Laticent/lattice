import { expect, type Page, test } from '@playwright/test';
import { backEntryRegistered, controlReady, currentSlide } from './studio-fixture';

// #1226 — the back gesture must dismiss the top overlay, never leave the Studio.
//
// WHY THIS SPEC EXISTS AT ALL, and why it is the repo's only WebKit project: the first
// implementation of this guard passed review and every Chromium check, and still failed
// on a real iPhone — it owned one history entry per open level and the entries raced.
// It was reverted. History traversal timing is ENGINE behavior, so a Chromium project
// cannot stand in for it, and a verification that lives in a scratch file nobody can
// re-run is not a guard (HARD RULE #23).
//
// `page.goBack()` drives the SAME history navigation the iOS edge-swipe maps onto —
// that navigation is the mechanism under test. The physical gesture is an OS input
// Playwright cannot synthesize, so THAT remains unverified here and is called so.

const MENU = 'Menu';
const HOST = 'Deck';

// ONE declaration, 23 CALL SITES, and they are NOT all the same kind — read this before
// deleting one. #1526's census counts this file as "14 sleeps" because it greps
// `waitForTimeout(`; the honest count of fixed 650ms waits here is 23. The sweep in #1564
// judged the RAW sleeps and this helper's role, not each of the 23 individually. What is
// known about them:
//
//   · LOAD-BEARING — a synchronous `history.length` read follows, with no retry to absorb a
//     slow registration (the reload test), and one site where an ABSENCE is asserted
//     (`Close` must not exist) which no poll can shorten safely.
//   · NO SIGNAL EXISTS — a DOOR transition (Menu → Themes/Library) pushes nothing:
//     `history.length` holds at 3 → 3 and `__latticeOverlayBack` is already `true` from the
//     parent, so `backEntryRegistered` returns instantly there and is not a wait at all. Same
//     for a re-open AFTER RELOAD, where the module ADOPTS the surviving marked entry.
//   · PROBABLY DEAD TIME — the majority. An auto-retrying assertion follows that already
//     polls a real change (`toHaveText`, `toHaveCount`), so the settle adds latency and no
//     power. These have NOT been individually judged and are the remaining work in this file;
//     removing one is safe only where no `goBack()` and no synchronous read follows it.
//
// Where a signal exists and the site was judged, `backEntryRegistered` replaced this.
const settle = (page: Page) => page.waitForTimeout(650);
const dialog = (page: Page) => page.locator('[role=dialog]');
/** `.last()` — during a hand-off the outgoing drawer and its child are briefly BOTH
 *  mounted, and the topmost is the surface under test. Reading `.first()` here made an
 *  earlier version of this check assert against the drawer that was leaving, and pass
 *  vacuously. */
const title = (page: Page) => dialog(page).last().locator('h2,[data-slot=sheet-title]').first();

/** Ready = the engine has PAINTED a slide. Both halves, exactly as `gotoStudio` defines it —
 *  waiting only for visibility would accept an empty frame. Replaces a fixed 1200ms bet, and is
 *  strictly stronger than the `toBeVisible()` it sat behind: the `/studio/` SSR skeleton ships two
 *  inert `aria-label="Menu"` buttons and no live preview at all, so the old gate could satisfy
 *  itself against dead markup. */
async function studioPainted(page: Page) {
	await currentSlide(page).waitFor({ state: 'visible', timeout: 30_000 });
	await expect(currentSlide(page)).not.toBeEmpty();
}

async function openStudio(page: Page) {
	await page.goto('/studio/', { waitUntil: 'networkidle' });
	await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
	await studioPainted(page);
}

test.describe('@webkit-phone the back gesture never leaves the Studio (#1226)', () => {
	test('pops one level at a time: door → index → closed → actually leaves', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		await expect(title(page)).toHaveText(MENU);

		await page.getByRole('button', { name: 'Themes', exact: true }).click();
		await settle(page);
		await expect(title(page)).toHaveText('Themes');

		// A door pops to the index — the sheet stays open. This is the step the reverted
		// implementation got wrong: the door never opened at all.
		await page.goBack();
		await settle(page);
		await expect(title(page)).toHaveText(MENU);

		await page.goBack();
		await settle(page);
		await expect(dialog(page)).toHaveCount(0);
		expect(page.url()).toContain('/studio');

		// Only with nothing open does back mean "leave". The URL is the signal, so poll it
		// rather than betting on an interval — and it still FAILS if we never leave.
		await page.goBack();
		await expect.poll(() => page.url(), { timeout: 15_000 }).not.toContain('/studio');
	});

	test('every drawer opened from the bar closes on back and stays in the Studio', async ({ page }) => {
		await openStudio(page);
		for (const opener of ['Toggle Coach', 'Toggle Chat', 'Settings', 'Share', 'Workspace settings']) {
			await page.getByRole('button', { name: opener, exact: true }).first().click();
			await expect(dialog(page).first()).toBeVisible();
			await backEntryRegistered(page);
			await page.goBack();
			await settle(page);
			await expect(dialog(page)).toHaveCount(0);
			expect(page.url(), `${opener} left the Studio`).toContain('/studio');
		}
	});

	test('a panel launched from the menu returns to the menu, not to the deck', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		await page.getByRole('button', { name: 'Library', exact: true }).click();
		await settle(page);
		await expect(title(page)).toHaveText('Library');
		// The chevron names where it actually goes — and the destination is a property of
		// the LAUNCH PATH, so the same panel names a different one from the bar (below).
		await expect(page.getByRole('button', { name: `Back to ${MENU}` })).toBeVisible();

		await page.goBack();
		await settle(page);
		await expect(title(page)).toHaveText(MENU);
	});

	test('the same panel launched from the bar points at the deck', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'Toggle Coach', exact: true }).click();
		await settle(page);
		await expect(page.getByRole('button', { name: `Back to ${HOST}` })).toBeVisible();
	});

	test('dismissing by the chevron leaves NO history residue', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		await page.getByRole('button', { name: `Back to ${HOST}` }).click();
		await settle(page);
		await expect(dialog(page)).toHaveCount(0);

		// The entry we pushed has to be spent, or this back would be eaten by a drawer
		// that is no longer on screen (acceptance check 3).
		await page.goBack();
		await expect.poll(() => page.url(), { timeout: 15_000 }).not.toContain('/studio');
	});

	test('dismissing by the scrim leaves NO history residue', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		await page.locator('[data-slot=sheet-overlay], .sheet-overlay').first().click({ position: { x: 5, y: 5 }, force: true });
		await settle(page);
		await expect(dialog(page)).toHaveCount(0);

		await page.goBack();
		await expect.poll(() => page.url(), { timeout: 15_000 }).not.toContain('/studio');
	});

	test('a reload with a panel open ADOPTS its entry instead of stacking a second one', async ({ page }) => {
		// The document is new after a reload but the entry we pushed survives, marked.
		// Before the module read that marker, the next panel to open pushed a SECOND entry
		// on top of the orphan and every cycle after the reload left one more behind.
		await openStudio(page);
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		const len = await page.evaluate(() => history.length);

		await page.reload({ waitUntil: 'networkidle' });
		// Wait for the island to be LIVE again before asserting nothing reopened — asserting
		// straight after the reload would pass vacuously against a page that has not mounted yet.
		await studioPainted(page);
		await expect(dialog(page)).toHaveCount(0);

		// Re-open, then close: the adopted entry is reused and then spent, so the depth
		// comes back to where it started rather than growing.
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		expect(await page.evaluate(() => history.length)).toBe(len);
		await page.getByRole('button', { name: `Back to ${HOST}` }).click();
		await settle(page);
		expect(await page.evaluate(() => history.length)).toBe(len);
	});

	test('tapping the DECK leaves — it does not step back to the menu', async ({ page }) => {
		// Reported: open the menu, open Library from it, then tap the deck showing above
		// the sheet to get out — and the MENU came back. The pending re-open did not care
		// how the child closed, so a tap on the deck was served by the same path as
		// "‹ Menu". Two different intents, one close.
		//
		// The distinction that fixes it: back (gesture or chevron) steps back ONE level;
		// the scrim IS the deck, so tapping it lands on the deck.
		await openStudio(page);
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		await page.getByRole('button', { name: 'Library', exact: true }).click();
		await settle(page);
		await expect(title(page)).toHaveText('Library');

		// The visible deck band above the sheet — where a thumb reaches for "get out".
		await page.mouse.click(196, 25);
		// KEPT (#1526). The regression is the MENU COMING BACK after the child closes, so the pass
		// condition is "and then nothing else happened", which a poll for `count === 0` cannot
		// express — it fires at the first zero (~410–460ms sampled here) and never sees a later
		// re-open. So the interval must OUTLAST the window the bug lives in.
		//
		// TWO HONEST LIMITS, since this is the weakest guard in the file:
		//  1. It samples ONCE, at t=1200ms. A re-open at 1250ms, or one that opens and closes
		//     inside the window, still passes. A MutationObserver installed before the tap —
		//     record, dwell, then assert the trace never went back to ≥1 — would be strictly
		//     stronger and is the right fix; it is not done here.
		//  2. The 1200ms is calibrated on a build where the bug does NOT exist, so it says how
		//     long the FIXED app takes to settle, not how wide the bug's window is. Treat it as
		//     a floor that happened to hold, not a measured bound.
		await page.waitForTimeout(1200);
		await expect(dialog(page)).toHaveCount(0);

		// …while back from the same panel still returns to the menu, unchanged.
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		await page.getByRole('button', { name: 'Library', exact: true }).click();
		await settle(page);
		await page.goBack();
		await settle(page);
		await expect(title(page)).toHaveText(MENU);
	});

	test('the phone header has no Close, and its lone action holds the 44px floor', async ({ page }) => {
		await openStudio(page);
		await page.getByRole('button', { name: 'Menu' }).click();
		await settle(page);
		await page.getByRole('button', { name: 'Reader views', exact: true }).click();
		await settle(page);

		await expect(dialog(page).last().getByRole('button', { name: 'Close' })).toHaveCount(0);
		const add = dialog(page).last().getByRole('button', { name: 'Add a reader view' });
		const box = await add.boundingBox();
		expect(box?.width, 'action width').toBeGreaterThanOrEqual(44);
		expect(box?.height, 'action height').toBeGreaterThanOrEqual(44);
	});
});

// The same guard, OFF the Studio. Split into its own describe because the surfaces have
// nothing in common with the Studio's drawers except the mechanism.
//
// WHY THESE EXIST: `FeedbackSheet` is a `PanelSheet`, so it registered from the day the
// guard landed — while the raw `Sheet`s around it did not. Back therefore closed the
// feedback sheet but LEFT THE SITE from the nav sheet underneath it: a mixed stack, which
// is worse than either rule applied evenly. Found by the independent checker on #1229.
test.describe('@webkit-phone back closes off-Studio sheets too', () => {
	test('the site nav sheet closes on back and stays on the page', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' });
		const nav = page.getByRole('button', { name: /menu/i }).first();
		await controlReady(nav);
		const start = page.url();

		await nav.click();
		// `toHaveCount(1)` is itself the bounded poll for "the sheet opened".
		await expect(page.locator('[role=dialog]')).toHaveCount(1);
		await backEntryRegistered(page);

		await page.goBack();
		await expect(page.locator('[role=dialog]')).toHaveCount(0);
		expect(page.url(), 'back left the site instead of closing the nav').toBe(start);

		// And with it closed, back means what it always did.
		await page.goBack();
		await expect.poll(() => page.url(), { timeout: 15_000 }).not.toBe(start);
	});

	test('the site SEARCH dialog closes on back too — same header, same rule', async ({ page }) => {
		// The one the first pass missed. It sits in the same header as the nav sheet, so
		// "tap Menu, back closes it; tap Search, back leaves the site" was a mixed rule in a
		// single row of chrome. It is a `CommandDialog` rather than a `Sheet`, which is
		// exactly why it did not look like the others.
		await page.goto('/', { waitUntil: 'networkidle' });
		const search = page.getByRole('button', { name: /search/i }).first();
		await controlReady(search);
		const start = page.url();

		await search.click();
		await expect(page.locator('[role=dialog]')).toHaveCount(1);
		await backEntryRegistered(page);

		await page.goBack();
		await expect(page.locator('[role=dialog]')).toHaveCount(0);
		expect(page.url(), 'back left the site instead of closing search').toBe(start);
	});

	test("the Playground's Galleries sheet closes on back and stays on the page", async ({ page }) => {
		await page.goto('/playground/', { waitUntil: 'networkidle' });
		const galleries = page.getByRole('button', { name: 'Galleries', exact: true }).first();
		await controlReady(galleries);
		const start = page.url();

		await galleries.click();
		await expect(page.locator('[role=dialog]')).toHaveCount(1);
		await backEntryRegistered(page);

		await page.goBack();
		await expect(page.locator('[role=dialog]')).toHaveCount(0);
		expect(page.url()).toBe(start);
	});
});
