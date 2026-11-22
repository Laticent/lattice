/**
 * The browser vault's one writer: a dedicated worker, because `createSyncAccessHandle` exists only in a
 * dedicated worker and is the write path WebKit offers. Writes run one at a time, in arrival order, so
 * two writes from this tab never hold handles on the same file at once.
 *
 * Messages in:  { id, op: 'put', root, sha, bytes } | { id, op: 'probe', root }
 * Messages out: { id, ok: true, path } | { id, ok: false, name, message }
 */
import { probeWritePath, writeBlob } from './opfs-write';

type In = { id: number; op: 'put'; root: string; sha: string; bytes: Uint8Array } | { id: number; op: 'probe'; root: string };

// No `/// <reference lib="webworker" />`: it would retype every global in the docs program (it broke
// `addEventListener('storage', …)` in an unrelated spec). The two members used here are typed by hand.
const scope = self as unknown as { onmessage: ((e: MessageEvent<In>) => void) | null; postMessage(m: unknown): void };


async function rootDir(name: string): Promise<FileSystemDirectoryHandle> {
	return (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
}

let queue: Promise<void> = Promise.resolve();

scope.onmessage = (e: MessageEvent<In>) => {
	const m = e.data;
	queue = queue.then(async () => {
		try {
			const root = await rootDir(m.root);
			const path = m.op === 'put' ? await writeBlob(root, m.sha, m.bytes) : await probeWritePath(root);
			scope.postMessage({ id: m.id, ok: true, path });
		} catch (err) {
			const er = err as Error;
			scope.postMessage({ id: m.id, ok: false, name: er?.name ?? 'Error', message: er?.message ?? String(err) });
		}
	});
};
