import { expect, gotoStudio, railButtons, test, toastText } from './studio-fixture';

// The self-driving "Watch demo" walkthrough. The demo drives the Studio's own
// setters (not synthetic events), so the oracles are real cause→effect: the stage
// mounts, the deck it types grows the slide rail, and each of the three exit paths
// (complete · take-over · Exit) tears the stage down with the right restore.

// The full run types a 6-slide deck and walks the whole toolbar (~20s), so the
// completion test needs headroom over the default per-test timeout.
test.describe.configure({ timeout: 90_000 });

const STAGE = '.studio-demo-stage';
const WATCH = 'button[aria-label="Watch demo"]';

test('the demo drives the Studio, then completes and restores the deck', async ({ page }) => {
	await gotoStudio(page);
	// The seeded welcome deck (7 slides) is the baseline we expect restored.
	const seededCount = await railButtons(page).count();
	expect(seededCount).toBeGreaterThan(0);

	await page.locator(WATCH).click();
	// The stage mounts and the Watch-demo button hides while it runs.
	await expect(page.locator(STAGE)).toBeVisible();
	await expect(page.locator(WATCH)).toHaveCount(0);

	// It drives: the storyboard types a 6-slide board deck onto the canvas.
	await expect.poll(() => railButtons(page).count(), { timeout: 40_000 }).toBe(6);

	// It completes on its own: the stage detaches and the viewer's deck is restored.
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 40_000 });
	await expect(toastText(page)).toContainText('your deck is back');
	await expect.poll(() => railButtons(page).count()).toBe(seededCount);
	await expect(page.locator(WATCH)).toBeVisible();
});

test('a real click mid-demo hands the wheel back (take over)', async ({ page }) => {
	await gotoStudio(page);
	await page.locator(WATCH).click();
	await expect(page.locator(STAGE)).toBeVisible();

	// A genuine click away from the demo chrome = take over. The stage's nodes are
	// pointer-events:none, so this lands on the Studio beneath it.
	await page.mouse.click(420, 520);

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(toastText(page)).toContainText('build away');
});

test('the Exit button stops the demo and restores the deck', async ({ page }) => {
	await gotoStudio(page);
	const seededCount = await railButtons(page).count();
	await page.locator(WATCH).click();
	await expect(page.locator(STAGE)).toBeVisible();

	await page.getByRole('button', { name: 'Exit the demo' }).click();

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(toastText(page)).toContainText('your deck is back');
	await expect.poll(() => railButtons(page).count()).toBe(seededCount);
});
