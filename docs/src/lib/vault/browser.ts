/**
 * The browser backing: bytes in OPFS, written through a dedicated worker; the index and the journal in
 * IndexedDB `lattice-vault`; changes to other tabs over a BroadcastChannel; locks from `navigator.locks`.
 *
 * Reads come straight from the main thread (`getFile()` is a file-backed Blob on every engine). Only
 * writes go through the worker.
 */
import type { BlobStore } from './backing';
import { type OpenOptions, openVault } from './core';
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
	terminate(): void;
}

/** A `BlobWriter` over the vault worker (or any worker that speaks its protocol). */
export function workerWriter(worker: WorkerLike, root: string = VAULT_ROOT): BlobWriter {
	let next = 0;
	const pending = new Map<number, { resolve: (p: WritePath) => void; reject: (e: Error) => void }>();
	worker.addEventListener('message', (e: MessageEvent) => {
		const d = e.data as { id: number; ok: boolean; path?: WritePath; name?: string; message?: string };
		const p = pending.get(d.id);
		if (!p) return;
		pending.delete(d.id);
		if (d.ok && d.path) p.resolve(d.path);
		else p.reject(Object.assign(new Error(d.message ?? 'vault: the worker write failed'), { name: d.name ?? 'Error' }));
	});
	worker.addEventListener('error', (e: ErrorEvent) => {
		const err = new VaultError('unavailable', `vault: the write worker failed: ${e.message}`);
		for (const p of pending.values()) p.reject(err);
		pending.clear();
	});
	const call = (msg: Record<string, unknown>, transfer: Transferable[] = []) =>
		new Promise<WritePath>((resolve, reject) => {
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
		close: () => worker.terminate(),
	};
}

export interface OpfsBlobStore extends BlobStore {
	/** The write path each `put` took, in order: what the e2e reads to prove the worker path per engine. */
	readonly paths: WritePath[];
}

/** Blobs in OPFS under `root`: written by `writer`, read and listed from this thread. */
export function opfsBlobs(root: () => Promise<FileSystemDirectoryHandle>, writer: BlobWriter): OpfsBlobStore {
	const paths: WritePath[] = [];
	const isMissing = (err: unknown) => (err as Error)?.name === 'NotFoundError';
	return {
		paths,
		async put(sha, bytes) {
			paths.push(await writer.put(sha, bytes));
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

export function browserVaultSupported(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		typeof navigator.storage?.getDirectory === 'function' &&
		typeof indexedDB !== 'undefined' &&
		typeof Worker !== 'undefined'
	);
}

export interface BrowserVault extends VaultHandle {
	/** The OPFS write path each blob write took this session. */
	readonly writePaths: readonly WritePath[];
	/** Ask the worker which write path this engine offers. */
	probeWritePath(): Promise<WritePath>;
}

/** Open the browser vault. Throws `unavailable` on an engine without OPFS, IndexedDB or workers. */
export async function openBrowserVault(opts: Partial<OpenOptions> & { dbName?: string; root?: string } = {}): Promise<BrowserVault> {
	if (!browserVaultSupported()) throw new VaultError('unavailable', 'vault: this browser has no OPFS, IndexedDB or workers');
	const rootName = opts.root ?? VAULT_ROOT;
	// Probe OPFS before anything else. An engine can expose `getDirectory` and still refuse it: WebKit
	// does in an ephemeral session (Playwright's default WebKit context throws UnknownError, measured
	// 2026-11-22), and a private window may too. Refuse with a typed `unavailable` so a host can fall back.
	let top: FileSystemDirectoryHandle;
	try {
		top = await navigator.storage.getDirectory();
	} catch (err) {
		throw new VaultError('unavailable', `vault: this browser refused OPFS (${(err as Error)?.name ?? 'Error'}: ${(err as Error)?.message ?? err})`);
	}
	let rootP: Promise<FileSystemDirectoryHandle> | null = null;
	const root = () => {
		rootP ??= top.getDirectoryHandle(rootName, { create: true });
		return rootP;
	};
	const worker = new Worker(new URL('./opfs.worker.ts', import.meta.url), { type: 'module', name: 'lattice-vault' });
	const writer = workerWriter(worker, rootName);
	const blobs = opfsBlobs(root, writer);
	const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(opts.dbName ?? VAULT_DB) : null;
	const vault = await openVault({
		blobs,
		index: idbIndex(opts.dbName ?? VAULT_DB),
		channel,
		...opts,
		onClose: () => {
			writer.close();
			opts.onClose?.();
		},
	});
	return Object.assign(vault, { writePaths: blobs.paths, probeWritePath: () => writer.probe() });
}
