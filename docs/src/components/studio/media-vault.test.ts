// @vitest-environment node
// Library photos and videos in the storage vault (vault slice 2): new saves, edits, deletes, and the one move of
// rows that still hold their own bytes. Driven against `fake-indexeddb` and the real vault over its IndexedDB
// blob store, which is what Node gets (no OPFS); the browser's OPFS path runs in docs/e2e/vault.spec.ts.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLibraryAssets } from './governance';
import { openDB, reqAsPromise } from './library/asset-db.js';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { renameMedia } from './media-edit';
import { LIBRARY_SCOPE, listMedia, type NewMedia, saveMedia, setMediaCaption, setMediaScope } from './media-store';
import { MEDIA_DIRECTION_KEY, mediaPath, studioVault } from './media-vault';
import { ATTEMPT_RESET_KEY, BACKUP_PATH, deletePreMoveBackup, MAX_DEAD_ATTEMPTS, MAX_MOVE_BYTES, MOVE_BACK_LEFT_KEY, moveMediaIntoVault, moveMediaOutOfVault, preMoveBackup, settleMediaStorage } from './media-vault-move';
import { packMedia } from './workspace-media';

// Node has no localStorage; the move's crash-loop guard keeps one mark there.
if (typeof localStorage === 'undefined') {
	const m = new Map<string, string>();
	(globalThis as { localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }).localStorage = {
		getItem: (k) => m.get(k) ?? null,
		setItem: (k, v) => void m.set(k, String(v)),
		removeItem: (k) => void m.delete(k),
	};
}

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);
const photo = (name: string, b: Uint8Array): NewMedia => ({
	kind: 'image', name, scope: LIBRARY_SCOPE, blob: new Blob([b as BlobPart], { type: 'image/png' }), mime: 'image/png',
	bytes: b.length, width: 4, height: 4, sourceName: `${name}.png`, original: true,
});
const raw = async (id: string) => (await reqAsPromise((await openDB()).transaction('assets').objectStore('assets').get(id))) as Record<string, unknown> | undefined;
const put = async (row: Record<string, unknown>) => {
	const t = (await openDB()).transaction('assets', 'readwrite');
	t.objectStore('assets').put(row);
	await new Promise<void>((ok, no) => {
		t.oncomplete = () => ok();
		t.onerror = () => no(t.error);
	});
};
const vaultFiles = async () => {
	const v = await studioVault();
	return [...(await v!.list('Library/Images')), ...(await v!.list('Library/Videos'))].map((e) => e.path).sort();
};

async function empty() {
	localStorage.removeItem(MEDIA_DIRECTION_KEY);
	localStorage.removeItem(MOVE_BACK_LEFT_KEY);
	localStorage.removeItem('lattice-media-move-backed-up');
	localStorage.removeItem('lattice-media-move-attempt');
	localStorage.setItem(ATTEMPT_RESET_KEY, '1'); // a device past the one-time reset, as every test but its own assumes
	for (const a of await listAssets()) await deleteAsset(a.id);
	const v = await studioVault();
	for (const e of await v!.list('', { recursive: true })) await v!.remove(e.path);
}
beforeEach(empty);
afterEach(empty);

describe('a new photo', () => {
	it('keeps its bytes in the vault and only its metadata in the row, and reads back typed', async () => {
		const b = bytes(2048, 1);
		const saved = await saveMedia(photo('hero', b), 5);
		const row = await raw(saved.id);
		expect(row?.vault).toBe(mediaPath(saved.id, 'image', 'image/png'));
		// The vault entry's stable id rides beside the path, so a later rename never rewrites the row.
		const v = await studioVault();
		expect(row?.vaultId).toBe((await v!.list('Library/Images'))[0].id);
		expect(row?.blob).toBeUndefined();
		expect(row?.data).toBeUndefined();
		const [back] = await listMedia();
		expect(back.blob.type).toBe('image/png');
		expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(b);
	});

	it('an edit (scope, caption, rename) rewrites metadata only: the file is the same revision', async () => {
		const saved = await saveMedia(photo('hero', bytes(64, 2)), 5);
		const v = await studioVault();
		const before = (await v!.list('Library/Images'))[0];
		await setMediaScope(saved.id, 'deck-a');
		const captioned = await setMediaCaption(saved.id, 'a red door');
		const renamed = await renameMedia(saved.id, 'door');
		expect(captioned?.caption).toBe('a red door');
		expect(renamed?.name).toBe('door');
		expect(new Uint8Array(await (renamed as { blob: Blob }).blob.arrayBuffer())).toEqual(bytes(64, 2));
		expect((await v!.list('Library/Images'))[0]).toEqual(before);
	});

	it('a refused save (a name clash) leaves no file behind', async () => {
		await saveMedia(photo('hero', bytes(8, 3)), 5);
		await expect(saveMedia(photo('hero', bytes(8, 4)), 6)).rejects.toThrow(/already another saved image/);
		expect(await vaultFiles()).toHaveLength(1);
	});

	it('a photo whose vault file cannot be read is named unreadable in a backup, never zipped as 0 bytes', async () => {
		const saved = await saveMedia(photo('hero', bytes(64, 13)), 5);
		const v = await studioVault();
		// The file goes behind the row's back (a cleared site, a refused OPFS): the row still names it.
		await v!.remove(mediaPath(saved.id, 'image', 'image/png'));
		const zip = new JSZip();
		const report = await packMedia(zip as unknown as Parameters<typeof packMedia>[0]);
		expect(report.unreadable).toEqual(['hero']);
		expect(Object.keys(zip.files).filter((f) => f.startsWith('media/') && !f.endsWith('/'))).toEqual([]);
	});

	it('a delete removes the file with the row', async () => {
		const saved = await saveMedia(photo('hero', bytes(8, 5)), 5);
		await deleteAsset(saved.id);
		expect(await vaultFiles()).toEqual([]);
	});
});

describe('the one move into the vault', () => {
	const legacy = (id: string, name: string, b: Uint8Array, as: 'blob' | 'buffer') => ({
		id, kind: 'image', name, scope: LIBRARY_SCOPE, mime: 'image/png', bytes: b.length, width: 4, height: 4, sourceName: `${name}.png`,
		original: true, addedAt: 1, ...(as === 'blob' ? { blob: new Blob([b as BlobPart], { type: 'image/png' }) } : { data: b.slice().buffer }),
	});

	it('backs up once, moves every row (Blob or buffer) with its bytes checked, and is a no-op the second time', async () => {
		await put(legacy('m_a', 'one', bytes(500, 6), 'blob'));
		await put(legacy('m_b', 'two', bytes(700, 7), 'buffer'));
		let packs = 0;
		const pack = async () => {
			packs++;
			return new Blob(['zip']);
		};
		const first = await moveMediaIntoVault({ pack });
		expect(first).toEqual({ backedUp: true, moved: 2, failed: 0 });
		for (const id of ['m_a', 'm_b']) {
			const row = await raw(id);
			expect(row?.vault).toBe(mediaPath(id, 'image', 'image/png'));
			expect(row?.blob ?? row?.data).toBeUndefined();
		}
		const shelf = await listMedia();
		expect(new Uint8Array(await shelf.find((m) => m.id === 'm_b')!.blob.arrayBuffer())).toEqual(bytes(700, 7));
		const v = await studioVault();
		expect(await (await v!.read(BACKUP_PATH)).text()).toBe('zip');
		expect(await moveMediaIntoVault({ pack })).toEqual({ backedUp: false, moved: 0, failed: 0 });
		expect(packs).toBe(1);
	});

	it('backs up once per device: deleting the backup never makes a later run pack the workspace again', async () => {
		await put(legacy('m_a', 'one', bytes(20, 20), 'blob'));
		let packs = 0;
		const pack = async () => {
			packs++;
			return new Blob(['zip']);
		};
		await moveMediaIntoVault({ pack });
		await deletePreMoveBackup();
		await put(legacy('m_b', 'two', bytes(20, 21), 'blob'));
		expect(await moveMediaIntoVault({ pack })).toMatchObject({ backedUp: false, moved: 1 });
		expect(packs).toBe(1);
	});

	it('moves nothing when the backup fails: every photo keeps its bytes and still reads', async () => {
		await put(legacy('m_a', 'one', bytes(50, 8), 'blob'));
		const report = await moveMediaIntoVault({ pack: async () => Promise.reject(new Error('out of memory')) });
		expect(report).toMatchObject({ stopped: 'backup-failed', moved: 0 });
		expect((await raw('m_a'))?.vault).toBeUndefined();
		expect(new Uint8Array(await (await listMedia())[0].blob.arrayBuffer())).toEqual(bytes(50, 8));
		expect(await vaultFiles()).toEqual([]);
	});

	it('never deletes a media file no row names: sync and the desktop folder put such files there on purpose', async () => {
		// The inversion review: a file pulled from another device (slice 6) or dropped into the folder (slice 10)
		// has no row on this device yet. A sweep by "no row names it" would delete it on the next start.
		const kept = await saveMedia(photo('kept', bytes(16, 9)), 5);
		const v = await studioVault();
		const foreign = mediaPath('m_from_another_device', 'image', 'image/png');
		await v!.write(foreign, new Blob([bytes(16, 10) as BlobPart]));
		await put(legacy('m_a', 'one', bytes(30, 12), 'blob'));
		expect(await moveMediaIntoVault({ pack: async () => new Blob(['zip']) })).toMatchObject({ moved: 1 });
		expect(await vaultFiles()).toEqual([foreign, mediaPath('m_a', 'image', 'image/png'), mediaPath(kept.id, 'image', 'image/png')].sort());
	});

	it('checks the bytes it reads BACK from the vault, and keeps the row as it was when they differ', async () => {
		// The red team's finding: the entry's sha256 is computed from the input, so a torn store passed the old check.
		await put(legacy('m_a', 'one', bytes(100, 14), 'blob'));
		const v = await studioVault();
		const torn = Object.create(v) as typeof v;
		torn!.read = async (path) => (path === BACKUP_PATH ? v!.read(path) : new Blob([bytes(3, 14) as BlobPart]));
		expect(await moveMediaIntoVault({ vault: torn, pack: async () => new Blob(['zip']) })).toMatchObject({ moved: 0, failed: 1 });
		expect((await raw('m_a'))?.vault).toBeUndefined();
		expect(new Uint8Array(await (await listMedia())[0].blob.arrayBuffer())).toEqual(bytes(100, 14));
		expect(await vaultFiles()).toEqual([]);
	});

	it('stops trying after three attempts that never finished, retries after fewer, and does not take on a library past the cap', async () => {
		await put(legacy('m_a', 'one', bytes(10, 15), 'blob'));
		// One or two unfinished attempts are an ordinary closed tab: the move still runs. Three is a pattern.
		localStorage.setItem('lattice-media-move-attempt', String(MAX_DEAD_ATTEMPTS));
		try {
			expect(await moveMediaIntoVault({ pack: async () => new Blob(['zip']) })).toMatchObject({ stopped: 'gave-up', moved: 0 });
			localStorage.setItem('lattice-media-move-attempt', String(MAX_DEAD_ATTEMPTS - 1));
			expect(await moveMediaIntoVault({ pack: async () => new Blob(['zip']) })).toMatchObject({ moved: 1 });
			expect(localStorage.getItem('lattice-media-move-attempt')).toBeNull();
		} finally {
			localStorage.removeItem('lattice-media-move-attempt');
		}
		await put({ ...legacy('m_b', 'two', bytes(10, 16), 'blob'), bytes: MAX_MOVE_BYTES + 1 });
		expect(await moveMediaIntoVault({ pack: async () => new Blob(['zip']) })).toMatchObject({ stopped: 'too-large', moved: 0 });
		expect(await vaultFiles()).toEqual([mediaPath('m_a', 'image', 'image/png')]);
	});

	it('a device the old rule stopped gets one fresh set of attempts, once', async () => {
		await put(legacy('m_a', 'one', bytes(10, 19), 'blob'));
		localStorage.removeItem(ATTEMPT_RESET_KEY); // before this release, three reloads mid-move ended it
		localStorage.setItem('lattice-media-move-attempt', String(MAX_DEAD_ATTEMPTS));
		try {
			expect(await moveMediaIntoVault({ pack: async () => new Blob(['zip']) })).toMatchObject({ moved: 1 });
			expect(localStorage.getItem(ATTEMPT_RESET_KEY)).toBe('1');
			// Once only: a count that reaches the cap again, now from real crashes, stops the move as before.
			await put(legacy('m_b', 'two', bytes(10, 20), 'blob'));
			localStorage.setItem('lattice-media-move-attempt', String(MAX_DEAD_ATTEMPTS));
			expect(await moveMediaIntoVault({ pack: async () => new Blob(['zip']) })).toMatchObject({ stopped: 'gave-up', moved: 0 });
		} finally {
			localStorage.removeItem('lattice-media-move-attempt');
		}
	});

	it('a page closed while the move runs hands its attempt back; only a crash counts toward the cap', async () => {
		const page = new EventTarget();
		const g = globalThis as { addEventListener?: unknown; removeEventListener?: unknown };
		Object.assign(g, { addEventListener: page.addEventListener.bind(page), removeEventListener: page.removeEventListener.bind(page) });
		let finish = () => {};
		let move: Promise<unknown> = Promise.resolve();
		try {
			await put(legacy('m_a', 'one', bytes(10, 18), 'blob'));
			localStorage.setItem('lattice-media-move-attempt', String(MAX_DEAD_ATTEMPTS - 1)); // two earlier crashes
			let packing!: () => void;
			const started = new Promise<void>((r) => {
				packing = r;
			});
			move = moveMediaIntoVault({
				pack: () => {
					packing();
					return new Promise<Blob>((ok) => {
						finish = () => ok(new Blob(['zip']));
					});
				},
			});
			await started;
			expect(localStorage.getItem('lattice-media-move-attempt')).toBe(String(MAX_DEAD_ATTEMPTS));
			page.dispatchEvent(new Event('pagehide')); // a reload, not a third crash
			expect(localStorage.getItem('lattice-media-move-attempt')).toBe(String(MAX_DEAD_ATTEMPTS - 1));
			finish();
			expect(await move).toMatchObject({ moved: 1 });
			expect(localStorage.getItem('lattice-media-move-attempt')).toBeNull();
			page.dispatchEvent(new Event('pagehide')); // after the move ends nothing listens: no stale count comes back
			expect(localStorage.getItem('lattice-media-move-attempt')).toBeNull();
		} finally {
			finish(); // a failed assertion must not leave the lock held for the next test
			await move;
			localStorage.removeItem('lattice-media-move-attempt');
			delete g.addEventListener;
			delete g.removeEventListener;
		}
	});

	it('a backup delete during a move waits for it, so no fresh backup is left behind', async () => {
		await put(legacy('m_a', 'one', bytes(10, 17), 'blob'));
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		let packing!: () => void;
		const started = new Promise<void>((r) => {
			packing = r;
		});
		const move = moveMediaIntoVault({
			pack: async () => {
				packing();
				await gate;
				return new Blob(['zip']);
			},
		});
		await started;
		const del = deletePreMoveBackup();
		release();
		await move;
		await del;
		expect(await preMoveBackup()).toBeNull();
	});

	it('clearing the Library empties the media folders, including a file no row names', async () => {
		await saveMedia(photo('kept', bytes(16, 18)), 5);
		const v = await studioVault();
		await v!.write(mediaPath('m_leaked', 'image', 'image/png'), new Blob([bytes(16, 19) as BlobPart]));
		await clearLibraryAssets();
		expect(await vaultFiles()).toEqual([]);
	});

	it('leaves a row alone that another tab deleted mid-move, and frees the file it wrote', async () => {
		await put(legacy('m_a', 'one', bytes(40, 11), 'blob'));
		const v = await studioVault();
		// The row goes after the move reads it and before its swap: a vault whose write deletes the row first.
		const racing = Object.create(v) as typeof v;
		racing!.write = async (path, data, meta) => {
			if (path !== BACKUP_PATH) await deleteAsset('m_a');
			return v!.write(path, data, meta);
		};
		expect(await moveMediaIntoVault({ vault: racing, pack: async () => new Blob(['zip']) })).toMatchObject({ moved: 0, failed: 0 });
		expect(await raw('m_a')).toBeUndefined();
		expect(await vaultFiles()).toEqual([]);
	});
});

describe('the move-back: the undo path', () => {
	const legacy = (id: string, name: string, b: Uint8Array) => ({
		id, kind: 'image', name, scope: LIBRARY_SCOPE, mime: 'image/png', bytes: b.length, width: 4, height: 4, sourceName: `${name}.png`,
		original: true, addedAt: 1, blob: new Blob([b as BlobPart], { type: 'image/png' }),
	});

	it('puts every vault photo back in its row with the same bytes, removes the files, and changes nothing the second time', async () => {
		const a = await saveMedia(photo('one', bytes(300, 30)), 5);
		await put(legacy('m_old', 'two', bytes(200, 31)));
		await moveMediaIntoVault({ pack: async () => new Blob(['zip']) });
		expect(await vaultFiles()).toHaveLength(2);
		expect(await moveMediaOutOfVault()).toEqual({ movedBack: 2, failed: 0 });
		for (const [id, b] of [[a.id, bytes(300, 30)], ['m_old', bytes(200, 31)]] as const) {
			const row = await raw(id);
			expect(row?.vault ?? row?.vaultId).toBeUndefined();
			const held = row?.blob instanceof Blob ? new Uint8Array(await (row.blob as Blob).arrayBuffer()) : new Uint8Array(row?.data as ArrayBuffer);
			expect(held).toEqual(b);
		}
		expect(await vaultFiles()).toEqual([]);
		expect(new Uint8Array(await (await listMedia()).find((m) => m.id === 'm_old')!.blob.arrayBuffer())).toEqual(bytes(200, 31));
		expect(await moveMediaOutOfVault()).toEqual({ movedBack: 0, failed: 0 });
	});

	it('stores an ArrayBuffer where the engine refuses a Blob, as the old save did', async () => {
		const a = await saveMedia(photo('one', bytes(64, 32)), 5);
		const real = globalThis.structuredClone;
		globalThis.structuredClone = ((v: unknown, o?: StructuredSerializeOptions) => {
			if (v && typeof v === 'object' && (v as { blob?: unknown }).blob instanceof Blob && (v as { kind?: unknown }).kind === 'image') {
				throw new DOMException('Error preparing Blob/File data to be stored in object store', 'DataCloneError');
			}
			return real(v, o);
		}) as typeof structuredClone;
		try {
			expect(await moveMediaOutOfVault()).toEqual({ movedBack: 1, failed: 0 });
		} finally {
			globalThis.structuredClone = real;
		}
		const row = await raw(a.id);
		expect(row?.blob).toBeUndefined();
		expect(new Uint8Array(row?.data as ArrayBuffer)).toEqual(bytes(64, 32));
	});

	it('leaves a photo in the vault, still named by its row, when its file does not check out', async () => {
		const a = await saveMedia(photo('one', bytes(64, 33)), 5);
		const v = await studioVault();
		const torn = Object.create(v) as typeof v;
		torn!.read = async () => new Blob([bytes(10, 33) as BlobPart]);
		expect(await moveMediaOutOfVault(torn)).toEqual({ movedBack: 0, failed: 1 });
		// The device says it is not done, for support and the 'rows' release's notes.
		expect(localStorage.getItem(MOVE_BACK_LEFT_KEY)).toBe('1');
		expect((await raw(a.id))?.vault).toBe(mediaPath(a.id, 'image', 'image/png'));
		expect(await vaultFiles()).toHaveLength(1);
		expect(new Uint8Array(await (await listMedia())[0].blob.arrayBuffer())).toEqual(bytes(64, 33));
	});

	it('brings back a video and a photo kept to one deck, and a row an older release wrote without `bytes`', async () => {
		const clip = await saveMedia({ ...photo('clip', bytes(90, 36)), kind: 'video', mime: 'video/mp4', blob: new Blob([bytes(90, 36) as BlobPart], { type: 'video/mp4' }), durationMs: 1000 }, 5);
		const kept = await saveMedia({ ...photo('kept', bytes(70, 37)), scope: 'deck-a' }, 6);
		const bare = await saveMedia(photo('bare', bytes(50, 38)), 7);
		const { bytes: _gone, ...noBytes } = (await raw(bare.id)) as Record<string, unknown>;
		await put(noBytes);
		expect(await moveMediaOutOfVault()).toEqual({ movedBack: 3, failed: 0 });
		expect((await raw(clip.id))?.kind).toBe('video');
		expect((await raw(kept.id))?.scope).toBe('deck-a');
		for (const [id, b] of [[clip.id, bytes(90, 36)], [kept.id, bytes(70, 37)], [bare.id, bytes(50, 38)]] as const) {
			const row = await raw(id);
			expect(row?.vault).toBeUndefined();
			expect(new Uint8Array(await (row?.blob as Blob).arrayBuffer())).toEqual(b);
		}
		expect(localStorage.getItem(MOVE_BACK_LEFT_KEY)).toBe('0');
	});

	it('on the way back, boot runs the move-back and a new photo is saved in its row', async () => {
		const a = await saveMedia(photo('one', bytes(40, 34)), 5);
		localStorage.setItem(MEDIA_DIRECTION_KEY, 'rows');
		expect(await settleMediaStorage()).toEqual({ movedBack: 1, failed: 0 });
		const b = await saveMedia(photo('two', bytes(40, 35)), 6);
		for (const id of [a.id, b.id]) expect((await raw(id))?.vault).toBeUndefined();
		expect(await vaultFiles()).toEqual([]);
	});
});
