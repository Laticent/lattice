// checkpoint-store: IndexedDB behind a synchronous cache, one record per checkpoint, failures
// reported, legacy localStorage lists migrated. A "reload" is `__resetCheckpointStoreForTests()`
// with the same fake IndexedDB kept; a second TAB is a second, freshly imported module instance
// over that same database.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Checkpoint, CheckpointWriteError } from './checkpoint-store';
import * as store from './checkpoint-store';

const { SNAP_PREFIX } = store;
const cp = (id: string, ts: number, source = `# ${id}`): Checkpoint => ({ id, ts, label: id, source });
const ids = (list: Checkpoint[]) => list.map((c) => c.id);
const reload = () => store.__resetCheckpointStoreForTests({ backend: 'idb' });

/** A second tab: a fresh module instance over the same IndexedDB and localStorage. */
async function otherTab(): Promise<typeof store> {
	vi.resetModules();
	const tab = await import('./checkpoint-store');
	tab.__resetCheckpointStoreForTests({ backend: 'idb' });
	return tab;
}

const failPuts = () => {
	const put = IDBObjectStore.prototype.put;
	IDBObjectStore.prototype.put = () => {
		throw new DOMException('full', 'QuotaExceededError');
	};
	return () => {
		IDBObjectStore.prototype.put = put;
	};
};

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
	reload();
});
afterEach(() => store.__resetCheckpointStoreForTests());

describe('IndexedDB backend', () => {
	it('an appended checkpoint reads back at once and survives a reload', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		await store.appendCheckpoint('d1', cp('b', 2));
		expect(ids(store.readCheckpoints('d1'))).toEqual(['b', 'a']);
		reload();
		await store.hydrateCheckpoints();
		expect(ids(store.readCheckpoints('d1'))).toEqual(['b', 'a']);
		expect(localStorage.getItem(`${SNAP_PREFIX}d1`)).toBeNull();
	});

	it('keeps the newest 25', async () => {
		for (let i = 0; i < 30; i++) await store.appendCheckpoint('d1', cp(`c${i}`, i));
		reload();
		await store.hydrateCheckpoints();
		const list = ids(store.readCheckpoints('d1'));
		expect(list).toHaveLength(25);
		expect(list[0]).toBe('c29');
		expect(list).not.toContain('c4');
	});

	it('migrates a legacy localStorage list, showing it before hydration finishes', async () => {
		localStorage.setItem(`${SNAP_PREFIX}old`, JSON.stringify([cp('x', 5)]));
		expect(ids(store.readCheckpoints('old')), 'no empty flash before hydration').toEqual(['x']);
		await store.hydrateCheckpoints();
		await store.checkpointsSettled();
		expect(localStorage.getItem(`${SNAP_PREFIX}old`), 'the legacy key goes once IndexedDB holds it').toBeNull();
		reload();
		await store.hydrateCheckpoints();
		expect(ids(store.readCheckpoints('old'))).toEqual(['x']);
	});

	it('a failed migration keeps the legacy key and is not reported as a lost save', async () => {
		localStorage.setItem(`${SNAP_PREFIX}old`, JSON.stringify([cp('x', 5)]));
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		const restore = failPuts();
		try {
			await store.hydrateCheckpoints();
			await store.checkpointsSettled();
		} finally {
			restore();
		}
		expect(errors.map((e) => e.kind)).toEqual(['migrate']);
		expect(localStorage.getItem(`${SNAP_PREFIX}old`), 'retried next load').not.toBeNull();
	});

	it('reports a failed save with its own error, keeps it for the session, and the durable promise says false', async () => {
		await store.hydrateCheckpoints();
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		const restore = failPuts();
		let ok: boolean;
		try {
			ok = await store.appendCheckpoint('d1', cp('a', 1));
		} finally {
			restore();
		}
		expect(ok).toBe(false);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ deckId: 'd1', kind: 'save' });
		expect((errors[0].error as DOMException).name).toBe('QuotaExceededError');
		expect(ids(store.readCheckpoints('d1')), 'still restorable this session').toEqual(['a']);
	});

	it('mapCheckpoints rewrites stored sources', async () => {
		await store.appendCheckpoint('d1', cp('a', 1, 'asset:old'));
		await store.mapCheckpoints('d1', (s) => s.replace('old', 'new'));
		reload();
		await store.hydrateCheckpoints();
		expect(store.readCheckpoints('d1')[0].source).toBe('asset:new');
	});

	it('dropCheckpoints forgets a deleted deck across a reload, even mid-hydration', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		const h = store.hydrateCheckpoints();
		await store.dropCheckpoints('d1');
		await h;
		await store.checkpointsSettled();
		expect(store.readCheckpoints('d1')).toEqual([]);
		expect(store.checkpointBytes()).toBe(0);
		reload();
		await store.hydrateCheckpoints();
		expect(store.readCheckpoints('d1')).toEqual([]);
	});

	it('clearCheckpoints empties IndexedDB and the legacy keys, and says it did', async () => {
		localStorage.setItem(`${SNAP_PREFIX}old`, JSON.stringify([cp('x', 5)]));
		await store.appendCheckpoint('d1', cp('a', 1));
		expect(await store.clearCheckpoints()).toBe(true);
		expect(await store.lastCheckpointClear()).toBe(true);
		expect(localStorage.getItem(`${SNAP_PREFIX}old`)).toBeNull();
		reload();
		await store.hydrateCheckpoints();
		expect(store.readCheckpoints('d1')).toEqual([]);
		expect(store.readCheckpoints('old')).toEqual([]);
	});

	it('a clear during an in-flight hydration is not undone by what that hydration read', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		const h = store.hydrateCheckpoints();
		store.clearCheckpoints();
		await h;
		await store.checkpointsSettled();
		expect(store.readCheckpoints('d1')).toEqual([]);
		reload();
		await store.hydrateCheckpoints();
		expect(store.readCheckpoints('d1')).toEqual([]);
	});

	it('writes keep working after a clear, for a page that does not reload', async () => {
		store.clearCheckpoints();
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		await store.hydrateCheckpoints();
		expect(ids(store.readCheckpoints('d1'))).toEqual(['a']);
	});

	it('does not double-count a deck whose legacy key still exists', async () => {
		localStorage.setItem(`${SNAP_PREFIX}old`, JSON.stringify([cp('x', 5)]));
		const restore = failPuts(); // migration fails, so the legacy key stays
		try {
			await store.hydrateCheckpoints();
			await store.checkpointsSettled();
		} finally {
			restore();
		}
		expect(store.checkpointBytes(), 'the localStorage scan counts it').toBe(0);
		await store.appendCheckpoint('d1', cp('a', 1));
		expect(store.checkpointBytes()).toBeGreaterThan(10);
	});
});

describe('two tabs on one deck', () => {
	it('neither tab erases the version the other saved', async () => {
		await store.appendCheckpoint('d1', cp('s', 1));
		const b = await otherTab();
		await b.hydrateCheckpoints();
		await store.appendCheckpoint('d1', cp('a1', 2)); // tab A
		await b.appendCheckpoint('d1', cp('b1', 3)); // tab B, whose cache predates a1
		expect(ids(b.readCheckpoints('d1')), 'B folds in what A saved').toEqual(['b1', 'a1', 's']);
		const c = await otherTab();
		await c.hydrateCheckpoints();
		expect(ids(c.readCheckpoints('d1'))).toEqual(['b1', 'a1', 's']);
	});

	it('a clear in one tab is not undone by a save in the other', async () => {
		await store.appendCheckpoint('d1', cp('s1', 1));
		await store.appendCheckpoint('d1', cp('s2', 2));
		const b = await otherTab();
		await b.hydrateCheckpoints();
		await store.clearCheckpoints(); // tab A
		await b.appendCheckpoint('d1', cp('b1', 3)); // tab B
		const c = await otherTab();
		await c.hydrateCheckpoints();
		expect(ids(c.readCheckpoints('d1'))).toEqual(['b1']);
	});
});

describe('localStorage fallback (no IndexedDB)', () => {
	beforeEach(() => store.__resetCheckpointStoreForTests({ backend: 'local' }));

	it('reads and writes localStorage, re-reading it on each change', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		localStorage.setItem(`${SNAP_PREFIX}d1`, JSON.stringify([cp('other-tab', 5), cp('a', 1)]));
		await store.appendCheckpoint('d1', cp('b', 9));
		expect(ids(store.readCheckpoints('d1'))).toEqual(['b', 'other-tab', 'a']);
	});

	it('reports a full quota as a failed save, keeping its name', async () => {
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		const setItem = Storage.prototype.setItem;
		Storage.prototype.setItem = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		let ok: boolean;
		try {
			ok = await store.appendCheckpoint('d1', cp('a', 1));
		} finally {
			Storage.prototype.setItem = setItem;
		}
		expect(ok).toBe(false);
		expect(errors.map((e) => [e.deckId, e.kind, (e.error as DOMException).name])).toEqual([['d1', 'save', 'QuotaExceededError']]);
	});
});
