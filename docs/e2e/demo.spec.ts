import { expect, gotoStudio, railButtons, readStorage, test, toastText } from './studio-fixture';

// The self-driving "Watch demo" walkthrough. The demo drives the Studio's own
// setters (not synthetic events), so the oracles are real cause→effect: the stage
// mounts, the board deck it types grows the slide rail, and each of the three exit
// paths (complete · take-over · Exit) tears the stage down — LEAVING BEHIND the real
// "My First Deck" it built (never restoring the viewer's prior deck), and never
// duplicating it across runs.

// The full run is the whole first-time arc (new deck → type → coach → present →
// share → polish → present) at ~85s, so the completion test needs generous headroom.
test.describe.configure({ timeout: 180_000 });

const STAGE = '.vetrina-stage';
const WATCH = 'button[aria-label="Watch demo"]';
const FIRST_DECK = 'My First Deck';

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
/** How many decks titled "My First Deck" are in the persisted index (0 before any run). */
const firstDeckCount = (page: import('@playwright/test').Page) => firstDeckIds(page).then((ids) => ids.length);

test('the demo builds a board deck and completes — leaving "My First Deck" behind', async ({ page }) => {
	await gotoStudio(page);
	expect(await firstDeckCount(page)).toBe(0); // fresh context — no deck yet

	await page.locator(WATCH).click();
	// The stage mounts and the Watch-demo button hides while it runs.
	await expect(page.locator(STAGE)).toBeVisible();
	await expect(page.locator(WATCH)).toHaveCount(0);

	// It drives: the storyboard mints "My First Deck" and types a 6-slide board deck into it.
	await expect.poll(() => railButtons(page).count(), { timeout: 70_000 }).toBe(6);

	// It completes on its own: the stage detaches and the built deck is LEFT BEHIND.
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 120_000 });
	await expect(toastText(page)).toContainText(FIRST_DECK);
	// The newcomer keeps the full board deck (rail stays at 6 — not restored to a prior deck).
	await expect.poll(() => railButtons(page).count()).toBe(6);
	expect(await firstDeckCount(page)).toBe(1); // persisted, single
	await expect(page.locator(WATCH)).toBeVisible();
});

test('the demo drives the REAL settings panel — deck then slide scope, never a modal', async ({ page }) => {
	// Regression guard: the walkthrough used to pop the old per-slide modal drawer
	// (a dimming overlay) to demo settings. It must now drive the SAME non-blocking
	// Inspector an author uses — the docked column (an <aside>), at the right scope.
	await gotoStudio(page);
	await page.locator(WATCH).click();
	await expect(page.locator(STAGE)).toBeVisible();

	// After the deck builds, the reskin beat opens the Inspector at DECK scope — in the
	// docked column, not a dialog. (The blue echo names the scope.)
	await expect.poll(() => railButtons(page).count(), { timeout: 70_000 }).toBe(6);
	await expect(page.locator('aside').filter({ hasText: 'Editing the whole deck' })).toBeVisible({ timeout: 60_000 });

	// The closing flourish switches the SAME panel to SLIDE scope (amber echo).
	await expect(page.locator('aside').filter({ hasText: /Editing Slide \d+ only/ })).toBeVisible({ timeout: 90_000 });

	// The retired modal never appears: no dialog titled "Slide settings" with a slide badge.
	await expect(page.getByRole('dialog').filter({ hasText: 'Slide settings' })).toHaveCount(0);
});

test('re-running the demo never duplicates "My First Deck" (beforeSetup dedup)', async ({ page }) => {
	await gotoStudio(page);

	// First run — stop early via take-over once the deck exists; it's left behind.
	await page.locator(WATCH).click();
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);
	const [id1] = await firstDeckIds(page);
	await page.mouse.click(420, 520);
	await expect(page.locator(STAGE)).toHaveCount(0);
	expect(await firstDeckIds(page)).toEqual([id1]); // the one deck is left behind

	// Second run — the opening beat must DELETE id1 first, then create a fresh deck. We
	// wait for a NEW id to appear (proof `createFirstDeck` ran this run), then assert the
	// count is still exactly one AT THAT MOMENT. If the delete were dropped, run 2 would
	// create a second "My First Deck" and the index would hold BOTH ids — so this poll's
	// `length === 1` guard would never be satisfied and the test fails. That's the point:
	// the oracle can actually observe a dedup regression, which counting leftovers can't.
	await page.locator(WATCH).click();
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

test('a real click mid-demo hands the wheel back, leaving "My First Deck" behind (take over)', async ({ page }) => {
	await gotoStudio(page);
	await page.locator(WATCH).click();
	await expect(page.locator(STAGE)).toBeVisible();
	// Let the opening beat mint the deck before we take over, so we can prove it stays.
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);

	// A genuine click away from the demo chrome = take over. The stage's nodes are
	// pointer-events:none, so this lands on the Studio beneath it.
	await page.mouse.click(420, 520);

	await expect(page.locator(STAGE)).toHaveCount(0);
	// The deck the demo built is the viewer's to edit — left behind, not discarded.
	await expect(toastText(page)).toContainText('yours to edit');
	await expect.poll(() => firstDeckCount(page)).toBe(1);
});

test('pressing Escape hands the wheel back, leaving "My First Deck" behind', async ({ page }) => {
	await gotoStudio(page);
	await page.locator(WATCH).click();
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);

	// Escape is the instinctive "cancel" — it routes through take-over.
	await page.keyboard.press('Escape');

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(toastText(page)).toContainText('yours to edit');
	await expect.poll(() => firstDeckCount(page)).toBe(1);
});

test('the Exit button hands the wheel back, leaving "My First Deck" behind', async ({ page }) => {
	await gotoStudio(page);
	await page.locator(WATCH).click();
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => firstDeckCount(page), { timeout: 70_000 }).toBe(1);

	await page.getByRole('button', { name: 'Exit the demo' }).click();

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(toastText(page)).toContainText('yours to edit');
	await expect.poll(() => firstDeckCount(page)).toBe(1);
});
