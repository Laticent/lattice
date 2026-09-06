import { expect, gotoStudio, readStorage, test } from './studio-fixture';

// The Workspace sheet. Standing instructions are the fully-offline persistence
// oracle (they write localStorage live); the AI tab's Model section shows the
// honest "no model" floor when nothing is connected.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Workspace settings' }).click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
});

test('standing instructions persist to localStorage as you type', async ({ page }) => {
	// Instructions is now a section of the AI tab (folded in from its own tab).
	await page.getByRole('tab', { name: 'AI' }).click();
	const box = page.getByRole('textbox', { name: 'Standing instructions' });
	await box.fill('Always lead with the number.');

	await expect.poll(() => readStorage(page, 'lattice-studio-instructions')).toContain(
		'Always lead with the number.',
	);
});

test('the AI tab is honest about running with no model', async ({ page }) => {
	await page.getByRole('tab', { name: 'AI' }).click();
	await expect(page.getByText(/No tier active yet|connect a cloud model/)).toBeVisible();
});

test('the General tab switches the placement-handle style and persists it', async ({ page }) => {
	await page.getByRole('tab', { name: 'General' }).click();
	// The choice cards wrap an sr-only radio (a 1px clipped box), so check()'s
	// click point can land over ANOTHER card's chrome and be intercepted — the
	// deterministic red the first nightly with this test surfaced. Click the
	// visible card title exactly as a user does (the label toggles the radio),
	// and assert the radio state plus the persisted setting.
	await page.getByText('Precision', { exact: true }).click();
	await expect(page.getByRole('radio', { name: /Precision/ })).toBeChecked();
	await expect.poll(() => readStorage(page, 'lattice-studio-settings')).toContain('reticle');
	// Switch back to familiar (knob).
	await page.getByText('Familiar', { exact: true }).click();
	await expect(page.getByRole('radio', { name: /Familiar/ })).toBeChecked();
	await expect.poll(() => readStorage(page, 'lattice-studio-settings')).toContain('knob');
});

/**
 * THE §7c DATA-LOSS FIX, AGAINST A REAL INDEXEDDB (HARD RULE #23).
 *
 * A saved motion scene whose spec no longer validated used to vanish from the Library AND from
 * the user's next backup, silently — restore onto a clean profile and it was gone
 * (`engineering/decisions/2026-09-02-frame-model-for-motion.md` §7c).
 *
 * The unit tier proves the fix with a mocked asset store. That is a proxy, and the defect lived
 * exactly where the proxy stands in: the store. This writes a genuinely unparseable record into
 * the real `lattice-workbench` database, takes a real backup through the real button, and opens
 * the zip. Mutation-checked — dropping the unreadable lane fails this with `Received: 0`.
 */
test('a scene this version cannot read still reaches a real backup', async ({ page }) => {
	const wrote = await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		if (!db.objectStoreNames.contains('assets')) return `no assets store: ${[...db.objectStoreNames].join(',')}`;
		return await new Promise<string>((res) => {
			const tx = db.transaction('assets', 'readwrite');
			// `duration: -1` is the same rejection the unit suite uses — a real parse failure.
			tx.objectStore('assets').put({
				id: 'broken-rotor-id',
				kind: 'scene',
				name: 'broken-rotor',
				label: 'Broken rotor',
				spec: { source: 'built', duration: -1, hero: 5, elements: [] },
				addedAt: Date.now(),
			});
			tx.oncomplete = () => res('ok');
			tx.onerror = () => res(`tx error: ${tx.error?.message}`);
		});
	});
	expect(wrote, 'the malformed record must land in the real store').toBe('ok');

	await page.reload();
	await page.getByRole('button', { name: 'Workspace settings' }).click();
	await page.getByRole('tab', { name: 'Data', exact: true }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download backup/ }).click();

	const { default: JSZip } = await import('jszip');
	const fs = await import('node:fs/promises');
	const zip = await JSZip.loadAsync(await fs.readFile(await (await download).path()));

	const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
	expect(manifest.counts.unreadableScenes, 'the manifest must count it').toBe(1);

	const lane = zip.file('library-unreadable-scenes.json');
	expect(lane, 'the record must ride in its own lane').not.toBeNull();
	const rows = JSON.parse(await lane!.async('string'));
	expect(rows).toHaveLength(1);
	expect(rows[0].name).toBe('broken-rotor');
	expect(rows[0].reason, 'the parse reason travels with it').toBeTruthy();
	expect(rows[0].record.spec.duration, 'the spec survives byte-for-byte').toBe(-1);
});
