/**
 * The browser index: IndexedDB database `lattice-vault`. Three stores:
 *   entries  one record per path (live, tombstone or damaged), keyed by path, indexed by sha256
 *   journal  the sync journal, keyed by an auto-increment seq
 *   meta     the device id, the per-device seq, the scan's high-water mark
 * An `apply` is one readwrite transaction over entries and journal, so a record and its journal line
 * land together or not at all. The device id lives in `meta`, never in `entries`, so nothing built from
 * the vault's files (a backup) can carry it.
 */
import type { IndexStore, Plan } from './backing';
import { type JournalRecord, type Rec, VaultError } from './types';

export const VAULT_DB = 'lattice-vault';
const ENTRIES = 'entries';
const JOURNAL = 'journal';
const META = 'meta';
const BY_SHA = 'sha256';

const req = <T>(r: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});

const done = (tx: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error('vault: transaction aborted'));
	});

function prefixRange(dir: string): IDBKeyRange | undefined {
	// Every path under `dir/` sorts between `dir/` and `dir0` ('0' is the character after '/').
	return dir === '' ? undefined : IDBKeyRange.bound(`${dir}/`, `${dir}0`, false, true);
}

export function idbIndex(name: string = VAULT_DB, idb: IDBFactory = indexedDB): IndexStore {
	let dbp: Promise<IDBDatabase> | null = null;
	let closed = false;
	const db = () => {
		if (closed) return Promise.reject(new VaultError('unavailable', 'vault: the index is closed'));
		dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
			const open = idb.open(name, 1);
			open.onupgradeneeded = () => {
				const d = open.result;
				d.createObjectStore(ENTRIES, { keyPath: 'path' }).createIndex(BY_SHA, 'sha256', { unique: false });
				d.createObjectStore(JOURNAL, { keyPath: 'seq', autoIncrement: true });
				d.createObjectStore(META);
			};
			open.onsuccess = () => {
				const d = open.result;
				// Another tab deleting or upgrading the database must not hang behind this connection.
				d.onversionchange = () => {
					d.close();
					dbp = null;
				};
				resolve(d);
			};
			open.onerror = () => reject(open.error);
			open.onblocked = () => reject(new VaultError('unavailable', 'vault: the index is blocked by another tab'));
		});
		dbp.catch(() => {
			dbp = null;
		});
		return dbp;
	};

	return {
		async get(path) {
			const tx = (await db()).transaction(ENTRIES, 'readonly');
			return (await req(tx.objectStore(ENTRIES).get(path))) as Rec | undefined;
		},
		async under(dir) {
			const tx = (await db()).transaction(ENTRIES, 'readonly');
			return (await req(tx.objectStore(ENTRIES).getAll(prefixRange(dir)))) as Rec[];
		},
		async apply<T>(paths: readonly string[], plan: (current: (Rec | undefined)[]) => Plan<T>): Promise<T> {
			const tx = (await db()).transaction([ENTRIES, JOURNAL], 'readwrite');
			const finished = done(tx);
			finished.catch(() => {});
			const entries = tx.objectStore(ENTRIES);
			let result: T;
			try {
				const current = (await Promise.all(paths.map((p) => req(entries.get(p))))) as (Rec | undefined)[];
				const p = plan(current);
				for (const r of p.puts) entries.put(r);
				const journal = tx.objectStore(JOURNAL);
				for (const j of p.journal) journal.add(j);
				result = p.result;
			} catch (err) {
				try {
					tx.abort();
				} catch {
					// already finished
				}
				throw err;
			}
			await finished;
			return result;
		},
		async mark(recs) {
			const tx = (await db()).transaction(ENTRIES, 'readwrite');
			for (const r of recs) tx.objectStore(ENTRIES).put(r);
			await done(tx);
		},
		async refs(sha) {
			const tx = (await db()).transaction(ENTRIES, 'readonly');
			const all = (await req(tx.objectStore(ENTRIES).index(BY_SHA).getAll(sha))) as Rec[];
			return all.filter((r) => !r.deleted).length;
		},
		async journal(after) {
			const tx = (await db()).transaction(JOURNAL, 'readonly');
			return (await req(tx.objectStore(JOURNAL).getAll(IDBKeyRange.lowerBound(after, true)))) as JournalRecord[];
		},
		async trimJournal(through) {
			const tx = (await db()).transaction(JOURNAL, 'readwrite');
			tx.objectStore(JOURNAL).delete(IDBKeyRange.upperBound(through));
			await done(tx);
		},
		async getMeta<T>(key: string) {
			const tx = (await db()).transaction(META, 'readonly');
			return (await req(tx.objectStore(META).get(key))) as T | undefined;
		},
		async setMeta(key, value) {
			const tx = (await db()).transaction(META, 'readwrite');
			tx.objectStore(META).put(value, key);
			await done(tx);
		},
		async metaOnce<T>(key: string, make: () => T) {
			const tx = (await db()).transaction(META, 'readwrite');
			const store = tx.objectStore(META);
			let v = (await req(store.get(key))) as T | undefined;
			if (v === undefined) {
				v = make();
				store.put(v, key);
			}
			await done(tx);
			return v;
		},
		async bump(key) {
			const tx = (await db()).transaction(META, 'readwrite');
			const store = tx.objectStore(META);
			const n = (((await req(store.get(key))) as number | undefined) ?? 0) + 1;
			store.put(n, key);
			await done(tx);
			return n;
		},
		close() {
			closed = true;
			dbp?.then((d) => d.close()).catch(() => {});
			dbp = null;
		},
	};
}
