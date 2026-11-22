/**
 * Writing one blob into OPFS (the Origin Private File System). Shared by the vault's dedicated worker
 * (`opfs.worker.ts`, the only place the browser vault writes from) and by unit tests, which drive it
 * against a stand-in directory.
 *
 * TWO PATHS, and the caller learns which one ran:
 *   sync-access-handle  `FileSystemFileHandle.createSyncAccessHandle()`, which exists only inside a
 *                       dedicated worker. It is the write path WebKit (Linux WebKit, iOS Safari) offers,
 *                       and Chromium and Gecko have it too.
 *   writable            `createWritable()`, the stream path, for an engine with no sync handle.
 * The e2e (`docs/e2e/vault.spec.ts`) records which path each engine takes.
 */

export type WritePath = 'sync-access-handle' | 'writable';

/** Blobs live in `blobs/<first two hex>/<sha256>`, so no one directory holds every file. */
export const BLOB_DIR = 'blobs';
export const shardOf = (sha: string) => sha.slice(0, 2);

interface SyncHandle {
	truncate(size: number): void;
	write(buffer: Uint8Array, options?: { at?: number }): number;
	flush(): void;
	close(): void;
}

type FileHandleLike = FileSystemFileHandle & { createSyncAccessHandle?: () => Promise<SyncHandle> };

export async function blobDir(root: FileSystemDirectoryHandle, sha: string, create: boolean): Promise<FileSystemDirectoryHandle> {
	const blobs = await root.getDirectoryHandle(BLOB_DIR, { create });
	return blobs.getDirectoryHandle(shardOf(sha), { create });
}

/** Write `bytes` as blob `sha` under `root`, durably, and say which path did it. */
export async function writeBlob(root: FileSystemDirectoryHandle, sha: string, bytes: Uint8Array): Promise<WritePath> {
	const dir = await blobDir(root, sha, true);
	const fh = (await dir.getFileHandle(sha, { create: true })) as FileHandleLike;
	if (typeof fh.createSyncAccessHandle === 'function') {
		const h = await fh.createSyncAccessHandle();
		try {
			h.truncate(0);
			let at = 0;
			while (at < bytes.byteLength) {
				const n = h.write(bytes.subarray(at), { at });
				if (n <= 0) throw new Error('vault: the sync access handle wrote nothing');
				at += n;
			}
			h.flush();
		} finally {
			h.close();
		}
		return 'sync-access-handle';
	}
	const w = await fh.createWritable();
	try {
		await w.write(bytes as Uint8Array<ArrayBuffer>);
		await w.close();
	} catch (err) {
		await w.abort().catch(() => {});
		throw err;
	}
	return 'writable';
}

/** Which path a write here would take, without writing a blob. */
export async function probeWritePath(root: FileSystemDirectoryHandle): Promise<WritePath> {
	const fh = (await root.getFileHandle('.probe', { create: true })) as FileHandleLike;
	const path: WritePath = typeof fh.createSyncAccessHandle === 'function' ? 'sync-access-handle' : 'writable';
	await root.removeEntry('.probe').catch(() => {});
	return path;
}
