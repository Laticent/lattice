import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// THE UI GUARD IS STALE ACROSS TABS. THE STORE IS WHAT ACTUALLY HOLDS THE LINE.
//
// Each faculty refuses a name another record holds, but it reads a React snapshot
// refreshed on save — so a second tab (or a workspace restore behind an open faculty)
// invalidates it, and the save then goes through the id path, which is a blind put. Both
// the round-2 checker and the Munger inversion drove exactly this and measured two live
// records under one name: the shell resolves an asset by name and takes the newest while
// the preview concatenates every match, so the Inspector shows one recipe and the slide
// renders another, and `restoreAssetVersion` locks both records out of their history.
//
// `putAsset` now enforces `(kind, name)` uniqueness inside the write transaction, which is
// the one place that cannot go stale. This drives the real two-tab race against the real
// store and asserts the shelf is unchanged — the invariant, not the guard.
test('@smoke a stale collision guard cannot write two records under one name', async ({ page, context }) => {
	test.slow();
	await gotoStudio(page);

	// Tab 1: save `alpha-wash`, then reopen it so the faculty is id-pinned.
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	await page.getByRole('textbox', { name: /finish name/i }).fill('Alpha Wash');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved "Alpha Wash"/)).toBeVisible();
	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('button', { name: 'Edit Alpha Wash' }).click();
	await expect(page.getByRole('textbox', { name: /finish name/i })).toHaveValue('Alpha Wash');

	// Tab 2: create `beta-wash`. Tab 1's `savedFinishes` snapshot never learns about it.
	const two = await context.newPage();
	await gotoStudio(two);
	await two.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await two.getByRole('menuitem', { name: /Fabricate/ }).click();
	await two.getByRole('button', { name: 'Finish', exact: true }).click();
	await two.getByRole('textbox', { name: /finish name/i }).fill('Beta Wash');
	await two.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(two.getByText(/Saved "Beta Wash"/)).toBeVisible();
	await two.close();

	// Tab 1 renames its pinned record onto the name tab 2 just took. The guard is blind
	// to it, so Save is enabled — and the store must refuse the write.
	await page.getByRole('textbox', { name: /finish name/i }).fill('Beta Wash');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/already another saved finish/i), 'the store must refuse and say so').toBeVisible();

	// The shelf is untouched: two records, two names, no duplicate.
	const names = await page.evaluate(async () => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: unknown[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result);
		});
		return (rows as { kind: string; name: string }[]).filter((a) => a.kind === 'finish').map((a) => a.name).sort();
	});
	expect(names, 'two live finishes, distinct names — the duplicate the guard missed was refused').toEqual(['alpha-wash', 'beta-wash']);
});
