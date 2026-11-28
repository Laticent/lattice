/**
 * The browser backing: bytes in OPFS, written through a dedicated worker (or, where OPFS is refused, in
 * IndexedDB `lattice-vault-blobs`: `idb-blobs.ts`); the index and the journal in
 * IndexedDB `lattice-vault`; changes to other tabs over a BroadcastChannel; locks from `navigator.locks`.
 *
 * Reads come straight from the main thread (`getFile()` is a file-backed Blob on every engine). Only
 * writes go through the worker.
 */
import type { BlobStore } from './backing';
import { type OpenOptions, openVault } from './core';
import { idbBlobs, VAULT_BLOB_DB } from './idb-blobs';
import { idbIndex, VAULT_DB } from './idb-index';
import { BLOB_DIR, blobDir, type WritePath } from './opfs-write';
import { VaultError, type VaultHandle } from './types';

/** The OPFS folder the browser vault keeps its blobs in. */
export const VAULT_ROOT = 'lattice-vault';

/** Writes a blob somewhere off the main thread and says which OPFS path it took. */
export interface BlobWriter {
	put(sha: string, bytes: Uint8Array): Promise<WritePath>;
	probe(): Promise<WritePath>;
	close(): void;
}

interface WorkerLike {
	postMessage(m: unknown, transfer?: Transferable[]): void;
	addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
	addEventListener(type: 'error', fn: (e: ErrorEvent) => void): void;
	addEventListener(type: 'messageerror', fn: (e: MessageEvent) => void): void;
	terminate(): void;
}

/** A `BlobWriter` over the vault worker (or any worker that speaks its protocol). */
export function workerWriter(worker: WorkerLike, root: string = VAULT_ROOT): BlobWriter {
	let next = 0;
	const pending = new Map<number, { resolve: (p: WritePath) => void; reject: (e: Error) => void }>();
	// A worker that failed or was closed never answers again. Every pending and later call must fail
	// rather than hang: a write that never settles holds the vault lock, and that wedges every tab.
	let dead: VaultError | null = null;
	const die = (err: VaultError) => {
		dead ??= err;
		for (const p of pending.values()) p.reject(dead);
		pending.clear();
	};
	worker.addEventListener('message', (e: MessageEvent) => {
		const d = e.data as { id: number; ok: boolean; path?: WritePath; name?: string; message?: string };
		const p = pending.get(d.id);
		if (!p) return;
		pending.delete(d.id);
		if (d.ok && d.path) p.resolve(d.path);
		else p.reject(Object.assign(new Error(d.message ?? 'vault: the worker write failed'), { name: d.name ?? 'Error' }));
	});
	worker.addEventListener('error', (e: ErrorEvent) => die(new VaultError('unavailable', `vault: the write worker failed: ${e.message}`)));
	worker.addEventListener('messageerror', () => die(new VaultError('unavailable', 'vault: the write worker sent a message that could not be read')));
	const call = (msg: Record<string, unknown>, transfer: Transferable[] = []) =>
		new Promise<WritePath>((resolve, reject) => {
			if (dead) {
				reject(dead);
				return;
			}
			const id = ++next;
			pending.set(id, { resolve, reject });
			worker.postMessage({ ...msg, id, root }, transfer);
		});
	return {
		put: (sha, bytes) => {
			// Copy so the transfer never detaches a buffer the caller still holds.
			const own = new Uint8Array(bytes);
			return call({ op: 'put', sha, bytes: own }, [own.buffer]);
		},
		probe: () => call({ op: 'probe' }),
		close: () => {
			worker.terminate();
			die(new VaultError('unavailable', 'vault: the write worker is closed'));
		},
	};
}

export interface OpfsBlobStore extends BlobStore {
	/** How many `put`s took each write path: what the e2e reads to prove the worker path per engine. */
	readonly paths: Record<WritePath, number>;
}

/** Blobs in OPFS under `root`: written by `writer`, read and listed from this thread. */
export function opfsBlobs(root: () => Promise<FileSystemDirectoryHandle>, writer: BlobWriter): OpfsBlobStore {
	const paths: Record<WritePath, number> = { 'sync-access-handle': 0, writable: 0 };
	const isMissing = (err: unknown) => (err as Error)?.name === 'NotFoundError';
	return {
		paths,
		async put(sha, bytes) {
			paths[await writer.put(sha, bytes)]++;
		},
		async get(sha) {
			try {
				const dir = await blobDir(await root(), sha, false);
				return await (await dir.getFileHandle(sha)).getFile();
			} catch (err) {
				if (isMissing(err)) return null;
				throw err;
			}
		},
		async delete(sha) {
			try {
				const dir = await blobDir(await root(), sha, false);
				await dir.removeEntry(sha);
			} catch (err) {
				if (!isMissing(err)) throw err;
			}
		},
		async names() {
			const out: string[] = [];
			let blobs: FileSystemDirectoryHandle;
			try {
				blobs = await (await root()).getDirectoryHandle(BLOB_DIR);
			} catch (err) {
				if (isMissing(err)) return out;
				throw err;
			}
			const iter = (d: FileSystemDirectoryHandle) => (d as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
			for await (const shard of iter(blobs)) {
				if (shard.kind !== 'directory') continue;
				for await (const f of iter(shard as FileSystemDirectoryHandle)) if (f.kind === 'file') out.push(f.name);
			}
			return out;
		},
	};
}

/** Where a browser vault keeps its bytes: OPFS files, or rows of `lattice-vault-blobs` where OPFS is refused. */
export type BlobBacking = 'opfs' | 'indexeddb';

/** The index meta key that records which blob store a vault chose. Set once, never changed. */
export const BLOB_BACKING_KEY = 'blobBacking';

/** Can this browser hold a vault at all? IndexedDB is the floor: OPFS and workers are preferred, not required. */
export function browserVaultSupported(): boolean {
	return typeof indexedDB !== 'undefined';
}

const opfsPossible = () => typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function' && typeof Worker !== 'undefined';

export interface BrowserVault extends VaultHandle {
	/** Where this vault keeps its bytes. */
	readonly blobBacking: BlobBacking;
	/** How many blob writes took each OPFS write path this session (zeros on the IndexedDB blob store). */
	readonly writePaths: Readonly<Record<WritePath, number>>;
	/** Which write path this engine offers: the worker's answer on OPFS, `indexeddb` otherwise. */
	probeWritePath(): Promise<WritePath | 'indexeddb'>;
}

/**
 * Open the browser vault. Bytes go to OPFS where the engine allows it and to IndexedDB where it refuses
 * (D1 on #3442). Throws `unavailable` only without IndexedDB, or when a vault that chose OPFS finds it refused.
 *
 * THE CHOICE IS RECORDED AND KEPT. The first open writes `blobBacking` into the index's meta, and every later
 * open uses that store. Falling back per open would be unsafe: an OPFS refusal that passes (a storage hiccup, a
 * private window over a normal profile's index) would open an empty blob store, and the startup scan would then
 * mark every file damaged. A vault that chose IndexedDB stays there even once OPFS works, for the same reason.
 */
export async function openBrowserVault(
	opts: Partial<OpenOptions> & { dbName?: string; blobDbName?: string; root?: string; forceBlobBacking?: BlobBacking } = {},
): Promise<BrowserVault> {
	if (!browserVaultSupported()) throw new VaultError('unavailable', 'vault: this browser has no IndexedDB');
	const rootName = opts.root ?? VAULT_ROOT;
	const dbName = opts.dbName ?? VAULT_DB;
	// Probe OPFS before anything else. An engine can expose `getDirectory` and still refuse it: WebKit
	// does in an ephemeral session (Playwright's default WebKit context throws UnknownError, measured
	// 2026-11-22), and a private window may too.
	let top: FileSystemDirectoryHandle | null = null;
	let refusal = 'this browser has no OPFS or workers';
	if (opts.forceBlobBacking !== 'indexeddb' && opfsPossible()) {
		try {
			top = await navigator.storage.getDirectory();
		} catch (err) {
			refusal = `this browser refused OPFS (${(err as Error)?.name ?? 'Error'}: ${(err as Error)?.message ?? err})`;
		}
	}
	const index = opts.index ?? idbIndex(dbName);
	let backing: BlobBacking;
	try {
		let recorded = await index.getMeta<BlobBacking>(BLOB_BACKING_KEY);
		// A slice-1 vault recorded nothing and kept its bytes in OPFS. If it holds anything (a journal line, or a record
		// once a journal is trimmed), it chose OPFS.
		if (recorded === undefined && !top && ((await index.journal(0)).length > 0 || (await index.under('')).length > 0)) recorded = 'opfs';
		backing = recorded ?? (await index.metaOnce<BlobBacking>(BLOB_BACKING_KEY, () => (top ? 'opfs' : 'indexeddb')));
		if (backing === 'opfs' && !top) throw new VaultError('unavailable', `vault: this vault keeps its files in OPFS, and ${refusal}`);
	} catch (err) {
		if (!opts.index) index.close();
		throw err;
	}
	const channel = opts.channel !== undefined ? opts.channel : typeof BroadcastChannel === 'function' ? new BroadcastChannel(dbName) : null;
	let writer: BlobWriter | null = null;
	let blobs: BlobStore & { close?: () => void };
	let writePaths: Record<WritePath, number> = { 'sync-access-handle': 0, writable: 0 };
	if (backing === 'opfs' && top) {
		const dir = top;
		let rootP: Promise<FileSystemDirectoryHandle> | null = null;
		const root = () => {
			rootP ??= dir.getDirectoryHandle(rootName, { create: true });
			return rootP;
		};
		let worker: Worker;
		try {
			worker = new Worker(new URL('./opfs.worker.ts', import.meta.url), { type: 'module', name: 'lattice-vault' });
		} catch (err) {
			// A refused worker (a CSP, a SecurityError) must not leak the channel and index opened above.
			channel?.close();
			if (!opts.index) index.close();
			throw err;
		}
		writer = workerWriter(worker, rootName);
		const opfs = opfsBlobs(root, writer);
		writePaths = opfs.paths;
		blobs = opfs;
	} else {
		blobs = idbBlobs(opts.blobDbName ?? VAULT_BLOB_DB);
	}
	const release = () => {
		writer?.close();
		blobs.close?.();
	};
	let vault: VaultHandle;
	try {
		vault = await openVault({
			blobs,
			...opts,
			index,
			channel,
			onClose: () => {
				release();
				opts.onClose?.();
			},
		});
	} catch (err) {
		// The startup scan failed: nothing will call close(), so release what this call opened.
		release();
		channel?.close();
		index.close();
		throw err;
	}
	const w = writer;
	return Object.assign(vault, {
		blobBacking: backing,
		writePaths,
		probeWritePath: () => (w ? w.probe() : Promise.resolve('indexeddb' as const)),
	});
}
