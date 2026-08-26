import fs from 'node:fs';
import { expect, gotoStudio, test } from './studio-fixture';

// Fabricate — the Theme / Component studio. Deterministic surfaces: the derived
// contract + palette audit recompute from the theme colors, the light/dark specimen
// toggles, and the Component tab's gate reports palette-blind/scoped status.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await expect(page.getByRole('button', { name: 'Back to Compose' })).toBeVisible();
});

test('fabricate opens on the Theme tab with the derived contract and palette audit', async ({ page }) => {
	await expect(page.getByRole('textbox', { name: 'Theme name' })).toBeVisible();
	await expect(page.getByText(/Contract . \d+ roles/)).toBeVisible();
	await expect(page.getByText(/Palette audit/)).toBeVisible();
});

test('the theme specimen toggles between light and dark', async ({ page }) => {
	const light = page.getByRole('button', { name: 'Light specimen' });
	const dark = page.getByRole('button', { name: 'Dark specimen' });
	await dark.click();
	await expect(dark).toHaveAttribute('aria-pressed', 'true');
	await light.click();
	await expect(light).toHaveAttribute('aria-pressed', 'true');
});

test('the Component tab reports a palette-blind / scoped gate', async ({ page }) => {
	await page.getByRole('button', { name: 'Component', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Component name' })).toBeVisible();
	// The default component is clean → the gate reports it ready.
	await expect(page.getByText(/Palette-blind and scoped|ready to save/)).toBeVisible();
});

test('the Finish designer: spotlight reveals a joystick-placed window, mutually exclusive with clearance', async ({ page }) => {
	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	const clearance = page.getByRole('checkbox', { name: 'Clear behind content' });
	const spotlight = page.getByRole('checkbox', { name: 'Spotlight one area' });
	await expect(clearance).toBeVisible();
	await expect(spotlight).toBeVisible();
	// Enabling clearance then spotlight: spotlight wins, clearance turns off (one mask).
	await clearance.check();
	await expect(clearance).toBeChecked();
	await spotlight.check();
	await expect(clearance).not.toBeChecked();
	// The joystick + radius controls appear for placing the window.
	await expect(page.getByLabel('Move spotlight')).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Radius' })).toBeVisible();
	// Re-enabling clearance clears spotlight (and hides its controls).
	await clearance.check();
	await expect(spotlight).not.toBeChecked();
	await expect(page.getByLabel('Move spotlight')).toHaveCount(0);
});

test('returning to Compose restores the editor', async ({ page }) => {
	await page.getByRole('button', { name: 'Back to Compose' }).click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
});

/**
 * THE SEPARATION ROW, on the real panel (HARD RULE #23).
 *
 * `lib/theme/contrast.js` grew a second predicate — an OKLab distance between two
 * INKS rather than a WCAG ratio against a canvas — because `checkMutedTierFloors`
 * measures that only over `themes/`, and a theme fabricated here never joins that
 * population. The unit tests prove the predicate; only this proves the AUTHOR sees
 * it, which is the whole point of the change (#1715 §9).
 *
 * The two inks below put a body already at its AA ceiling on the Dusk canvas next to
 * a muted far too pale to keep: the derivation repairs muted UP to AA and lands it on
 * body. Before this change the panel read six green rows and an all-clear badge on
 * exactly this palette.
 */
test('a collapsed muted tier shows a failing separation row with its dE', async ({ page }) => {
	const panel = page.getByText('Palette audit').locator('xpath=ancestor::div[1]/..');
	// Six green contrast rows to begin with — a PASSING separation row is correctly
	// evicted by the cap, which is why only a failure has to surface.
	await expect(panel.getByText('AA + tiers')).toBeVisible();
	await expect(panel.getByText('Muted-separation')).toHaveCount(0);

	// Edit each essential the way an author does: pick the role in the token tree,
	// then set its color in the inspector.
	//
	// The ESSENTIALS group, not the CONTRACT one — the tree carries both and they read
	// almost the same ("Body ink" vs "Body"). Overriding the contract token directly
	// would set `--text-muted` by hand and prove nothing: the collapse under test is
	// the one the DERIVATION manufactures when it repairs a too-pale muted up to AA
	// against a body already sitting at its ceiling.
	for (const [role, hex] of [['Body ink', '#767676'], ['Muted ink', '#dddddd']] as const) {
		await page.getByRole('button', { name: role, exact: true }).click();
		await expect(page.getByText('Picked color')).toBeVisible();
		await page.locator('input[type="color"]').first().fill(hex);
	}

	// The row appears, reads FAIL, and reports a DISTANCE — never a fabricated ratio
	// and never a WCAG tier badge, because WCAG does not define this measurement.
	const row = panel.getByText('Muted-separation').locator('..');
	await expect(row).toBeVisible();
	await expect(row).toContainText(/\u0394E 0\.0\d\d/);
	await expect(row).toContainText('FAIL');
	await expect(row).not.toContainText(': 1');
	// …and it drags the aggregate verdict down, so the badge and the rows agree.
	await expect(panel.getByText('review')).toBeVisible();
	await expect(panel.getByText('AA + tiers')).toHaveCount(0);
});

/**
 * THE HAND-EDIT ROUND TRIP, on the real surface (HARD RULE #23).
 *
 * The product claim of the CSS view is one sentence: open a saved theme's CSS, edit
 * one token, save, reopen — the edit survives and every other byte of the file is
 * unchanged. Nothing short of the real browser can carry it. Under jsdom `CodeField`
 * renders a `<textarea>` fallback (`CodeField.tsx:50`), so a unit test proves the
 * state wiring and not the editor; and the round trip runs through IndexedDB, the
 * theme registry and a real CodeMirror, none of which jsdom has.
 *
 * IT COMPARES EXPORTED BYTES, NOT EDITOR TEXT, and that is deliberate twice over.
 * CodeMirror's content is a contenteditable — `inputValue()` throws on it, and
 * reading `.cm-line` back would be reading the editor's own rendering of the thing
 * under test. The export is the artifact a human actually receives, so comparing two
 * downloads asks the question the claim is about: is the file the same file.
 */
async function exportedCss(page: import('@playwright/test').Page): Promise<string> {
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Export' }).click(),
	]);
	return fs.readFileSync(await download.path(), 'utf8');
}

test('a hand-edited theme survives save → reopen, byte-identical apart from the edit', async ({ page }) => {
	await page.getByRole('textbox', { name: 'Theme name' }).fill('handedit');

	// 1. The generated baseline, as a file.
	const generated = await exportedCss(page);
	expect(generated).toMatch(/@theme\s+handedit\b/);

	// 2. Edit it the way the pickers never could: a comment, and a token OUTSIDE the
	//    107-name contract. A save that re-serialized from the token map would drop
	//    both — the exact data loss `lib/theme/parse.js` exists to prevent.
	const edited = `${generated.replace(/--accent:\s*[^;]+;/, '--accent: #4b2fd6;')}\n/* hand-written note */\n:root { --brand-bright: #4b2fd6; }\n`;
	await page.getByRole('button', { name: 'CSS', exact: true }).click();
	const cssBox = page.locator('.cm-content[aria-label="Theme CSS"]');
	await expect(cssBox).toBeVisible();
	await cssBox.fill(edited);
	await expect(page.getByText('Hand-edited')).toBeVisible();

	// 3. Save the record, leave, and come back in through the Library — the only
	//    path back into a saved theme.
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved/)).toBeVisible();
	await page.getByRole('button', { name: 'Back to Compose' }).click();
	// The desktop shell docks the Library behind "Open Library"; the compact shells
	// put it in a sheet. Accept either, so this test is not silently desktop-only.
	const openLibrary = page.getByRole('button', { name: 'Open Library' });
	await (await openLibrary.count() ? openLibrary : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.getByRole('button', { name: 'Edit Handedit' }).click();
	await expect(page.locator('.cm-content[aria-label="Theme CSS"]')).toBeVisible();

	// 4. THE CLAIM, as bytes.
	const reopened = await exportedCss(page);
	expect(reopened).toContain('--accent: #4b2fd6;');
	expect(reopened).toContain('/* hand-written note */');
	expect(reopened).toContain('--brand-bright: #4b2fd6;');
	expect(reopened).toEqual(edited);
});

/**
 * THE BLOCKING RUNG, on the real preview frame. `lib/theme/gate.js` separates `ok`
 * from `blocked` so a theme that merely fails the contract stays visible while a
 * theme that reaches OFF THE DEVICE is paused out of a same-origin frame holding the
 * user's OpenRouter key (HARD RULE #24). The unit tests prove the verdict; this
 * proves the real author sees the reason and can recover from it.
 */
test('CSS that reaches off the device is paused out of the preview, with a reason', async ({ page }) => {
	const clean = await exportedCss(page);
	await page.getByRole('button', { name: 'CSS', exact: true }).click();
	const cssBox = page.locator('.cm-content[aria-label="Theme CSS"]');
	await expect(cssBox).toBeVisible();
	await expect(page.getByText('Gate clean')).toBeVisible();

	await cssBox.fill(`${clean}\n:root { --leak: url(https://evil.example/?beacon); }\n`);
	await expect(page.getByText(/The preview is paused/)).toBeVisible();
	await expect(page.getByText(/fetches a remote resource/)).toBeVisible();

	// …and it is recoverable. A gate you cannot get out of is one authors learn to
	// route around.
	await cssBox.fill(clean);
	await expect(page.getByText(/The preview is paused/)).toHaveCount(0);
	await expect(page.getByText('Gate clean')).toBeVisible();
});

/**
 * Click Save and wait for the confirmation.
 *
 * `.first()` because these specs save more than once and the toasts STACK — the
 * second save leaves two "Saved …" nodes on screen, and a bare `getByText(/Saved/)`
 * is then a strict-mode violation rather than a failed assertion. Only the presence
 * of a confirmation is being asserted, so the first one is the right one to read.
 */
async function saveAsset(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved/).first()).toBeVisible();
}

/**
 * VERSION HISTORY, on the real surface (HARD RULE #23).
 *
 * #1873 shipped the in-place overwrite — a Library "Edit" button and an id-pinned
 * Save — while `library/asset-history.js` sat at ZERO production callers, though its
 * own docblock says history "is what makes that overwrite safe to offer at all".
 * Every guard that change added is about not REACHING the overwrite; this is the one
 * that survives reaching it, so the claim it has to carry is bytes: the stylesheet
 * you had before the edit comes BACK, exactly.
 *
 * Nothing short of the real browser reaches it. The snapshot lives in IndexedDB,
 * which jsdom does not have; the edit runs through a real CodeMirror, which under
 * jsdom is a `<textarea>` fallback; and the restore is driven from a dialog rendered
 * into the top layer over a panel. It compares EXPORTED BYTES for the same reason the
 * hand-edit round trip above does — the export is the artifact a human receives, so
 * two downloads ask the question the claim is actually about.
 */
test('an edit over a saved theme is recoverable — the earlier version restores byte-identical', async ({ page }) => {
	await page.getByRole('textbox', { name: 'Theme name' }).fill('versioned');

	// 1. Author version A and save it. This is a CREATE — there is no previous record,
	//    so no version is taken, and the card should offer no history yet.
	const generated = await exportedCss(page);
	const versionA = `${generated.replace(/--accent:\s*[^;]+;/, '--accent: #1a7f5a;')}\n/* version A */\n`;
	await page.getByRole('button', { name: 'CSS', exact: true }).click();
	const cssBox = page.locator('.cm-content[aria-label="Theme CSS"]');
	await expect(cssBox).toBeVisible();
	await cssBox.fill(versionA);
	await saveAsset(page);
	expect(await exportedCss(page)).toEqual(versionA);

	// 2. Edit over it and save again. The Save is now id-pinned (the first save set
	//    the editing id), so THIS is the overwrite that has to be recoverable.
	const versionB = `${generated.replace(/--accent:\s*[^;]+;/, '--accent: #b3261e;')}\n/* version B */\n`;
	await cssBox.fill(versionB);
	await saveAsset(page);
	expect(await exportedCss(page)).toEqual(versionB);

	// 3. The Library card now says so. The affordance is in the card's metadata line,
	//    not its action row — that row is already four controls wide at 390px.
	await page.getByRole('button', { name: 'Back to Compose' }).click();
	const openLibrary = page.getByRole('button', { name: 'Open Library' });
	await (await openLibrary.count() ? openLibrary : page.getByRole('button', { name: 'Library', exact: true })).click();
	const historyLink = page.getByRole('button', { name: 'Earlier versions of Versioned' });
	await expect(historyLink).toBeVisible();
	await expect(historyLink).toHaveText('1 version');

	// 4. Restore version A.
	await historyLink.click();
	await expect(page.getByRole('heading', { name: 'Earlier versions' })).toBeVisible();
	await expect(page.getByText('Before edit')).toBeVisible();
	await page.getByRole('button', { name: /^Restore the / }).click();
	await expect(page.getByText(/Restored/).first()).toBeVisible(); // toasts stack; see saveAsset

	// 5. THE CLAIM, as bytes: reopen the record and the file is version A again.
	await page.getByRole('button', { name: 'Edit Versioned' }).click();
	await expect(page.locator('.cm-content[aria-label="Theme CSS"]')).toBeVisible();
	expect(await exportedCss(page)).toEqual(versionA);
});

/**
 * The other half of the restore contract: restoring is ITSELF an overwrite, so the
 * state it replaced is checkpointed too. Without this a restore is a one-way door —
 * a mis-click costs you the edit you were trying to compare against — which is the
 * failure the kernel's "restore-that-checkpoints-first" shape exists to prevent.
 */
test('restoring checkpoints the current version, so a mis-clicked restore is itself recoverable', async ({ page }) => {
	await page.getByRole('textbox', { name: 'Theme name' }).fill('roundtrip');
	const generated = await exportedCss(page);
	const versionA = `${generated}\n/* A */\n`;
	const versionB = `${generated}\n/* B */\n`;

	await page.getByRole('button', { name: 'CSS', exact: true }).click();
	const cssBox = page.locator('.cm-content[aria-label="Theme CSS"]');
	await expect(cssBox).toBeVisible();
	await cssBox.fill(versionA);
	await saveAsset(page);
	await cssBox.fill(versionB);
	await saveAsset(page);

	await page.getByRole('button', { name: 'Back to Compose' }).click();
	const openLibrary = page.getByRole('button', { name: 'Open Library' });
	await (await openLibrary.count() ? openLibrary : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.getByRole('button', { name: 'Earlier versions of Roundtrip' }).click();
	await page.getByRole('button', { name: /^Restore the / }).click();
	await expect(page.getByText(/Restored/).first()).toBeVisible(); // toasts stack; see saveAsset

	// Two versions now: the "Before edit" snapshot of A, and a "Before restore"
	// snapshot of B — so the state the restore replaced is still reachable.
	const historyLink = page.getByRole('button', { name: 'Earlier versions of Roundtrip' });
	await expect(historyLink).toHaveText('2 versions');
	await historyLink.click();
	await expect(page.getByText('Before restore')).toBeVisible();

	// Restore that one and B comes back — the round trip closes.
	await page.getByRole('button', { name: /^Restore the / }).first().click();
	await expect(page.getByText(/Restored/).first()).toBeVisible(); // toasts stack; see saveAsset
	await page.getByRole('button', { name: 'Edit Roundtrip' }).click();
	await expect(page.locator('.cm-content[aria-label="Theme CSS"]')).toBeVisible();
	expect(await exportedCss(page)).toEqual(versionB);
});

/**
 * THE FINISH FACULTY'S CSS VIEW, on the real surface (HARD RULE #23).
 *
 * The last faculty whose generated CSS an author could not see at all. It is
 * READ-ONLY, and that is a property of the artifact rather than a shortcut: a finish
 * recipe is a structured four-layer object and `generateFinishCss` is a projection
 * with no inverse — the opaque print/export mirrors are emitted twice from one
 * source so they cannot drift, and a wash `type` swap is a whole different slot set.
 * So the two claims to prove here are that the CSS is VISIBLE and TRACKS the recipe,
 * and that it does not offer an edit it could not honor.
 *
 * The read-only half needs a real browser specifically: under jsdom `CodeField`
 * renders its `<textarea>` fallback, so `EditorView.editable` — the switch that stops
 * the field being a focus stop with a caret it will never honor — is never exercised.
 */
test('the Finish CSS view shows what Save would write, tracks the recipe, and refuses edits', async ({ page }) => {
	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	await page.getByRole('textbox', { name: 'Finish name' }).fill('viewdemo');

	const cssBox = page.locator('.cm-content[aria-label="Finish CSS"]');
	await expect(cssBox).toBeVisible();

	// 1. It is the SLUG form — what Export/Save write — not the preview form.
	await expect(cssBox).toContainText('finish-viewdemo');
	await expect(page.getByText('· finish-viewdemo · read-only')).toBeVisible();

	// 2. It TRACKS the recipe. Toggling the spotlight is a whole different slot set,
	//    which is one of the reasons this view cannot be an editor.
	const before = (await cssBox.textContent()) || '';
	await page.getByRole('checkbox', { name: 'Spotlight one area' }).check();
	await expect(cssBox).not.toHaveText(before);

	// 3. It does not offer an edit. `EditorView.editable.of(false)` drops
	//    contenteditable, so the field is not a focus stop — a box that looked
	//    editable and silently ate keystrokes would read as broken, not read-only.
	await expect(cssBox).toHaveAttribute('contenteditable', 'false');
	const typed = (await cssBox.textContent()) || '';
	await cssBox.click();
	await page.keyboard.type('/* nope */');
	await expect(cssBox).toHaveText(typed);
});
