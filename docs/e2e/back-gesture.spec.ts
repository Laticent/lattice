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

// WAITING FOR THE BACK STACK, not for 650 ms. A drawer registers its level with the back controller
// (docs/src/lib/overlay-back.ts) in a passive effect, after paint: "the drawer is on screen" does not
// mean "a back gesture will pop it", and a `goBack()` sent in between pops the wrong level or leaves
// the Studio. This file used to cover that gap with a fixed 650 ms `settle` at 23 call sites (#1526,
// #1564). The controller now publishes its state on `<html data-overlay-back="depth/owned/pending">`
// plus a generation that ticks on every level added or removed, so each step below waits for exactly
// what it needs: a NEWER generation (Menu → Library is depth 1 → 1, so depth alone would pass on the
// old stack) settled at the depth that step should leave. A door transition and the post-reload
// adopt, the two places #1564 found no signal, both tick the generation.
const overlayGen = async (page: Page) => Number((await page.locator('html').getAttribute('data-overlay-back-gen')) ?? 0);
async function step(page: Page, depth: number, act: () => Promise<unknown>): Promise<void> {
	const before = await overlayGen(page);
	await act();
	await expect
		.poll(
			async () => {
				const [state, gen] = await page.evaluate(() => [document.documentElement.dataset.overlayBack ?? '', Number(document.documentElement.dataset.overlayBackGen ?? 0)] as const);
				return gen > before ? state : `not yet registered (${state})`;
			},
			{ message: `the back stack never settled at depth ${depth}` },
		)
		.toBe(depth ? `${depth}/1/0` : '0/0/0');
}
/** A tap or click whose overlay change `step` waits for. */
const tap = (locator: import('@playwright/test').Locator) => () => locator.click();
const dialog = (page: Page) => page.locator('[role=dialog]');
/** `.last()` — during a hand-off the outgoing drawer and its child are briefly BOTH
 *  mounted, and the topmost is the surface under test. Reading `.first()` here made an
 *  earlier version of this check assert against the drawer that was leaving, and pass
 *  vacuously. */
const title = (page: Page) => dialog(page).last().locator('h2,[data-slot=sheet-title]').first();

/** Ready = the engine has PAINTED a slide — both halves, because waiting only for visibility would
 *  accept an empty frame. Replaces a fixed 1200ms bet, and is strictly stronger than the
 *  `toBeVisible()` it sat behind: the `/studio/` SSR skeleton ships two inert `aria-label="Menu"`
 *  buttons and no live preview at all, so the old gate could satisfy itself against dead markup.
 *
 *  It is a LOCAL copy of the wait, not `waitForStudioPaint` (#1572): these are the WebKit-only
 *  projects, unrunnable in the sandbox that centralized the fixture's version, and a shared helper
 *  should not be introduced here by someone who cannot run the specs it would change. So the second
 *  half still inherits the config's 15s `expect.timeout` where the shared helper no longer does —
 *  pre-existing and logged rather than folded in (HARD RULE #18). */
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
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		await expect(title(page)).toHaveText(MENU);

		await step(page, 2, tap(page.getByRole('button', { name: 'Themes', exact: true })));
		await expect(title(page)).toHaveText('Themes');

		// A door pops to the index — the sheet stays open. This is the step the reverted
		// implementation got wrong: the door never opened at all.
		await step(page, 1, () => page.goBack());
		await expect(title(page)).toHaveText(MENU);

		await step(page, 0, () => page.goBack());
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
			await step(page, 0, () => page.goBack());
			await expect(dialog(page)).toHaveCount(0);
			expect(page.url(), `${opener} left the Studio`).toContain('/studio');
		}
	});

	test('a panel launched from the menu returns to the menu, not to the deck', async ({ page }) => {
		await openStudio(page);
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		await step(page, 1, tap(page.getByRole('button', { name: 'Library', exact: true })));
		await expect(title(page)).toHaveText('Library');
		// The chevron names where it actually goes — and the destination is a property of
		// the LAUNCH PATH, so the same panel names a different one from the bar (below).
		await expect(page.getByRole('button', { name: `Back to ${MENU}` })).toBeVisible();

		await step(page, 1, () => page.goBack());
		await expect(title(page)).toHaveText(MENU);
	});

	test('the same panel launched from the bar points at the deck', async ({ page }) => {
		await openStudio(page);
		await step(page, 1, tap(page.getByRole('button', { name: 'Toggle Coach', exact: true })));
		await expect(page.getByRole('button', { name: `Back to ${HOST}` })).toBeVisible();
	});

	test('dismissing by the chevron leaves NO history residue', async ({ page }) => {
		await openStudio(page);
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		await step(page, 0, tap(page.getByRole('button', { name: `Back to ${HOST}` })));
		await expect(dialog(page)).toHaveCount(0);

		// The entry we pushed has to be spent, or this back would be eaten by a drawer
		// that is no longer on screen (acceptance check 3).
		await page.goBack();
		await expect.poll(() => page.url(), { timeout: 15_000 }).not.toContain('/studio');
	});

	test('dismissing by the scrim leaves NO history residue', async ({ page }) => {
		await openStudio(page);
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		await step(page, 0, () => page.locator('[data-slot=sheet-overlay], .sheet-overlay').first().click({ position: { x: 5, y: 5 }, force: true }));
		await expect(dialog(page)).toHaveCount(0);

		await page.goBack();
		await expect.poll(() => page.url(), { timeout: 15_000 }).not.toContain('/studio');
	});

	test('a reload with a panel open ADOPTS its entry instead of stacking a second one', async ({ page }) => {
		// The document is new after a reload but the entry we pushed survives, marked.
		// Before the module read that marker, the next panel to open pushed a SECOND entry
		// on top of the orphan and every cycle after the reload left one more behind.
		await openStudio(page);
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		const len = await page.evaluate(() => history.length);

		await page.reload({ waitUntil: 'networkidle' });
		// Wait for the island to be LIVE again before asserting nothing reopened — asserting
		// straight after the reload would pass vacuously against a page that has not mounted yet.
		await studioPainted(page);
		await expect(dialog(page)).toHaveCount(0);

		// Re-open, then close: the adopted entry is reused and then spent, so the depth
		// comes back to where it started rather than growing.
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		expect(await page.evaluate(() => history.length)).toBe(len);
		await step(page, 0, tap(page.getByRole('button', { name: `Back to ${HOST}` })));
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
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		await step(page, 1, tap(page.getByRole('button', { name: 'Library', exact: true })));
		await expect(title(page)).toHaveText('Library');

		// The visible deck band above the sheet — where a thumb reaches for "get out".
		await step(page, 0, () => page.mouse.click(196, 25));
		// The regression is the MENU COMING BACK after the child closes, so the pass condition is
		// "and then nothing else happened". The re-open is an effect in StudioShell (`drawerPendingReturn`)
		// that runs in the SAME passive-effect flush as the closing panel's back-stack cleanup, and it
		// opens the menu by setting state. React renders that state on a Scheduler task, posted through
		// a MessageChannel. So once the back stack has settled (the cleanup ran), a message posted now
		// is queued BEHIND that render: when it arrives, a re-opened menu is in the DOM. Two rounds, for
		// a render that yields once. This replaces a 1200 ms wait that sampled once and was calibrated
		// on a build without the bug (#1564's own two limits).
		await page.evaluate(
			() =>
				new Promise<void>((done) => {
					const round = (left: number) => {
						const ch = new MessageChannel();
						ch.port1.onmessage = () => (left > 1 ? round(left - 1) : done());
						ch.port2.postMessage(0);
					};
					round(2);
				}),
		);
		// OPEN dialogs: the Library (and the menu it replaced) are still playing their exit animations
		// here, as `data-state="closed"`; a menu that came back is `data-state="open"`.
		expect(await page.locator('[role=dialog][data-state=open]').count(), 'the menu came back after a tap on the deck').toBe(0);

		// …while back from the same panel still returns to the menu, unchanged.
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		await step(page, 1, tap(page.getByRole('button', { name: 'Library', exact: true })));
		await step(page, 1, () => page.goBack());
		await expect(title(page)).toHaveText(MENU);
	});

	test('the phone header has no Close, and its lone action holds the 44px floor', async ({ page }) => {
		await openStudio(page);
		await step(page, 1, tap(page.getByRole('button', { name: 'Menu' })));
		await step(page, 1, tap(page.getByRole('button', { name: 'Reader views', exact: true })));

		await expect(dialog(page).last().getByRole('button', { name: 'Close' })).toHaveCount(0);
		const add = dialog(page).last().getByRole('button', { name: 'Add a reader view' });
		// Measured at rest: the sheet slides in, and a box read mid-animation came out 43.99997px. Its
		// finite animations finishing is the signal (an infinite one, a spinner, never finishes).
		await dialog(page)
			.last()
			.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY).map((a) => a.finished)));
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
		// The PAGE is what must stay, so compare the path: the Playground rewrites its own query string (?c=…&view=…) on
		// its own schedule, and comparing the whole URL failed 3 of 6 WebKit-phone nightlies when that landed after `start`.
		expect(new URL(page.url()).pathname).toBe(new URL(start).pathname);
	});
});
