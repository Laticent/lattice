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

/** A second tab: a fresh module instance over the same IndexedDB and localStorage. Each is reset
 *  after its test (which closes its BroadcastChannel), or it keeps hearing later tests' broadcasts and
 *  reading through their patched prototypes (HARD RULE #32: each test its own state). */
const tabs: (typeof store)[] = [];
async function otherTab(): Promise<typeof store> {
	vi.resetModules();
	const tab = await import('./checkpoint-store');
	tab.__resetCheckpointStoreForTests({ backend: 'idb' });
	tabs.push(tab);
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
afterEach(() => {
	store.__resetCheckpointStoreForTests();
	for (const tab of tabs.splice(0)) tab.__resetCheckpointStoreForTests();
});

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

// The boot reads only the deck it shows (engineering/decisions/2026-11-11-studio-storage-pointer-records.md).
describe('one deck at a time', () => {
	/** Every `getAll` query: `'all'` for an unranged read of the whole store, else the deck it asked for. */
	const watchReads = () => {
		const getAll = IDBObjectStore.prototype.getAll;
		const seen: string[] = [];
		IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, query?: IDBValidKey | IDBKeyRange | null, count?: number) {
			seen.push(query instanceof IDBKeyRange ? String((query.lower as string[])[0]) : 'all');
			return getAll.call(this, query, count);
		};
		return { seen, restore: () => (IDBObjectStore.prototype.getAll = getAll) };
	};

	it('showing a deck reads that deck, never the whole store', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		await store.appendCheckpoint('d2', cp('b', 2));
		reload();
		const reads = watchReads();
		try {
			store.readCheckpoints('d1');
			await store.hydrateDeckCheckpoints('d1');
		} finally {
			reads.restore();
		}
		expect(reads.seen).toEqual(['d1']);
		expect(ids(store.readCheckpoints('d1'))).toEqual(['a']);
		expect(store.checkpointBytes(), 'd2 was never read into memory').toBe('d1'.length + JSON.stringify([cp('a', 1)]).length);
	});

	it('a deck opened later reads its own records then', async () => {
		await store.appendCheckpoint('d2', cp('b', 2));
		reload();
		await store.hydrateDeckCheckpoints('d1');
		expect(store.readCheckpoints('d2'), 'not loaded yet, and it has no legacy list').toEqual([]);
		await store.hydrateDeckCheckpoints('d2');
		expect(ids(store.readCheckpoints('d2'))).toEqual(['b']);
	});

	it('a deck deleted while its read is in flight stays deleted', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		const h = store.hydrateDeckCheckpoints('d1');
		await store.dropCheckpoints('d1');
		await h;
		expect(store.readCheckpoints('d1')).toEqual([]);
	});

	it('one deck whose read fails leaves the session on IndexedDB, and its next read tries again', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		await store.appendCheckpoint('d2', cp('b', 2));
		reload();
		const getAll = IDBObjectStore.prototype.getAll;
		IDBObjectStore.prototype.getAll = () => {
			throw new DOMException('dropped', 'InvalidStateError');
		};
		try {
			await store.hydrateDeckCheckpoints('d1');
		} finally {
			IDBObjectStore.prototype.getAll = getAll;
		}
		expect(localStorage.getItem(`${SNAP_PREFIX}d1`), 'nothing copied into localStorage').toBeNull();
		await store.hydrateDeckCheckpoints('d2');
		expect(ids(store.readCheckpoints('d2')), 'other decks still read from IndexedDB').toEqual(['b']);
		await store.hydrateDeckCheckpoints('d1');
		expect(ids(store.readCheckpoints('d1')), 'the failed deck reads on its next try').toEqual(['a']);
	});

	it('a read that fails once is retried in the same call', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		const getAll = IDBObjectStore.prototype.getAll;
		let failures = 1;
		IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
			if (failures-- > 0) throw new DOMException('dropped', 'InvalidStateError');
			return getAll.apply(this, args);
		};
		try {
			await store.hydrateDeckCheckpoints('d1');
		} finally {
			IDBObjectStore.prototype.getAll = getAll;
		}
		expect(ids(store.readCheckpoints('d1'))).toEqual(['a']);
	});

	it('a read that keeps failing is reported once, as a read', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		const getAll = IDBObjectStore.prototype.getAll;
		IDBObjectStore.prototype.getAll = () => {
			throw new DOMException('dropped', 'InvalidStateError');
		};
		try {
			await store.hydrateDeckCheckpoints('d1');
			await store.hydrateDeckCheckpoints('d1');
		} finally {
			IDBObjectStore.prototype.getAll = getAll;
		}
		expect(errors.map((e) => [e.deckId, e.kind])).toEqual([['d1', 'read']]);
	});

	it('a database that will not open moves the session to localStorage, legacy list and new versions included', async () => {
		localStorage.setItem(`${SNAP_PREFIX}d1`, JSON.stringify([cp('x', 1)]));
		globalThis.indexedDB = {
			open: () => {
				throw new DOMException('no', 'UnknownError');
			},
		} as unknown as IDBFactory;
		reload();
		await store.hydrateDeckCheckpoints('d1');
		expect(ids(store.readCheckpoints('d1'))).toEqual(['x']);
		expect(await store.appendCheckpoint('d1', cp('y', 2))).toBe(true);
		expect(ids(JSON.parse(localStorage.getItem(`${SNAP_PREFIX}d1`) ?? '[]'))).toEqual(['y', 'x']);
	});

	it('a version saved after a reopen fails moves to localStorage instead of vanishing', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		await store.hydrateDeckCheckpoints('d1');
		// Another tab upgrades the database: this connection closes, and its reopen at the old version fails.
		await new Promise<void>((resolve, reject) => {
			const req = indexedDB.open('lattice-studio-versions', 2);
			req.onsuccess = () => {
				req.result.close();
				resolve();
			};
			req.onerror = () => reject(req.error);
		});
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		expect(await store.appendCheckpoint('d1', cp('b', 2)), 'durable in localStorage, so the caller may proceed').toBe(true);
		expect(ids(JSON.parse(localStorage.getItem(`${SNAP_PREFIX}d1`) ?? '[]')), 'the cache, this version included').toEqual(['b', 'a']);
		expect(errors, 'nothing was lost, so nothing to report').toEqual([]);
	});

	const upgradeElsewhere = () =>
		new Promise<void>((resolve, reject) => {
			const req = indexedDB.open('lattice-studio-versions', 2);
			req.onsuccess = () => {
				req.result.close();
				resolve();
			};
			req.onerror = () => reject(req.error);
		});

	it('a version that reaches neither store after a failed reopen says not saved, and is reported', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		await store.hydrateDeckCheckpoints('d1');
		await upgradeElsewhere();
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		const setItem = Storage.prototype.setItem;
		Storage.prototype.setItem = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		let ok: boolean;
		try {
			ok = await store.appendCheckpoint('d1', cp('b', 2));
		} finally {
			Storage.prototype.setItem = setItem;
		}
		expect(ok, 'never tell a caller it is saved when it is not').toBe(false);
		expect(errors.map((e) => [e.deckId, e.kind])).toEqual([['d1', 'save']]);
	});

	it('after a failed reopen, a save and a concurrent source rewrite of the same deck both report saved', async () => {
		await store.appendCheckpoint('d1', cp('a', 1, 'asset:old'));
		await store.hydrateDeckCheckpoints('d1');
		await upgradeElsewhere();
		const [added, mapped] = await Promise.all([store.appendCheckpoint('d1', cp('b', 2)), store.mapCheckpoints('d1', (src) => src.replace('old', 'new'))]);
		const stored = JSON.parse(localStorage.getItem(`${SNAP_PREFIX}d1`) ?? '[]') as Checkpoint[];
		expect(stored.map((c) => [c.id, c.source])).toEqual([
			['b', '# b'],
			['a', 'asset:new'],
		]);
		expect([added, mapped]).toEqual([true, true]);
	});

	it('the author joining the idle sweep\'s quiet read of a deck still hears that it failed', async () => {
		await store.appendCheckpoint('x', cp('a', 1));
		reload();
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		const getAll = IDBObjectStore.prototype.getAll;
		IDBObjectStore.prototype.getAll = () => {
			throw new DOMException('dropped', 'InvalidStateError');
		};
		try {
			const quiet = store.hydrateDeckCheckpoints('x', { quiet: true });
			const author = store.hydrateDeckCheckpoints('x');
			await Promise.all([quiet, author]);
		} finally {
			IDBObjectStore.prototype.getAll = getAll;
		}
		expect(errors.map((e) => [e.deckId, e.kind])).toEqual([['x', 'read']]);
	});

	it('a whole-store read that fails rejects, so a backup says so, and the next call tries again', async () => {
		await store.appendCheckpoint('d2', cp('b', 2));
		reload();
		const getAll = IDBObjectStore.prototype.getAll;
		IDBObjectStore.prototype.getAll = () => {
			throw new DOMException('dropped', 'InvalidStateError');
		};
		try {
			await expect(store.hydrateCheckpoints()).rejects.toThrow();
		} finally {
			IDBObjectStore.prototype.getAll = getAll;
		}
		expect(localStorage.getItem(`${SNAP_PREFIX}d2`), 'no fallback copy').toBeNull();
		await store.hydrateCheckpoints();
		expect(ids(store.readCheckpoints('d2'))).toEqual(['b']);
	});

	it('a deck read during a failing whole-store read does its own read, and nothing rejects unhandled', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		const getAll = IDBObjectStore.prototype.getAll;
		IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, query?: IDBValidKey | IDBKeyRange | null, count?: number) {
			if (query === undefined) throw new DOMException('dropped', 'InvalidStateError'); // the whole-store read only
			return getAll.call(this, query, count);
		};
		try {
			const whole = store.hydrateCheckpoints().then(
				() => 'loaded',
				() => 'rejected',
			);
			await store.hydrateDeckCheckpoints('d1');
			expect(await whole).toBe('rejected');
		} finally {
			IDBObjectStore.prototype.getAll = getAll;
		}
		expect(ids(store.readCheckpoints('d1'))).toEqual(['a']);
	});

	it('the idle migration reads quietly: a deck the author never opened raises no notice', async () => {
		const idle = (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
		(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = (fn: () => void) => setTimeout(fn, 0);
		localStorage.setItem(`${SNAP_PREFIX}never-opened`, JSON.stringify([cp('x', 5)]));
		const errors: CheckpointWriteError[] = [];
		store.onCheckpointWriteError((e) => errors.push(e));
		const getAll = IDBObjectStore.prototype.getAll;
		let swept = false;
		IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, query?: IDBValidKey | IDBKeyRange | null, count?: number) {
			if (query instanceof IDBKeyRange && (query.lower as string[])[0] === 'never-opened') {
				swept = true;
				throw new DOMException('dropped', 'InvalidStateError');
			}
			return getAll.call(this, query, count);
		};
		try {
			await store.hydrateDeckCheckpoints('d1');
			await vi.waitFor(() => expect(swept).toBe(true));
			await store.checkpointsSettled();
		} finally {
			IDBObjectStore.prototype.getAll = getAll;
			(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = idle;
		}
		expect(errors).toEqual([]);
	});

	it('a version saved before its deck has loaded shows the whole history, and the view hears it', async () => {
		await store.appendCheckpoint('d1', cp('a', 1));
		reload();
		const seen: string[][] = [];
		store.onCheckpointsChanged(() => seen.push(ids(store.readCheckpoints('d1'))));
		await store.appendCheckpoint('d1', cp('b', 2));
		await store.checkpointsSettled();
		expect(seen.at(-1)).toEqual(['b', 'a']);
	});

	it('a version saved before its deck has loaded keeps the deck\'s legacy list in view', async () => {
		localStorage.setItem(`${SNAP_PREFIX}old`, JSON.stringify([cp('x', 1)]));
		await store.appendCheckpoint('old', cp('y', 2));
		await store.checkpointsSettled();
		expect(ids(store.readCheckpoints('old'))).toEqual(['y', 'x']);
		reload();
		await store.hydrateDeckCheckpoints('old');
		expect(ids(store.readCheckpoints('old')), 'and both are stored').toEqual(['y', 'x']);
	});

	it('the legacy list of a deck this page never opens still migrates, once the page is idle', async () => {
		const idle = (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
		(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = (fn: () => void) => setTimeout(fn, 0);
		try {
			localStorage.setItem(`${SNAP_PREFIX}never-opened`, JSON.stringify([cp('x', 5)]));
			await store.hydrateDeckCheckpoints('d1');
			await vi.waitFor(() => expect(localStorage.getItem(`${SNAP_PREFIX}never-opened`)).toBeNull());
		} finally {
			(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = idle;
		}
		reload();
		await store.hydrateDeckCheckpoints('never-opened');
		expect(ids(store.readCheckpoints('never-opened'))).toEqual(['x']);
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
