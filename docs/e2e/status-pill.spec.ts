import { expect, gotoStudio, test } from './studio-fixture';

// ONE status pill, not a pile.
//
// Every transient confirmation in the Studio used to mint its own toast, and the
// Toaster showed three at once, so anything that spoke twice inside the 2600ms
// dwell stacked. Status messages now share a single Sonner id and rewrite one
// pill in place (`src/lib/status-pill.ts`).
//
// This runs on the real Studio because the mechanism is Sonner's own store plus
// its rendered stack — a unit test can only see the options object we hand over,
// which is what `status-pill.test.ts` pins. It cannot see how many `<li>` land.

/** The toast elements themselves — NOT the `[data-sonner-toaster]` container the
 *  fixture's `appToast` returns. This spec counts pills, so it needs the items. */
function pills(page: import('@playwright/test').Page) {
	return page.locator('[data-sonner-toast]');
}

function deckSwitcher(page: import('@playwright/test').Page) {
	return page.locator('header').getByRole('button', { name: /slides?$/ }).first();
}

test('three confirmations inside one dwell leave a single pill', async ({ page }) => {
	await gotoStudio(page);

	// "New deck" raises a confirmation on every click. Three of them, back to back
	// through the real menu — the exact shape that used to stack.
	const started = Date.now();
	for (let i = 0; i < 3; i++) {
		await deckSwitcher(page).click();
		await page.getByRole('menuitem', { name: 'New deck' }).click();
	}
	const elapsed = Date.now() - started;

	// The assertion below is only meaningful while all three messages are still
	// within the 2600ms dwell — past it they would have expired on their own and a
	// count of 1 would prove nothing. So the window is asserted, not assumed: a box
	// too slow to land three clicks in time fails here and says why, rather than
	// passing for the wrong reason.
	expect(elapsed, 'three confirmations must land inside the pill dwell').toBeLessThan(2600);

	// Wait for the pill to RENDER, then count in one shot. A retrying `toHaveCount`
	// would keep polling while the stack drained and report the count it settled on
	// (0, once everything expired) rather than the pile-up it was raised to catch —
	// measured: this spec reported "Received: 0" against a build without the shared
	// id, where the number that matters is 3.
	await expect(pills(page).first()).toBeVisible();
	expect(await pills(page).count(), 'status messages must share one pill').toBe(1);
	await expect(pills(page).first()).toContainText('New deck created');
});
