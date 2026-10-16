import { expect, gotoStudio, railButtons, readStorage, test, toastText } from './studio-fixture';

// The "Show Me" tour. One tour remains — `first-look`, the showcase; the other four became Studio
// lessons (lessons.spec.ts, engineering/decisions/2026-10-05-studio-lessons.md). It drives the
// Studio's own setters (not synthetic
// events), so the oracles are real cause→effect: the menu lists every tour, launching one mounts
// the stage and builds a real deck, and each exit path (complete · take-over · Escape · Exit)
// tears the stage down — LEAVING BEHIND the real "My First Deck" it built, never restoring the
// viewer's prior deck, never duplicating it across runs. `first-look` types three slides:
// title · big-number · radar.

test.describe.configure({ timeout: 180_000 });

const STAGE = '.vetrina-stage';
const SHOW_ME = 'button[data-demo="show-me"]';
const FIRST_DECK = 'My First Deck';

/** Open the Show Me menu and launch a tour by id. */
async function startTour(page: import('@playwright/test').Page, tourId = 'first-look'): Promise<void> {
	await page.locator(SHOW_ME).click();
	await page.locator(`[data-tour="${tourId}"]`).first().click();
}

/** The ids of every deck titled "My First Deck" in the persisted index (empty before any run). */
async function firstDeckIds(page: import('@playwright/test').Page): Promise<string[]> {
	const raw = await readStorage(page, 'lattice-studio-deck-index');
	if (!raw) return [];
	try {
		return (JSON.parse(raw) as { id: string; title?: string }[]).filter((d) => d.title === FIRST_DECK).map((d) => d.id);
	} catch {
		return [];
	}
}
const firstDeckCount = (page: import('@playwright/test').Page) => firstDeckIds(page).then((ids) => ids.length);

test('@smoke the Show Me menu lists the tour, and it builds a deck and completes', async ({ page }) => {
	await gotoStudio(page);
	expect(await firstDeckCount(page)).toBe(0); // fresh context — no deck yet

	// The menu offers the tour.
	await page.locator(SHOW_ME).click();
	await expect(page.locator('[data-tour]')).toHaveCount(1);
	await expect(page.locator('[data-tour="first-look"]')).toBeVisible();

	// Launch it. The stage mounts and the Show Me trigger hides while it runs
	// (rendered `invisible`, so it stays in the DOM — assert hidden, not removed).
	await page.locator('[data-tour="first-look"]').click();
	await expect(page.locator(STAGE)).toBeVisible();
	await expect(page.locator(SHOW_ME)).toBeHidden();

	// It drives: mints "My First Deck" and types the three-slide deck into it.
	await expect.poll(() => railButtons(page).count(), { timeout: 90_000 }).toBe(3);

	// It completes on its own: the stage detaches and the built deck is LEFT BEHIND.
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 130_000 });
	// The completion toast NAMES NO DECK: a deck is titled by its first heading now, so by
	// the time the tour finishes this deck is called whatever the tour typed, not
	// "My First Deck". Its stable creation LABEL is still that, which is what
	// firstDeckCount below asserts on.
	await expect(toastText(page)).toContainText('yours to edit');
	await expect.poll(() => railButtons(page).count()).toBe(3);
	expect(await firstDeckCount(page)).toBe(1); // persisted, single
	await expect(page.locator(SHOW_ME)).toBeVisible();
});

// The reskin beat and the four-tour smoke loop left with the tours they tested. Changing the theme
// is now a lesson, and lessons.spec.ts drives it on the real Studio.

test('re-running a tour never duplicates "My First Deck" (beforeSetup dedup)', async ({ page }) => {
	await gotoStudio(page);

	// First run — stop early via take-over once the deck exists; it's left behind.
	await startTour(page);
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);
	const [id1] = await firstDeckIds(page);
	await page.mouse.click(420, 520);
	await expect(page.locator(STAGE)).toHaveCount(0);
	expect(await firstDeckIds(page)).toEqual([id1]); // the one deck is left behind

	// Second run — the opening beat must DELETE id1 first, then create a fresh deck. Wait for a
	// NEW id (proof `createFirstDeck` ran), then assert the count is still exactly one AT THAT
	// MOMENT. If the delete were dropped, run 2 would create a second "My First Deck" and the
	// index would hold BOTH ids — so this `length === 1` guard would never be satisfied.
	await startTour(page);
	await expect(page.locator(STAGE)).toBeVisible();
	await expect
		.poll(async () => {
			const ids = await firstDeckIds(page);
			return ids.length === 1 && ids[0] !== id1; // deleted+recreated, never doubled
		}, { timeout: 70_000 })
		.toBe(true);
	await page.mouse.click(420, 520);
	await expect(page.locator(STAGE)).toHaveCount(0);
	expect(await firstDeckCount(page)).toBe(1); // still exactly one after the whole cycle
});

test('a real click mid-tour hands the wheel back, leaving "My First Deck" behind (take over)', async ({ page }) => {
	await gotoStudio(page);
	await startTour(page);
	await expect(page.locator(STAGE)).toBeVisible();
	// Let the opening beat mint the deck before we take over, so we can prove it stays.
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);

	// A genuine click away from the demo chrome = take over. The stage's nodes are
	// pointer-events:none, so this lands on the Studio beneath it.
	await page.mouse.click(420, 520);

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(toastText(page)).toContainText('yours to edit');
	await expect.poll(() => firstDeckCount(page)).toBe(1);
});

test('pressing Escape hands the wheel back, leaving "My First Deck" behind', async ({ page }) => {
	await gotoStudio(page);
	await startTour(page);
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);

	await page.keyboard.press('Escape');

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(toastText(page)).toContainText('yours to edit');
	await expect.poll(() => firstDeckCount(page)).toBe(1);
});

test('the Exit button hands the wheel back, leaving "My First Deck" behind', async ({ page }) => {
	await gotoStudio(page);
	await startTour(page);
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);

	// The demo stage is aria-hidden (decorative auto-play; Escape is the a11y exit),
	// so the on-screen Exit button is reached with includeHidden.
	await page.getByRole('button', { name: 'Exit the demo', includeHidden: true }).click();

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(toastText(page)).toContainText('yours to edit');
	await expect.poll(() => firstDeckCount(page)).toBe(1);
});
