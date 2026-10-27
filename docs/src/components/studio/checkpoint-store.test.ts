// checkpoint-store: IndexedDB behind a synchronous cache, failures reported, legacy
// localStorage lists migrated. A "reload" below is `__resetCheckpointStoreForTests()` with
// the same fake IndexedDB kept: the module forgets everything a page would forget.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	__resetCheckpointStoreForTests,
	type Checkpoint,
	type CheckpointWriteError,
	checkpointBytes,
	checkpointsSettled,
	clearCheckpoints,
	dropCheckpoints,
	hydrateCheckpoints,
	onCheckpointWriteError,
	readCheckpoints,
	SNAP_PREFIX,
	writeCheckpoints,
} from './checkpoint-store';

const cp = (id: string, ts: number, source = `# ${id}`): Checkpoint => ({ id, ts, label: id, source });
const reload = () => __resetCheckpointStoreForTests({ backend: 'idb' });

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
	reload();
});
afterEach(() => __resetCheckpointStoreForTests());

describe('IndexedDB backend', () => {
	it('a written list survives a reload', async () => {
		writeCheckpoints('d1', [cp('b', 2), cp('a', 1)]);
		expect(readCheckpoints('d1').map((c) => c.id)).toEqual(['b', 'a']);
		await checkpointsSettled();
		reload();
		await hydrateCheckpoints();
		expect(readCheckpoints('d1').map((c) => c.id)).toEqual(['b', 'a']);
		expect(localStorage.getItem(SNAP_PREFIX + 'd1')).toBeNull();
	});

	it('migrates a legacy localStorage list, and shows it before hydration finishes', async () => {
		localStorage.setItem(SNAP_PREFIX + 'old', JSON.stringify([cp('x', 5)]));
		expect(readCheckpoints('old').map((c) => c.id), 'no empty flash before hydration').toEqual(['x']);
		await hydrateCheckpoints();
		await checkpointsSettled();
		expect(localStorage.getItem(SNAP_PREFIX + 'old'), 'the legacy key goes once IndexedDB holds it').toBeNull();
		reload();
		await hydrateCheckpoints();
		expect(readCheckpoints('old').map((c) => c.id)).toEqual(['x']);
	});

	it('a write made before hydration merges with what was stored, newest first, capped at 25', async () => {
		writeCheckpoints('d1', Array.from({ length: 20 }, (_, i) => cp(`s${i}`, i)));
		await checkpointsSettled();
		reload();
		writeCheckpoints('d1', Array.from({ length: 10 }, (_, i) => cp(`n${i}`, 100 + i)));
		await hydrateCheckpoints();
		await checkpointsSettled();
		const ids = readCheckpoints('d1').map((c) => c.id);
		expect(ids).toHaveLength(25);
		expect(ids[0]).toBe('n9');
		expect(ids).toContain('s19');
		expect(ids).not.toContain('s0');
	});

	it('reports a failed write instead of swallowing it, and keeps the version for the session', async () => {
		await hydrateCheckpoints();
		const errors: CheckpointWriteError[] = [];
		onCheckpointWriteError((e) => errors.push(e));
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		try {
			writeCheckpoints('d1', [cp('a', 1)]);
			await checkpointsSettled();
		} finally {
			IDBObjectStore.prototype.put = put;
		}
		expect(errors).toHaveLength(1);
		expect(errors[0].deckId).toBe('d1');
		expect((errors[0].error as DOMException).name).toBe('QuotaExceededError');
		expect(readCheckpoints('d1').map((c) => c.id), 'still restorable this session').toEqual(['a']);
	});

	it('dropCheckpoints forgets a deleted deck across a reload', async () => {
		writeCheckpoints('d1', [cp('a', 1)]);
		dropCheckpoints('d1');
		await checkpointsSettled();
		reload();
		await hydrateCheckpoints();
		expect(readCheckpoints('d1')).toEqual([]);
	});

	it('clearCheckpoints empties IndexedDB and the legacy keys', async () => {
		localStorage.setItem(SNAP_PREFIX + 'old', JSON.stringify([cp('x', 5)]));
		writeCheckpoints('d1', [cp('a', 1)]);
		clearCheckpoints();
		await checkpointsSettled();
		expect(localStorage.getItem(SNAP_PREFIX + 'old')).toBeNull();
		reload();
		await hydrateCheckpoints();
		expect(readCheckpoints('d1')).toEqual([]);
		expect(readCheckpoints('old')).toEqual([]);
	});

	it('a clear during an in-flight hydration is not undone by what that hydration read', async () => {
		writeCheckpoints('d1', [cp('a', 1)]);
		await checkpointsSettled();
		reload();
		const h = hydrateCheckpoints();
		clearCheckpoints();
		await h;
		await checkpointsSettled();
		expect(readCheckpoints('d1')).toEqual([]);
		reload();
		await hydrateCheckpoints();
		expect(readCheckpoints('d1')).toEqual([]);
	});

	it('writes keep working after a clear, for a page that does not reload', async () => {
		clearCheckpoints();
		writeCheckpoints('d1', [cp('a', 1)]);
		await checkpointsSettled();
		reload();
		await hydrateCheckpoints();
		expect(readCheckpoints('d1').map((c) => c.id)).toEqual(['a']);
	});

	it('counts cached bytes for the Privacy & Data row', () => {
		expect(checkpointBytes()).toBe(0);
		writeCheckpoints('d1', [cp('a', 1)]);
		expect(checkpointBytes()).toBeGreaterThan(10);
	});
});

describe('localStorage fallback (no IndexedDB)', () => {
	beforeEach(() => __resetCheckpointStoreForTests({ backend: 'local' }));

	it('reads and writes localStorage as before', () => {
		writeCheckpoints('d1', [cp('a', 1)]);
		expect(JSON.parse(localStorage.getItem(SNAP_PREFIX + 'd1') ?? '[]')).toHaveLength(1);
		expect(readCheckpoints('d1').map((c) => c.id)).toEqual(['a']);
	});

	it('reports a full quota instead of swallowing it', () => {
		const errors: CheckpointWriteError[] = [];
		onCheckpointWriteError((e) => errors.push(e));
		const setItem = Storage.prototype.setItem;
		Storage.prototype.setItem = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		try {
			writeCheckpoints('d1', [cp('a', 1)]);
		} finally {
			Storage.prototype.setItem = setItem;
		}
		expect(errors.map((e) => e.deckId)).toEqual(['d1']);
	});
});
