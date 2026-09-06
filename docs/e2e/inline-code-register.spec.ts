import { appendToEditor, CHROME, expect, gotoStudio, LIVE_PREVIEW, openInspector, persistedSource, test } from './studio-fixture';

// ── The `inline-code:` register, driven from the real Studio ────────────────────────
//
// The register turns the inline directive grammar off for a whole deck — every
// single-backtick span stays literal. It exists because that grammar reads EVERY such
// span in every deck: zero collisions measured in OUR corpus, but a deck written
// elsewhere whose prose says `[x]` or `{LABEL}` renders a disc or a pill where it
// rendered text, and a per-occurrence backslash is absurd at ninety occurrences.
//
// TWO THINGS THIS SPEC ASSERTS THAT A UNIT TEST CANNOT:
//
//  1. THE TOGGLE WRITES THE CANONICAL VALUE. The kernel maps anything that is not
//     exactly `literal` to the RUNNING default — so a control that wrote `off` (the
//     word an author reaches for first, and the name this register carried in its
//     first draft) would be silently inert, and the Inspector would be lying about
//     the switch it just showed you. `unknown-inline-code` warns a human about that
//     mistake; nothing warns the UI.
//  2. THE PREVIEW ACTUALLY OBEYS. The Studio composes engine-rendered HTML with the
//     runtime in one document, so this is the composition the register has to survive
//     — not either half alone.

test('the deck-settings toggle turns the inline grammar off, and the preview obeys', async ({ page }) => {
	await gotoStudio(page);
	// Typed into the REAL editor rather than seeded through localStorage: the Studio keys
	// its draft per deck (`lattice-studio-src-<deckId>`), so there is no fixed key to seed,
	// and typing is the flow an author actually takes anyway.
	await appendToEditor(page, '\n\nProse with `{ALPHA}:c2` and `[x]` and plain `getUserId()`.\n');
	await openInspector(page);
	await page.getByRole('tab', { name: CHROME.deckTab.general }).click();

	const toggle = page.getByRole('switch', { name: 'Inline pills and marks' });
	// ON by default — no register in the deck, and the default has to be the running
	// grammar or every existing deck changes.
	await expect(toggle).toHaveAttribute('aria-checked', 'true');

	// ANTI-VACUITY, before touching anything: the grammar must be RUNNING, or "the pills
	// went away" is trivially true because there were never any.
	const preview = page.frameLocator(LIVE_PREVIEW);
	await expect(preview.locator('.lattice')).toBeVisible({ timeout: 40_000 });
	await expect(preview.locator('.lat-pill')).toHaveCount(1, { timeout: 30_000 });
	await expect(preview.locator('.lat-state')).toHaveCount(1);

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'false');

	// The CANONICAL value, not `off`. This is the assertion the whole spec exists for.
	await expect.poll(() => persistedSource(page)).toContain('inline-code: literal');

	// THE PREVIEW OBEYS — the half a unit test cannot reach. Both drawn objects are gone
	// and every span is back to literal text, in the document where the engine's output
	// and the runtime's mirror are composed together.
	await expect(preview.locator('.lat-pill')).toHaveCount(0, { timeout: 30_000 });
	await expect(preview.locator('.lat-state')).toHaveCount(0);
	expect(await preview.locator('section code').allTextContents()).toEqual(
		expect.arrayContaining(['{ALPHA}:c2', '[x]', 'getUserId()']),
	);

	// And turning it back on REMOVES the key rather than writing `inline-code: rich` —
	// a deck that never opted out should carry no trace of having been toggled.
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => persistedSource(page)).not.toContain('inline-code:');
	// …and the drawn objects come back, so the switch is a switch and not a one-way door.
	await expect(preview.locator('.lat-pill')).toHaveCount(1, { timeout: 30_000 });
	await expect(preview.locator('.lat-state')).toHaveCount(1);
});

// ── The same field, at the two widths that reach it by a DIFFERENT control ──────────
//
// The arm above drives the desktop route, and for a while that was the whole story of
// this field being "verified". It is not: the Studio exposes deck settings through three
// different controls depending on width, and `openInspector` in `studio-fixture.ts` knows
// only the desktop one — so a change that broke the field at 820px or 390px would pass
// every spec in this file.
//
//   1440  the "Deck scope" button in the left rail        (studio-fixture's openInspector)
//    820  "More controls" → "Settings — deck & slide"     (no Deck-scope button exists)
//    390  a first-class "Settings" button in the bottom bar
//
// The control NAMES live in `CHROME.deckSettingsAt` — that map exists so a rename moves
// settings out from under every spec at once, and these are locations like the tabs are.
// The route LOGIC stays here: `openInspector` is used by every Studio spec, and widening
// its one helper to guess a width changes all of them for the benefit of this one.
for (const [label, width, height] of [
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`the deck-settings field is reachable and correct at ${label} (${width}px)`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await gotoStudio(page);

		// ANTI-VACUITY, and it is the point of the arm: prove we are NOT on the desktop
		// route. If the Deck-scope button were present here, this test would be a second
		// copy of the arm above wearing a different viewport, and a break in the tablet or
		// mobile route would still sail past.
		await expect(page.getByRole('button', { name: CHROME.deckScope })).toHaveCount(0);

		if (width > 500) {
			await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
			await page
				.locator('[role=menuitem],[role=menuitemradio],button,[role=button]')
				.filter({ hasText: CHROME.deckSettingsAt.tabletItem })
				.first()
				.click();
		} else {
			// Opening the Menu first would lay an overlay over this button — the bottom bar
			// carries it directly.
			await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
		}

		const tab = page.getByRole('tab', { name: CHROME.deckTab.general });
		if (await tab.count()) await tab.first().click();

		const toggle = page.getByRole('switch', { name: 'Inline pills and marks' });
		await expect(toggle).toBeVisible({ timeout: 15_000 });
		// ON by default here too — a per-width default would be a register that means
		// something different depending on the window you opened it in.
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		// And it WRITES the canonical value from this route as well, which is the whole
		// reason the desktop arm exists. A control wired up per breakpoint could easily
		// write `off` from one of them.
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-checked', 'false');
		await expect.poll(() => persistedSource(page)).toContain('inline-code: literal');
	});
}
