import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// #1242 — a tab open across a deploy, or a dropped connection. Superseded build assets are
// deleted (lattice.style is GitHub Pages, which serves only the current deployment), so a
// lazy chunk the tab has never loaded resolves to a 404. The generic card said "Lattice
// Studio hit an unexpected error … Try again" — and a retry cannot work for ANY cause,
// because the module map caches the rejection for the document's lifetime.
//
// Tagged `@webkit-phone` as well as running on desktop: the motivating surface is iOS
// Safari, and playwright.config.ts exists on the premise that a Chromium project cannot
// stand in for engine behavior. WebKit words this failure differently ("Importing a module
// script failed."), so running it there is what makes the matcher's iOS pattern a committed
// fact rather than a literal in a unit test.
//
// The 404 is answered by the browser, on the real built app. What this does NOT reproduce is
// the tab-restore path that CREATES a stale tab — that needs two deploys and a device, and
// stays UNVERIFIED (HARD RULE #23).
test('a lazy chunk that never loads offers a reload that actually reloads (#1242) @webkit-phone', async ({ page }) => {
	await gotoStudio(page);

	// Armed AFTER the initial load, so the shell boots normally and only the on-demand import
	// fails — exactly the real shape.
	await page.route(/\/_astro\/Fabricate\.[^/]*\.js/, (route) => route.fulfill({ status: 404, body: '' }));

	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();

	const alert = page.getByRole('alert');
	await expect(alert).toBeVisible();
	await expect(alert).toContainText(/couldn't load part of the app/i);
	// It must not assert a cause the error cannot establish: a 404, a 403, a 500 and being
	// offline are byte-identical at this layer.
	await expect(alert).not.toContainText(/updated|newer version|shipped/i);
	// Nor read as a crash, nor offer the doomed retry.
	await expect(alert).not.toContainText(/hit an unexpected error/i);
	await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0);

	// The button must NAVIGATE, not just exist. Asserting its presence alone let a swap to the
	// boundary's `reset()` — which re-throws instantly — keep both tiers green.
	const navigated = page.waitForEvent('framenavigated');
	await alert.getByRole('button', { name: 'Reload' }).click();
	await navigated;
	await expect(page.getByRole('button', { name: CHROME.workspaceLauncher })).toBeVisible();
});

// The boundary covers exactly ONE surface: `Fabricate` is the only React.lazy a stale tab can
// reach (the Editor is warmed at hydration). Every other failure of this kind is an
// `await import()` inside an event handler, which never reaches a boundary — it lands in a
// toast that blames the deck. Share is the highest-stakes of those: twelve export rows funnel
// through one catch that used to echo the engine's raw text, hashed asset URL and all.
test('an export whose chunk never loads blames the load, not the deck (#1242)', async ({ page }) => {
	await gotoStudio(page);
	await page.route(/\/_astro\/drawing-board-export\.[^/]*\.js/, (route) => route.fulfill({ status: 404, body: '' }));

	await page.getByRole('button', { name: 'Share' }).click();
	await page.getByRole('button', { name: /Markdown/ }).first().click();

	const toast = page.locator('[data-sonner-toaster]');
	await expect(toast).toContainText(/couldn't load part of the app/i, { timeout: 15_000 });
	// The defect this replaces: the raw engine string, hashed URL and all.
	await expect(toast).not.toContainText(/dynamically imported module|_astro/i);
});
