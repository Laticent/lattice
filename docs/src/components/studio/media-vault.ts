// The vault's first caller: Library photos and videos keep their BYTES in the storage vault, and only their
// metadata in the Workbench `assets` store. engineering/decisions/2026-11-22-local-first-drive-storage.md
// §6.2 and §10 slice 2; as built: engineering/decisions/2026-11-27-vault-slice-2-as-built.md.
//
// WHY THE BYTES MOVE. A media row used to hold its photo as a Blob (or, where an engine refused a Blob, an
// ArrayBuffer). Every metadata edit (a caption, a rename, a scope flip) rewrote that row, and on WebKit a
// rewrite with the Blob read back from the same row broke the photo, so `detachedBlob` copied every photo
// into memory before every edit. With the bytes in the vault, an edit writes a few hundred bytes of
// metadata and never touches the photo. And the vault is the folder that sync carries to Drive (slice 6).
//
// THE PATH IS THE RECORD'S ID: `Library/Images/<id>.<ext>`, `Library/Videos/<id>.<ext>`. A photo's name can
// change (a rename keeps the old one as an alias) and its scope can flip, and neither should move bytes. A
// vault move rewrites only the index (its blobs are content-addressed), so giving the files human names
// when sync makes the folder visible is a cheap move, not a second migration.
//
// NO VAULT, NO MOVE. Where the vault cannot open, a photo is stored the old way, in its row, and every
// reader below still reads that. A row is one or the other: `vault` (a path) or `blob` / `data` (the bytes).
// This module is itself loaded on first use (media-store, asset-store, governance import it dynamically), and the
// vault behind it is imported on first use again, so the Studio's eager bundle carries none of either
// (check:route-budget, studio eagerJsGz).
import type { BrowserVault } from '@/lib/vault';
import { defaultLocks } from '@/lib/vault/backing';

const codeOf = (err: unknown): string | undefined => (err as { code?: string } | null)?.code;

/** The one vault this tab's Studio shares. Opened on first use; null where the browser cannot hold one. */
let vaultP: Promise<BrowserVault | null> | null = null;
/** Which IndexedDB factory `vaultP` was opened over: a test that swaps `indexedDB` gets a fresh vault. */
let openedOver: IDBFactory | undefined;

/** Tests only: pin what `studioVault()` resolves (null = a host with no vault), or `undefined` to open normally. */
let pinned: Promise<BrowserVault | null> | undefined;
export function pinStudioVault(v: BrowserVault | null | undefined): void {
	pinned = v === undefined ? undefined : Promise.resolve(v);
}

export function studioVault(): Promise<BrowserVault | null> {
	if (pinned) return pinned;
	const idb = typeof indexedDB === 'undefined' ? undefined : indexedDB;
	if (vaultP && openedOver === idb) return vaultP;
	openedOver = idb;
	vaultP = import('@/lib/vault')
		.then((m) => m.openBrowserVault())
		.catch((err) => {
			// `unavailable` is a host that cannot hold a vault; the Studio keeps storing bytes in rows there.
			// Anything else (a chunk that failed to load included) is a real failure, and the next call tries again.
			if (codeOf(err) !== 'unavailable') vaultP = null;
			return null;
		});
	return vaultP;
}

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
	'image/heic': 'heic',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
};

export const MEDIA_DIRS = { image: 'Library/Images', video: 'Library/Videos' } as const;

/** Where a media record's bytes live in the vault. */
export function mediaPath(id: string, kind: 'image' | 'video', mime: string): string {
	return `${MEDIA_DIRS[kind]}/${id}.${EXT[mime] ?? 'bin'}`;
}

/**
 * The bytes at `path`, typed `mime`. The vault hands back the file as stored (OPFS's `getFile()`, or the
 * IndexedDB row's Blob), which carries no type; `slice` adds one without reading the bytes, so a file-backed
 * Blob stays file-backed. Null when the vault or the file is gone: the shelf shows that card as unreadable.
 *
 * A FILE-BACKED BLOB DIES WITH ITS FILE (vault README, "A file-backed read"). A media file is never rewritten
 * in place (replacing a photo makes a new record), so the only way to kill one is to delete the photo, and a
 * deleted photo is not on the shelf.
 */
export async function vaultBlob(path: string, mime: string): Promise<Blob | null> {
	const v = await studioVault();
	if (!v) return null;
	try {
		const b = await v.read(path);
		return b.slice(0, b.size, mime);
	} catch {
		return null;
	}
}

/** Remove a media file. A missing file or vault is not an error: the record is going either way. */
export async function removeVaultFile(path: string): Promise<void> {
	const v = await studioVault();
	if (!v) return;
	await v.remove(path).catch((err) => {
		if (codeOf(err) !== 'not-found') throw err;
	});
}

/** The lock that keeps two tabs' moves (media-vault-move.ts) apart. */
export const MEDIA_LOCK = 'lattice-media-move';

/** Run `fn` under `MEDIA_LOCK`: across every tab where the browser has Web Locks, and within this tab otherwise
 *  (the vault's own fallback, `defaultLocks`), so a delete still waits for a move in the same tab. */
const mediaLocks = defaultLocks();
export function withMediaLock<T>(mode: 'shared' | 'exclusive', fn: () => Promise<T>): Promise<T> {
	return mediaLocks.request(MEDIA_LOCK, mode, fn);
}

/** Remove every file in the media folders, whether or not a row names it: Clear Library and Delete everything. */
export async function clearMediaFolders(): Promise<void> {
	const v = await studioVault();
	if (!v) return;
	for (const dir of Object.values(MEDIA_DIRS)) {
		for (const e of await v.list(dir).catch(() => [])) await v.remove(e.path).catch(() => {});
	}
}

/**
 * WHICH WAY LIBRARY PHOTOS GO: the undo path for vault slice 2 (owner's answer, 2026-11-27, on #3582).
 *
 * `'vault'` is the shipped direction: new photos are saved into the vault, and photos in rows move in at boot.
 * `'rows'` is the way back: new photos are saved in their rows as before slice 2, and photos in the vault move
 * BACK into their rows at boot (`media-vault-move.ts` `moveMediaOutOfVault`). Undoing slice 2 is two releases,
 * never one revert: first a release with `MEDIA_DIRECTION = 'rows'`, which puts every photo back as people open
 * the Studio; then the code revert. A revert alone would strand every moved photo at a vault path the old code
 * cannot read. And the revert keeps THIS READER (`vaultBlob`, `studioVault`, and media-store `hydrate`'s vault branch)
 * for one more release: a device that never opened the Studio during the `'rows'` release still has vault rows, and on
 * the pre-slice-2 code one such row breaks every deck's `asset:` photos (`refreshAssetUrls` throws on a row with no
 * blob). The checker's finding, 2026-11-27.
 *
 * `lattice-media-storage: rows` in localStorage turns the way back on for one browser: for support, and for the
 * e2e that proves the move-back on real engines.
 */
export const MEDIA_DIRECTION: 'vault' | 'rows' = 'vault';
export const MEDIA_DIRECTION_KEY = 'lattice-media-storage';

export function mediaDirection(): 'vault' | 'rows' {
	try {
		if (localStorage.getItem(MEDIA_DIRECTION_KEY) === 'rows') return 'rows';
	} catch {
		/* no localStorage: the shipped direction */
	}
	return MEDIA_DIRECTION;
}
