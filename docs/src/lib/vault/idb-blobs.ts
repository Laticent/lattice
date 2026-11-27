/**
 * The IndexedDB blob store: the vault's bytes where OPFS is refused (decision D1 on #3442, option B).
 *
 * WebKit refuses OPFS in an ephemeral session (`getDirectory()` throws UnknownError, measured 2026-11-22), and
 * a Safari private window probably does too, while IndexedDB still works. Rather than give those hosts no
 * vault, the browser backing keeps the same interface and stores each blob as one row of its own database,
 * `lattice-vault-blobs`, keyed by its SHA-256. The index stays in `lattice-vault`, unchanged.
 *
 * A SEPARATE DATABASE, so `lattice-vault`'s schema keeps version 1 and an OPFS host never opens this one.
 * The two databases need no shared transaction: the crash rule is the same as OPFS's. A write stores its
 * blob, then commits the index; a crash in between leaves a row no record names, and the startup scan's
 * sweep deletes it through `names()`. A `put` is one transaction, so a blob is never half-written.
 *
 * A BLOB FIRST, AN ARRAYBUFFER WHEN THE ENGINE REFUSES ONE. A stored Blob comes back file-backed, so a shelf
 * of photos is not held in memory. Safari in a private window refuses to store a Blob at all ("UnknownError:
 * Error preparing Blob/File data to be stored in object store", reproduced on real WebKit for
 * `media-store.ts`), and stores an ArrayBuffer fine. So `put` tries the Blob and, on that refusal, stores
 * the bytes as a buffer; `get` hands back a Blob either way.
 */
import type { BlobStore } from './backing';
import { VaultError } from './types';

export const VAULT_BLOB_DB = 'lattice-vault-blobs';
const BLOBS = 'blobs';

type Row = { sha: string; blob?: Blob; data?: ArrayBuffer };

const req = <T>(r: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});

const done = (tx: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		// `tx.error` is still null while a request's error bubbles, so take the request's own (the checker's finding):
		// a null rejection hid a QuotaExceededError from every caller.
		tx.onerror = (e) => reject(tx.error ?? (e.target as IDBRequest | null)?.error ?? new Error('vault: blob write failed'));
		tx.onabort = () => reject(tx.error ?? new Error('vault: blob transaction aborted'));
	});

export interface IdbBlobStore extends BlobStore {
	/** How many `put`s stored a Blob and how many fell back to an ArrayBuffer: what the e2e reads per engine. */
	readonly stored: { blob: number; buffer: number };
	close(): void;
}

export function idbBlobs(name: string = VAULT_BLOB_DB, idb: IDBFactory = indexedDB): IdbBlobStore {
	let dbp: Promise<IDBDatabase> | null = null;
	let closed = false;
	// Once an engine refuses a Blob, stop offering one: every later put would fail the same way first.
	let buffersOnly = false;
	const stored = { blob: 0, buffer: 0 };
	const db = () => {
		if (closed) return Promise.reject(new VaultError('unavailable', 'vault: the blob store is closed'));
		dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
			const open = idb.open(name, 1);
			open.onupgradeneeded = () => {
				open.result.createObjectStore(BLOBS, { keyPath: 'sha' });
			};
			open.onsuccess = () => {
				const d = open.result;
				d.onversionchange = () => {
					d.close();
					dbp = null;
				};
				resolve(d);
			};
			open.onerror = () => reject(open.error);
			open.onblocked = () => reject(new VaultError('unavailable', 'vault: the blob store is blocked by another tab'));
		});
		dbp.catch(() => {
			dbp = null;
		});
		return dbp;
	};
	const write = async (row: Row) => {
		const tx = (await db()).transaction(BLOBS, 'readwrite');
		const finished = done(tx);
		finished.catch(() => {});
		try {
			tx.objectStore(BLOBS).put(row);
		} catch (err) {
			// A structured-clone refusal throws synchronously from put() on some engines, and fails the request on others.
			try {
				tx.abort();
			} catch {
				// already finished
			}
			throw err;
		}
		await finished;
	};
	return {
		stored,
		async put(sha, bytes) {
			const own = new Uint8Array(bytes);
			if (!buffersOnly) {
				try {
					await write({ sha, blob: new Blob([own]) });
					stored.blob++;
					return;
				} catch (err) {
					// A full disk fails the buffer the same way; say so rather than try twice.
					if ((err as Error)?.name === 'QuotaExceededError') throw err;
					buffersOnly = true;
				}
			}
			await write({ sha, data: own.buffer.slice(own.byteOffset, own.byteOffset + own.byteLength) });
			stored.buffer++;
		},
		async get(sha) {
			const tx = (await db()).transaction(BLOBS, 'readonly');
			const row = (await req(tx.objectStore(BLOBS).get(sha))) as Row | undefined;
			if (!row) return null;
			if (row.blob) return row.blob;
			return row.data ? new Blob([row.data]) : null;
		},
		async delete(sha) {
			const tx = (await db()).transaction(BLOBS, 'readwrite');
			tx.objectStore(BLOBS).delete(sha);
			await done(tx);
		},
		async names() {
			const tx = (await db()).transaction(BLOBS, 'readonly');
			return ((await req(tx.objectStore(BLOBS).getAllKeys())) as IDBValidKey[]).map(String);
		},
		close() {
			closed = true;
			dbp?.then((d) => d.close()).catch(() => {});
			dbp = null;
		},
	};
}
