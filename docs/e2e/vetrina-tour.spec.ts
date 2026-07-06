import { expect, type Page, test } from '@playwright/test';

// The Vetrina reference tour (docs/src/pages/vetrina-tour.astro) — the buildless,
// non-slide, framework-free exemplar (design doc §15.6). It exercises the one
// cooperative primitive, `awaitUser`, on the REAL browser surface (HARD RULE #23)
// across all three outcomes. The oracles are cause→effect on STATE (the panel's
// data-vt-* attributes the tour itself writes), never wall-clock or pixels — so
// these are deterministic and block per-PR.

const TOUR = '/vetrina-tour/';
const STAGE = '.vetrina-stage';
const PANEL = '#vt-dashboard';

/** Read the panel's live phase / terminal-reason (the tour's own state channel). */
const phase = (page: Page) => page.locator(PANEL).getAttribute('data-vt-phase');
const reason = (page: Page) => page.locator(PANEL).getAttribute('data-vt-reason');

/** Start the tour and wait until it reaches the cooperative hand-off (`awaiting`),
 *  where — and only where — a real interaction is classified rather than an instant
 *  take-over. Interacting earlier would just take over during the scripted beats. */
async function startAndReachHandoff(page: Page): Promise<void> {
	await page.goto(TOUR);
	expect(await phase(page)).toBe('idle');
	await page.locator('#vt-start').click();
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => phase(page), { timeout: 20_000 }).toBe('awaiting');
}

test('correct input — clicking Finish resumes the tour and it completes', async ({ page }) => {
	await startAndReachHandoff(page);

	// The awaited action: click Finish. The classifier matches it → the tour resumes.
	await page.locator('#vt-finish').click();

	// It finishes on its own: the dashboard's real task completes and the stage tears down.
	await expect.poll(() => phase(page)).toBe('done');
	await expect(page.locator(PANEL)).toHaveAttribute('data-vt-done', 'true');
	await expect(page.locator('#vt-finish')).toBeDisabled();
	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect.poll(() => reason(page)).toBe('complete');
});

test('wrong input — any other real interaction hands the wheel back (take-over)', async ({ page }) => {
	await startAndReachHandoff(page);

	// A genuine click that is NOT the awaited Finish. The classifier stays live: a
	// non-match is a legitimate take-over, not a swallowed event.
	await page.locator('#vt-bump').click();

	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect.poll(() => reason(page)).toBe('takeover');
	// The dashboard's own task was NOT completed — the viewer took over before Finish.
	await expect(page.locator(PANEL)).not.toHaveAttribute('data-vt-done', 'true');
});

test('timeout — no interaction within the window ends the tour (exit)', async ({ page }) => {
	// The tour's awaitUser timeout is 8s; give the poll headroom past it.
	test.setTimeout(45_000);
	await startAndReachHandoff(page);

	// Do nothing. The hand-off's timeout fires and ends the run via `exit`.
	await expect.poll(() => reason(page), { timeout: 15_000 }).toBe('exit');
	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect(page.locator(PANEL)).not.toHaveAttribute('data-vt-done', 'true');
});
