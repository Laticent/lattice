/**
 * The memory backing: a vault that lives in one JavaScript realm. For tests, and for any host that has
 * no durable storage. Each store is a plain object, so a test can keep the stores, drop the vault, and
 * open a new vault over them: that is a restart, and the startup scan runs again.
 */
import { type BlobStore, type IndexStore, memoryLocks } from './backing';
import { type OpenOptions, openVault } from './core';
import type { JournalRecord, Rec, VaultHandle } from './types';

export interface MemoryBlobStore extends BlobStore {
	/** The raw bytes by blob name: a test reaches in here to tear or drop a blob. */
	readonly raw: Map<string, Uint8Array>;
}

export function memoryBlobs(): MemoryBlobStore {
	const raw = new Map<string, Uint8Array>();
	return {
		raw,
		async put(sha, bytes) {
			raw.set(sha, new Uint8Array(bytes));
		},
		async get(sha) {
			const b = raw.get(sha);
			return b ? new Blob([new Uint8Array(b)]) : null;
		},
		async delete(sha) {
			raw.delete(sha);
		},
		async names() {
			return [...raw.keys()];
		},
	};
}

export interface MemoryIndexStore extends IndexStore {
	readonly records: Map<string, Rec>;
	readonly log: JournalRecord[];
	readonly meta: Map<string, unknown>;
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

export function memoryIndex(): MemoryIndexStore {
	const records = new Map<string, Rec>();
	const log: JournalRecord[] = [];
	const meta = new Map<string, unknown>();
	let seq = 0;
	return {
		records,
		log,
		meta,
		async get(path) {
			return clone(records.get(path));
		},
		async under(dir) {
			return [...records.values()].filter((r) => dir === '' || r.path.startsWith(`${dir}/`)).map(clone);
		},
		async apply(paths, plan) {
			const { puts, journal, result } = plan(paths.map((p) => clone(records.get(p))));
			for (const r of puts) records.set(r.path, clone(r));
			for (const j of journal) log.push({ ...j, seq: ++seq });
			return result;
		},
		async mark(recs) {
			for (const r of recs) records.set(r.path, clone(r));
		},
		async refs(sha) {
			let n = 0;
			for (const r of records.values()) if (!r.deleted && r.sha256 === sha) n++;
			return n;
		},
		async journal(after) {
			return log.filter((j) => j.seq > after).map(clone);
		},
		async trimJournal(through) {
			let i = 0;
			while (i < log.length && log[i].seq <= through) i++;
			log.splice(0, i);
		},
		async getMeta<T>(key: string) {
			return clone(meta.get(key)) as T | undefined;
		},
		async setMeta(key, value) {
			meta.set(key, clone(value));
		},
		async metaOnce<T>(key: string, make: () => T) {
			if (!meta.has(key)) meta.set(key, make());
			return clone(meta.get(key)) as T;
		},
		async bump(key) {
			const n = ((meta.get(key) as number | undefined) ?? 0) + 1;
			meta.set(key, n);
			return n;
		},
		close() {},
	};
}

/** A memory vault. Pass `blobs` and `index` from an earlier one to reopen it (a simulated restart). */
export function openMemoryVault(opts: Partial<OpenOptions> = {}): Promise<VaultHandle> {
	return openVault({ blobs: memoryBlobs(), index: memoryIndex(), locks: memoryLocks(), ...opts });
}
