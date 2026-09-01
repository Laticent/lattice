import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// Reopening a saved asset — the round trip a saved COMPONENT and a saved FINISH did not
// have until #1839. Themes have had it since #1850; the other two kinds could be made and
// then never edited again, even though their records already carried everything an editor
// needs (`manifest` + `skeleton` + `css` for a component, `recipe` for a finish).
//
// This drives the REAL Studio rather than asserting on props, because the defect the round
// trip actually had was invisible to a unit test: `saveStudioComponent` was called with
// `historyLabel: 'Before edit'` and NO `id`, so `putAsset` fell back to its `(kind, name)`
// dedupe and a reopen-then-rename FORKED the record instead of updating it. Nothing about
// that shows up until you save, rename, save again and count the cards.
//
// Each test seeds through the app's own Save, not by writing a record into IndexedDB: the
// store's id/dedupe behavior is precisely what is under test, so seeding by hand would
// assume the thing being checked.

/** Open Fabricate from the workspace launcher, then land on one faculty. */
async function openFabricate(page: Parameters<typeof gotoStudio>[0], faculty: 'Theme' | 'Component' | 'Finish') {
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await page.getByRole('button', { name: faculty, exact: true }).click();
}

/** Retype a CodeMirror field wholesale. */
async function retype(page: Parameters<typeof gotoStudio>[0], label: string, text: string) {
	await page.getByRole('textbox', { name: label }).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

/**
 * Name a component draft — the name field, the SKELETON and the CSS, because renaming a
 * component means all three.
 *
 * That is not this spec being thorough; it is the gate. `compFindings` fails Save on
 * `skeletonInvokes(compSkeleton, compName)` AND on every `gateCss` selector still scoped
 * to the old name ("selector `section.callout` is not scoped to .reopen-probe — it would
 * leak onto other slides"). So a component rename is a THREE-field edit where a finish
 * rename is one field, and Save stays disabled until all three agree.
 *
 * Worth knowing beyond this file: it is why a one-click rename for components belongs in
 * the Library — where the record's `name`, its CSS selectors and its skeleton can be
 * rewritten together — rather than being left as three hand edits in the faculty.
 */
async function nameComponent(page: Parameters<typeof gotoStudio>[0], name: string) {
	await page.getByRole('textbox', { name: 'Component name' }).fill(name);
	await retype(page, 'Component skeleton', `<!-- _class: ${name} -->\n\n## Probe headline\n\nA supporting line.`);
	// Palette-blind and scoped — the two things `gateCss` actually checks (HARD RULE #3).
	await retype(page, 'Component CSS', `section.${name} { display: grid; place-content: center; }\nsection.${name} h2 { color: var(--accent); }`);
}

const save = (page: Parameters<typeof gotoStudio>[0]) => page.getByRole('button', { name: 'Save', exact: true }).click();

/** Back out of Fabricate and open the Library panel. */
async function openLibrary(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
}

test('@smoke a saved component reopens in the Component faculty', async ({ page }) => {
	await gotoStudio(page);
	await openFabricate(page, 'Component');
	await nameComponent(page, 'reopen-probe');
	await save(page);
	await expect(page.getByText(/Saved .*reopen-probe/)).toBeVisible();

	await openLibrary(page);
	const edit = page.getByRole('button', { name: 'Edit .reopen-probe' });
	await expect(edit, 'a saved component should carry an Edit control').toBeVisible();
	await edit.click();

	// Fabricate is open, on the COMPONENT faculty, showing that record.
	await expect(page.getByRole('button', { name: 'Component', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('textbox', { name: 'Component name' })).toHaveValue('reopen-probe');
});

test('@smoke a saved finish reopens in the Finish faculty, with its display name', async ({ page }) => {
	await gotoStudio(page);
	await openFabricate(page, 'Finish');
	await page.getByRole('textbox', { name: /finish name/i }).fill('Reopen Probe');
	await save(page);
	await expect(page.getByText(/Saved "Reopen Probe"/)).toBeVisible();

	await openLibrary(page);
	const edit = page.getByRole('button', { name: 'Edit Reopen Probe' });
	await expect(edit, 'a saved finish should carry an Edit control').toBeVisible();
	await edit.click();

	// The DISPLAY name comes back, not the slug. Seeding the field with `record.name`
	// would put `reopen-probe` here and silently re-title the finish on the next save.
	await expect(page.getByRole('textbox', { name: /finish name/i })).toHaveValue('Reopen Probe');
});

// The regression the missing `id` caused, stated as a count. Save, reopen, rename, save:
// ONE record under the new name — not two. This is the assertion that fails on `main`.
test('@smoke reopening a component and renaming it updates the record instead of forking it', async ({ page }) => {
	await gotoStudio(page);
	await openFabricate(page, 'Component');
	await nameComponent(page, 'fork-probe');
	await save(page);
	await expect(page.getByText(/Saved .*fork-probe/)).toBeVisible();

	await openLibrary(page);
	await page.getByRole('button', { name: 'Edit .fork-probe' }).click();
	await nameComponent(page, 'fork-probe-renamed');
	await save(page);
	await expect(page.getByText(/Saved .*fork-probe-renamed/)).toBeVisible();

	await openLibrary(page);
	await expect(page.getByRole('button', { name: 'Edit .fork-probe-renamed' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Edit .fork-probe', exact: true }),
		'the pre-rename record should be GONE, not left beside the renamed one',
	).toHaveCount(0);
});

// The same no-fork guarantee for finishes, where a rename is one field. `saveStudioFinish`
// took no id at all before #1839 — and, unlike the component branch, no `historyLabel`
// either, so an edit took no version snapshot to go back to.
test('@smoke reopening a finish and renaming it updates the record instead of forking it', async ({ page }) => {
	await gotoStudio(page);
	await openFabricate(page, 'Finish');
	await page.getByRole('textbox', { name: /finish name/i }).fill('Fork Probe');
	await save(page);
	await expect(page.getByText(/Saved "Fork Probe"/)).toBeVisible();

	await openLibrary(page);
	await page.getByRole('button', { name: 'Edit Fork Probe' }).click();
	await page.getByRole('textbox', { name: /finish name/i }).fill('Fork Probe Renamed');
	await save(page);
	await expect(page.getByText(/Saved "Fork Probe Renamed"/)).toBeVisible();

	await openLibrary(page);
	await expect(page.getByRole('button', { name: 'Edit Fork Probe Renamed' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Edit Fork Probe', exact: true }),
		'the pre-rename record should be GONE, not left beside the renamed one',
	).toHaveCount(0);
});
