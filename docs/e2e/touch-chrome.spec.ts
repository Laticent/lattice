import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// A control's label is not prose (#1216). Reported from a real iPhone: press-and-hold a
// Studio drawer row and iOS selects the word and raises the Copy / Look Up callout
// instead of the row reading as pressed.
//
// This runs on the `webkit-phone` project for the reason that project exists
// (playwright.config.ts): a "verified on iPhone 15 Pro" claim must not live only in a
// scratch file nobody can re-run. The unit tier asserts the CSS rule's TEXT; this asserts
// the COMPUTED property and the observable outcome on the real built surface.
//
// It does NOT close the report — Playwright's WebKit has no long-press callout UI, and
// `-webkit-touch-callout` is an iOS-only property this build does not implement. What is
// measured here is `user-select`, which is the mechanism that produced the reported
// selection.
test('@webkit-phone a long press on a drawer row cannot select its label (#1216)', async ({ page }) => {
	// Through the fixture, not a hand-rolled goto: `gotoStudio` owns the ready signal, and
	// the drawer opens via the CHROME map — the documented list a chrome rename must
	// reconcile (studio-fixture.ts). A hardcoded 'Menu' here is exactly the drift that
	// broke 19 nightly specs in #780.
	await gotoStudio(page);
	await page.getByRole('button', { name: CHROME.moreControls }).click();

	const row = page.locator('[data-slot="sheet-content"] button').filter({ hasText: 'Library' }).first();
	await expect(row).toBeVisible();
	await expect(row).toHaveCSS('-webkit-user-select', 'none');

	// The outcome, not just the declaration: a range over the row yields no text.
	const selected = await page.evaluate(() => {
		const el = [...document.querySelectorAll('[data-slot="sheet-content"] button')].find((b) => /library/i.test(b.textContent || ''));
		if (!el) return null;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const r = document.createRange();
		r.selectNodeContents(el);
		sel?.addRange(r);
		const text = (sel?.toString() || '').trim();
		sel?.removeAllRanges();
		return text;
	});
	expect(selected).toBe('');

	// The other half of the invariant: prose in the SAME sheet still selects, so the rule
	// never grew into the subtree. Asserted as "not none" and scoped to the open sheet —
	// the initial computed value is engine-specific (`text` in WebKit, `auto` in Chromium),
	// so an equality check would fail for the wrong reason if this ever runs on another
	// project, and an unscoped selector could match a hidden dialog's <h2> and pass
	// vacuously.
	const heading = await page.evaluate(() => {
		const sheet = document.querySelector('[data-slot="sheet-content"]');
		const h = sheet?.querySelector('[data-slot="sheet-title"], h2');
		return h ? { found: true, userSelect: getComputedStyle(h).webkitUserSelect } : { found: false, userSelect: null };
	});
	expect(heading.found).toBe(true);
	expect(heading.userSelect).not.toBe('none');
});
