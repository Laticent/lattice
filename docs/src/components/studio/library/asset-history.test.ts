// Unit: version history for a saved Library asset.
//
// Driven against `fake-indexeddb` — a real IDB implementation — rather than a hand
// -rolled double, matching `src/playground/narration-store.test.ts`. A double would
// agree with whatever this module happens to do, including the index it forgets to
// use; a real store fails when the schema is wrong, which is the failure worth
// catching here (the `assetHistory` store arrives in a v2 upgrade of a database
// that already shipped at v1).

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	deleteAssetVersions,
	listAllAssetVersions,
	listAssetVersions,
	pruneOrphanVersions,
	putAssetVersions,
	saveAssetVersion,
	VERSION_CAP,
} from './asset-history.js';

const theme = (id: string, css: string) => ({ id, kind: 'theme', name: 'midnight', label: 'Midnight', css, addedAt: 1 });

// Each test starts from an empty history rather than a fresh database: the module
// memoizes its `openDB` promise, so deleting the database between tests would leave
// every later call holding a handle to a database that no longer exists.
async function clear() {
	await pruneOrphanVersions(new Set());
}

describe('asset version history', () => {
	beforeEach(clear);

	it('records a version and reads it back newest-first', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'Before edit', 1000);
		await saveAssetVersion(theme('t1', 'b{}'), 'Before edit', 2000);
		const list = await listAssetVersions('t1');
		expect(list).toHaveLength(2);
		expect(list[0].ts).toBe(2000);
		expect(list[0].snapshot.css).toBe('b{}');
		expect(list[1].snapshot.css).toBe('a{}');
	});

	it('keeps the WHOLE record, not a diff — restoring must not need the current one', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'Before edit', 1000);
		const [v] = await listAssetVersions('t1');
		expect(v.snapshot).toMatchObject({ id: 't1', kind: 'theme', name: 'midnight', label: 'Midnight', css: 'a{}' });
	});

	it('snapshots deeply — a later mutation of the caller’s object does not rewrite history', async () => {
		const record = theme('t1', 'a{}');
		await saveAssetVersion(record, 'Before edit', 1000);
		record.css = 'MUTATED';
		record.label = 'MUTATED';
		const [v] = await listAssetVersions('t1');
		expect(v.snapshot.css).toBe('a{}');
		expect(v.snapshot.label).toBe('Midnight');
	});

	it('skips an identical consecutive version — saving without editing adds nothing', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'Before edit', 1000);
		await saveAssetVersion(theme('t1', 'a{}'), 'Before edit', 2000);
		expect(await listAssetVersions('t1')).toHaveLength(1);
	});

	it('records a change that returns to an earlier value — dedupe is consecutive-only', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'x', 1000);
		await saveAssetVersion(theme('t1', 'b{}'), 'x', 2000);
		await saveAssetVersion(theme('t1', 'a{}'), 'x', 3000);
		expect(await listAssetVersions('t1')).toHaveLength(3);
	});

	it('caps the list, dropping the OLDEST', async () => {
		for (let i = 1; i <= VERSION_CAP + 5; i++) await saveAssetVersion(theme('t1', `v${i}{}`), 'x', i * 1000);
		const list = await listAssetVersions('t1');
		expect(list).toHaveLength(VERSION_CAP);
		expect(list[0].snapshot.css).toBe(`v${VERSION_CAP + 5}{}`);
		expect(list.at(-1)?.snapshot.css).toBe('v6{}'); // v1..v5 pruned
	});

	it('keeps each asset’s history to itself', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'x', 1000);
		await saveAssetVersion(theme('t2', 'b{}'), 'x', 2000);
		expect(await listAssetVersions('t1')).toHaveLength(1);
		expect(await listAssetVersions('t2')).toHaveLength(1);
		expect((await listAssetVersions('t1'))[0].snapshot.css).toBe('a{}');
	});

	it('deletes one asset’s history without touching another’s', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'x', 1000);
		await saveAssetVersion(theme('t2', 'b{}'), 'x', 2000);
		await deleteAssetVersions('t1');
		expect(await listAssetVersions('t1')).toEqual([]);
		expect(await listAssetVersions('t2')).toHaveLength(1);
	});

	it('prunes versions whose asset is gone, and spares the ones still live', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'x', 1000);
		await saveAssetVersion(theme('gone', 'b{}'), 'x', 2000);
		const dropped = await pruneOrphanVersions(new Set(['t1']));
		expect(dropped).toBe(1);
		expect(await listAssetVersions('t1')).toHaveLength(1);
		expect(await listAssetVersions('gone')).toEqual([]);
	});

	it('round-trips through the backup helpers, idempotently', async () => {
		await saveAssetVersion(theme('t1', 'a{}'), 'x', 1000);
		await saveAssetVersion(theme('t1', 'b{}'), 'x', 2000);
		const exported = await listAllAssetVersions();
		expect(exported).toHaveLength(2);
		await clear();
		expect(await listAssetVersions('t1')).toEqual([]);
		expect(await putAssetVersions(exported)).toBe(2);
		expect(await listAssetVersions('t1')).toHaveLength(2);
		// Restoring the same backup twice must not double the history.
		await putAssetVersions(exported);
		expect(await listAssetVersions('t1')).toHaveLength(2);
	});

	it('ignores a record with no id, and a malformed version on restore', async () => {
		expect(await saveAssetVersion({ kind: 'theme', name: 'x' } as never, 'x', 1000)).toEqual([]);
		expect(await listAssetVersions('')).toEqual([]);
		expect(await putAssetVersions([{ id: 'a' } as never, null as never, { assetId: 'b' } as never])).toBe(0);
	});
});
