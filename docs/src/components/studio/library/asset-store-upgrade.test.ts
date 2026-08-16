// Unit: the v1 → v2 upgrade of the `lattice-workbench` database.
//
// This is the one path in the history feature that can break somebody who already
// has a Library. Every OTHER test opens a database that never existed, so it takes
// the "create both stores" branch and proves nothing about an upgrade. A real user
// has a v1 database holding their themes; opening it at v2 must add `assetHistory`
// and leave `assets` — and its contents — untouched.
//
// It lives in its own FILE deliberately: `asset-store.js` memoizes its open promise
// at module scope, so the v1 database has to be created before that module is ever
// imported. Vitest isolates modules per file, which is what makes that possible.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

const DB_NAME = 'lattice-workbench';

/** Create the database exactly as v1 shipped it: one `assets` store, one theme in it. */
function seedV1(): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			const os = req.result.createObjectStore('assets', { keyPath: 'id' });
			os.createIndex('kind', 'kind', { unique: false });
		};
		req.onsuccess = () => {
			const db = req.result;
			const put = db.transaction('assets', 'readwrite').objectStore('assets').put({ id: 't1', kind: 'theme', name: 'midnight', css: 'a{}', addedAt: 1 });
			put.onsuccess = () => {
				db.close();
				resolve();
			};
			put.onerror = () => reject(put.error);
		};
		req.onerror = () => reject(req.error);
	});
}

describe('lattice-workbench v1 → v2', () => {
	it('adds assetHistory and keeps every existing asset', async () => {
		await seedV1();

		// Imported only NOW, so its memoized open runs against the v1 database above.
		const { listAssets } = await import('./asset-store.js');
		const { listAssetVersions, saveAssetVersion } = await import('./asset-history.js');

		// The pre-existing asset survived the upgrade.
		const assets = await listAssets('theme');
		expect(assets).toHaveLength(1);
		expect(assets[0]).toMatchObject({ id: 't1', name: 'midnight', css: 'a{}' });

		// And the new store is usable, which is only true if the upgrade created it.
		expect(await listAssetVersions('t1')).toEqual([]);
		await saveAssetVersion(assets[0], 'Before edit', 1000);
		expect(await listAssetVersions('t1')).toHaveLength(1);
	});
});
