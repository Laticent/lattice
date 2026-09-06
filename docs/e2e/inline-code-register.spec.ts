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
