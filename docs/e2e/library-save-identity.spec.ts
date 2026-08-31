import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// WHICH RECORD DOES A SAVE LAND ON? Three behaviors that had no coverage at all, and two
// of them were broken. The adversarial trio found every one of these; none was reachable
// through the specs that shipped with #1839's first two commits.
//
// The through-line: `putAsset` overwrites blindly when given an `id` and resolves by
// `(kind, name)` without one. So "which record" is decided entirely by whether the
// faculty is holding an id — and it was holding one in two situations where the author
// had not said which record they meant.

async function openFabricate(page: Parameters<typeof gotoStudio>[0], faculty: 'Component' | 'Finish') {
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await page.getByRole('button', { name: faculty, exact: true }).click();
}

async function retype(page: Parameters<typeof gotoStudio>[0], label: string, text: string) {
	await page.getByRole('textbox', { name: label }).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

/** Fill a component draft's three gate-coupled fields. */
async function draftComponent(page: Parameters<typeof gotoStudio>[0], name: string) {
	await page.getByRole('textbox', { name: 'Component name' }).fill(name);
	await retype(page, 'Component skeleton', `<!-- _class: ${name} -->\n\n## ${name}\n\nBody.`);
	await retype(page, 'Component CSS', `section.${name} { display: grid; }\nsection.${name} h2 { color: var(--accent); }`);
}

const save = (page: Parameters<typeof gotoStudio>[0]) => page.getByRole('button', { name: 'Save', exact: true }).click();

// ── 1. Two assets in one sitting ─────────────────────────────────────────────────────
//
// The faculty used to pin `compEditingId` / `editingId` after EVERY save, which made it a
// permanent editor of whatever it saved first. Naming a second asset then renamed the
// first out of existence instead of creating a second — silent data loss on the most
// ordinary flow either faculty has, and worse than the fork it replaced, because a fork
// at least left both records standing.

test('@smoke saving two components in one sitting keeps both', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openFabricate(page, 'Component');

	await draftComponent(page, 'alpha-card');
	await save(page);
	await expect(page.getByText(/Saved .*alpha-card/)).toBeVisible();

	// Same session, no reopen — a second, different component.
	await draftComponent(page, 'beta-card');
	await save(page);
	await expect(page.getByText(/Saved .*beta-card/)).toBeVisible();

	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await expect(page.getByRole('button', { name: 'Edit .beta-card' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Edit .alpha-card' }),
		'the first component must survive naming a second one',
	).toBeVisible();
});

test('@smoke saving two finishes in one sitting keeps both', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openFabricate(page, 'Finish');

	await page.getByRole('textbox', { name: /finish name/i }).fill('Alpha Wash');
	await save(page);
	await expect(page.getByText(/Saved "Alpha Wash"/)).toBeVisible();

	await page.getByRole('textbox', { name: /finish name/i }).fill('Beta Wash');
	await save(page);
	await expect(page.getByText(/Saved "Beta Wash"/)).toBeVisible();

	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await expect(page.getByRole('button', { name: 'Edit Beta Wash' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Edit Alpha Wash' }),
		'the first finish must survive naming a second one',
	).toBeVisible();
});

// ── 2. The collision guard, on the names that namespace ──────────────────────────────
//
// `safeFinishSlug` (what the preview uses) does NOT namespace the ten reserved finish
// names; `safeSaveSlug` (what the store writes) does — `Ledger` is stored as
// `ledger-custom`. The guard compared the first, so on exactly those ten names it
// compared `'ledger'` against a shelf holding `'ledger-custom'`, found no match, and let
// two live records land on one slug. `Ledger` is the canary for all ten.

test('@smoke a reserved finish name cannot be taken twice', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openFabricate(page, 'Finish');

	await page.getByRole('textbox', { name: /finish name/i }).fill('Ledger');
	await save(page);
	await expect(page.getByText(/Saved "Ledger"/)).toBeVisible();

	await page.getByRole('textbox', { name: /finish name/i }).fill('Sidecar');
	await save(page);
	await expect(page.getByText(/Saved "Sidecar"/)).toBeVisible();

	// Reopen Sidecar and try to rename it onto the reserved name.
	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('button', { name: 'Edit Sidecar' }).click();
	await page.getByRole('textbox', { name: /finish name/i }).fill('Ledger');

	await expect(
		page.getByRole('button', { name: 'Save', exact: true }),
		'“Ledger” resolves to the taken slug `ledger-custom`, so Save must refuse',
	).toBeDisabled();
});

// ── 3. A reserved name round-trips through reopen ────────────────────────────────────
//
// The seed predicate had the same `safeFinishSlug` / `safeSaveSlug` mix-up, so reopening
// `Ledger` put `ledger-custom` in a field that holds the LABEL — and a no-op Save then
// wrote that slug over the display name. The record's own name was never wrong; the card
// just stopped saying what the author called it.

test('@smoke reopening a reserved-name finish keeps its display name through a re-save', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openFabricate(page, 'Finish');
	await page.getByRole('textbox', { name: /finish name/i }).fill('Ledger');
	await save(page);
	await expect(page.getByText(/Saved "Ledger"/)).toBeVisible();

	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('button', { name: 'Edit Ledger' }).click();

	await expect(
		page.getByRole('textbox', { name: /finish name/i }),
		'the field holds the LABEL — seeding it with the namespaced slug re-titles the finish',
	).toHaveValue('Ledger');

	// Touch nothing; save. The card must still say what the author called it.
	// `.last()` because the first save's toast can still be on screen — two matches is a
	// strict-mode violation, not a product failure.
	await save(page);
	await expect(page.getByText(/Saved "Ledger"/).last()).toBeVisible();
	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await expect(page.getByRole('button', { name: 'Edit Ledger' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit ledger-custom' })).toHaveCount(0);
});

// ── 4. Saving the SAME asset twice ───────────────────────────────────────────────────
//
// The plainest loop either faculty has, and for one commit it was impossible. Two fixes
// that are each right alone closed the door together: the id is no longer pinned on a
// fresh save (so a second asset cannot rename the first out of existence), and a taken
// name is refused — so the second save found the record the FIRST save had just created,
// matched it, and disabled Save permanently. The only escapes were a rename (which forks)
// or leaving the faculty (which loses the unsaved edit).
//
// Note what the two tests at the top of this file do NOT cover: they rename between the
// saves, which is the one path the guard always allowed. That is why this needs its own
// test rather than an extra assertion in those.

test('@smoke a component can be saved, edited and saved again', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openFabricate(page, 'Component');
	await draftComponent(page, 'twice-card');
	await save(page);
	await expect(page.getByText(/Saved .*twice-card/)).toBeVisible();

	// Keep tuning the SAME component — no rename — and save again.
	await retype(page, 'Component CSS', 'section.twice-card { display: grid; gap: 2rem; }\nsection.twice-card h2 { color: var(--accent); }');
	await expect(
		page.getByRole('button', { name: 'Save', exact: true }),
		'Save must stay reachable for a second save of the same component',
	).toBeEnabled();
	await save(page);
	await expect(page.getByText(/Saved .*twice-card/).last()).toBeVisible();

	// One record, not two — the second save resolved by name onto the first.
	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await expect(page.getByRole('button', { name: 'Edit .twice-card' })).toHaveCount(1);
});

test('@smoke a finish can be saved, edited and saved again', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openFabricate(page, 'Finish');
	await page.getByRole('textbox', { name: /finish name/i }).fill('Twice Wash');
	await save(page);
	await expect(page.getByText(/Saved "Twice Wash"/)).toBeVisible();

	await expect(
		page.getByRole('button', { name: 'Save', exact: true }),
		'Save must stay reachable for a second save of the same finish',
	).toBeEnabled();
	await save(page);
	await expect(page.getByText(/Saved "Twice Wash"/).last()).toBeVisible();

	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await expect(page.getByRole('button', { name: 'Edit Twice Wash' })).toHaveCount(1);
});
