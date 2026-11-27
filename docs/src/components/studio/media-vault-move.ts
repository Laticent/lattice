// The one move of Library photos and videos into the storage vault (design §8, owner ruling 4: "local data
// moves into the vault once behind one automatic backup"). As built: 2026-11-27-vault-slice-2-as-built.md.
//
// THE ORDER, and what each step leaves behind if the tab dies there:
//   1. ONE BACKUP, before the first byte moves: the same zip Download backup makes, written into the vault at
//      `BACKUP_PATH`. Written once per device (`BACKED_UP_KEY`), so a later run does not write another, even after
//      the person deletes it. A backup that cannot be
//      built or stored (no room, no memory) STOPS the move: every photo stays where it is and still reads.
//   2. PER PHOTO: write its bytes to the vault, check what the vault says it stored (size and SHA-256) against
//      the bytes read from the row, then swap the row to `vault` in a transaction that first rereads the row.
//      A row deleted or replaced meanwhile is left alone and its new file removed. A tab that dies between the
//      write and the swap leaves a file no row names, which the next run's write of the same path replaces.
//
// NO SWEEP OF FILES NO ROW NAMES. An earlier draft deleted any `Library/Images` or `Library/Videos` file whose id
// had no row, on every start. The adversarial review (inversion) killed it: once sync (slice 6) pulls another
// device's photos and the desktop (slice 10) shows the folder to a person, files with no local row are normal,
// and that sweep would delete them. The move removes only files it wrote itself and could not swap. A save
// that dies between its file and its row leaks that file; a leak is recoverable, a delete is not.
// Rerunning is safe at every step, so there is no "done" flag to lose: each start looks for rows that still
// hold their own bytes, and once there are none the move costs one read of the media rows. Two tabs' moves are
// held apart by `MEDIA_LOCK`.
import type { Vault } from '@/lib/vault';
import { sha256 } from '@/lib/vault/path';
import { ASSET_STORE, openDB, reqAsPromise } from './library/asset-db.js';
import { KINDS, type MediaRow } from './media-store';
import { mediaDirection, mediaPath, studioVault, withMediaLock } from './media-vault';

/** Where the move's one backup lives. Under `.lattice/`, Lattice's own records (design §6.1). */
export const BACKUP_PATH = '.lattice/backups/before-vault.zip';

/** The most photo and video bytes the move takes on. Past it the backup would hold the library in memory several
 *  times over (one copy per photo, the zip, its bytes) and could not be restored whole anyway
 *  (`MAX_MEDIA_RESTORE_BYTES`, 1 GB); the photos stay where they are and still read. */
export const MAX_MOVE_BYTES = 512 * 1024 * 1024;

/** How many attempts in a row may die before this device stops trying. More than one, because closing the tab
 *  in the seconds a move takes is ordinary (the checker's finding); a few, because an out-of-memory kill repeats. */
export const MAX_DEAD_ATTEMPTS = 3;

/** A localStorage count of attempts started and never finished, cleared when one ends. Never read as the move's
 *  state: rows are that. */
const ATTEMPT_KEY = 'lattice-media-move-attempt';
/** Set once this device has written the move's backup, so deleting the backup never makes a later run (a photo
 *  that keeps failing to move, say) pack the whole workspace again on every start. */
const BACKED_UP_KEY = 'lattice-media-move-backed-up';
const ls = {
	get: (k: string) => {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set: (k: string, v: string | null) => {
		try {
			if (v === null) localStorage.removeItem(k);
			else localStorage.setItem(k, v);
		} catch {
			/* no localStorage: no crash-loop guard and no once-mark, and nothing else changes */
		}
	},
};
const deadAttempts = () => Number(ls.get(ATTEMPT_KEY)) || 0;
const attemptDied = () => deadAttempts() >= MAX_DEAD_ATTEMPTS;
function markAttempt(on: boolean): void {
	ls.set(ATTEMPT_KEY, on ? String(deadAttempts() + 1) : null);
}

export type MoveReport = {
	/** Why nothing moved: no vault; the backup failed; the library is past `MAX_MOVE_BYTES`; or an earlier attempt
	 *  on this device never finished, so this one does not try again. */
	stopped?: 'no-vault' | 'backup-failed' | 'too-large' | 'gave-up';
	backedUp: boolean;
	moved: number;
	/** Rows whose bytes could not be copied or checked; they keep their bytes and are retried next start. */
	failed: number;
};

export type MoveDeps = {
	vault?: Vault | null;
	/** Builds the backup zip. Default: `packWorkspace`, the Download backup. */
	pack?: (now: number) => Promise<Blob>;
	now?: number;
};

async function rawRows(): Promise<MediaRow[]> {
	const db = await openDB();
	const store = db.transaction(ASSET_STORE, 'readonly').objectStore(ASSET_STORE);
	const rows = await Promise.all(KINDS.map((k) => reqAsPromise(store.index('kind').getAll(k)) as Promise<MediaRow[]>));
	return rows.flat();
}

const holdsBytes = (r: MediaRow) => !r.vault && (r.blob instanceof Blob || r.data instanceof ArrayBuffer);

/** Swap one row to its vault file, unless it changed since it was read. `already` is a row another tab moved to
 *  this same file (possible only without Web Locks): the file is that row's now, and must not be removed. */
async function swap(before: MediaRow, path: string, vaultId: string): Promise<'swapped' | 'already' | 'changed'> {
	const db = await openDB();
	return new Promise<'swapped' | 'already' | 'changed'>((resolve, reject) => {
		const t = db.transaction(ASSET_STORE, 'readwrite');
		const store = t.objectStore(ASSET_STORE);
		let swapped: 'swapped' | 'already' | 'changed' = 'changed';
		t.oncomplete = () => resolve(swapped);
		t.onabort = t.onerror = () => reject(t.error || new Error('the move could not update the photo'));
		const get = store.get(before.id);
		get.onsuccess = () => {
			const row = get.result as MediaRow | undefined;
			if (row?.vault === path) {
				swapped = 'already';
				return;
			}
			// Gone or replaced: not ours to touch.
			if (!row || !holdsBytes(row) || row.addedAt !== before.addedAt || row.bytes !== before.bytes) return;
			const { blob: _blob, data: _data, ...meta } = row;
			store.put({ ...meta, vault: path, vaultId });
			swapped = 'swapped';
		};
	});
}

export function moveMediaIntoVault(deps: MoveDeps = {}): Promise<MoveReport> {
	return withMediaLock('exclusive', async () => {
		const report: MoveReport = { backedUp: false, moved: 0, failed: 0 };
		const vault = deps.vault !== undefined ? deps.vault : await studioVault();
		if (!vault) return { ...report, stopped: 'no-vault' };
		const rows = await rawRows();
		const pending = rows.filter(holdsBytes);
		if (pending.length) {
			// A move that dies every time (an out-of-memory kill while packing a big library is the likely one) would
			// die on every start. After `MAX_DEAD_ATTEMPTS` unfinished attempts this device keeps its photos where
			// they are, and they still read. `followups.d/3148-p2` carries large libraries.
			if (attemptDied()) return { ...report, stopped: 'gave-up' };
			const total = pending.reduce((n, r) => n + (Number(r.bytes) || 0), 0);
			if (total > MAX_MOVE_BYTES) return { ...report, stopped: 'too-large' };
			markAttempt(true);
			const have = await vault.list('.lattice/backups').catch(() => []);
			if (!have.some((e) => e.path === BACKUP_PATH) && ls.get(BACKED_UP_KEY) !== '1') {
				try {
					const pack = deps.pack ?? (async (now: number) => (await import('./workspace-backup')).packWorkspace(now));
					await vault.write(BACKUP_PATH, await pack(deps.now ?? Date.now()));
					report.backedUp = true;
					ls.set(BACKED_UP_KEY, '1');
				} catch {
					markAttempt(false);
					return { ...report, stopped: 'backup-failed' };
				}
			}
			for (const row of pending) {
				const path = mediaPath(row.id, row.kind, row.mime);
				try {
					const bytes = new Uint8Array(row.blob instanceof Blob ? await row.blob.arrayBuffer() : (row.data as ArrayBuffer));
					const want = await sha256(bytes);
					const entry = await vault.write(path, new Blob([bytes]));
					// Read the file BACK and hash what is stored. The entry's own sha256 is computed from the input
					// before it is stored (core.ts), so comparing against it proves nothing (the red team's finding).
					const stored = new Uint8Array(await (await vault.read(path)).arrayBuffer());
					if (stored.byteLength !== bytes.byteLength || (await sha256(stored)) !== want) throw new Error('the vault stored different bytes');
					const outcome = await swap(row, path, entry.id);
					if (outcome === 'swapped') report.moved++;
					else if (outcome === 'changed') await vault.remove(path).catch(() => {});
				} catch {
					// The row keeps its own bytes and still reads; the next start tries again.
					report.failed++;
					await vault.remove(path).catch(() => {});
				}
			}
		}
		if (pending.length) markAttempt(false);
		return report;
	});
}

/** The move's backup, if this device has one: its size, for Privacy & Data. */
export type MoveBackReport = {
	stopped?: 'no-vault';
	/** Photos whose bytes are back in their rows and whose vault file is removed. */
	movedBack: number;
	/** Photos whose file could not be read or checked; they stay in the vault and are retried next start. */
	failed: number;
};

/** Put `bytes` back into one row that still names `path`, as a Blob or, where the engine refuses a Blob (a Safari
 *  private window), as an ArrayBuffer: the two shapes the Studio wrote before slice 2. Resolves whether it did. */
async function restoreRow(id: string, path: string, bytes: Uint8Array, asBuffer: boolean): Promise<boolean> {
	const db = await openDB();
	return new Promise<boolean>((resolve, reject) => {
		const t = db.transaction(ASSET_STORE, 'readwrite');
		const store = t.objectStore(ASSET_STORE);
		let done = false;
		t.oncomplete = () => resolve(done);
		t.onabort = t.onerror = () => reject(t.error || new Error('the move-back could not update the photo'));
		const get = store.get(id);
		get.onsuccess = () => {
			const row = get.result as MediaRow | undefined;
			// Gone, or already moved back by another tab: not ours to touch.
			if (!row || row.vault !== path) return;
			const { vault: _v, vaultId: _id, blob: _b, data: _d, ...meta } = row;
			const own = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
			try {
				store.put(asBuffer ? { ...meta, data: own } : { ...meta, blob: new Blob([own], { type: row.mime }) });
				done = true;
			} catch (err) {
				t.abort();
				reject(err);
			}
		};
	});
}

/**
 * THE MOVE-BACK: the undo path for this slice (see `MEDIA_DIRECTION` in media-vault.ts). Every photo row that names
 * a vault file gets its bytes back, checked against the size the row recorded and the SHA-256 the vault recorded,
 * then its vault file is removed. Per photo, the row is written before the file goes, so a tab that dies in between
 * leaves a file no row names (Clear Library empties those), never a row without bytes. A file that cannot be read
 * or does not check out stays where it is, and the row keeps naming it. Rerunning is safe.
 */
export function moveMediaOutOfVault(vaultIn?: Vault | null): Promise<MoveBackReport> {
	return withMediaLock('exclusive', async () => {
		const report: MoveBackReport = { movedBack: 0, failed: 0 };
		const vault = vaultIn !== undefined ? vaultIn : await studioVault();
		if (!vault) return { ...report, stopped: 'no-vault' };
		for (const row of (await rawRows()).filter((r) => typeof r.vault === 'string' && !holdsBytes(r))) {
			const path = row.vault as string;
			try {
				const entry = (await vault.list(path.slice(0, path.lastIndexOf('/')))).find((e) => e.path === path);
				const bytes = new Uint8Array(await (await vault.read(path)).arrayBuffer());
				if (!entry || bytes.byteLength !== Number(row.bytes) || (await sha256(bytes)) !== entry.sha256) throw new Error('the vault file does not match its row');
				// A Blob first, as `saveMedia` did; an ArrayBuffer where the engine refuses a Blob.
				const back = await restoreRow(row.id, path, bytes, false).catch(() => restoreRow(row.id, path, bytes, true));
				if (!back) continue;
				await vault.remove(path).catch(() => {});
				report.movedBack++;
			} catch {
				report.failed++;
			}
		}
		return report;
	});
}

/** What boot runs: the move into the vault, or, on the way back (`mediaDirection() === 'rows'`), the move-back. */
export function settleMediaStorage(): Promise<MoveReport | MoveBackReport> {
	return mediaDirection() === 'rows' ? moveMediaOutOfVault() : moveMediaIntoVault();
}

export async function preMoveBackup(vault?: Vault | null): Promise<{ bytes: number } | null> {
	const v = vault !== undefined ? vault : await studioVault();
	if (!v) return null;
	const e = (await v.list('.lattice/backups').catch(() => [])).find((x) => x.path === BACKUP_PATH);
	return e ? { bytes: e.bytes } : null;
}

/** The move's backup as a zip that Workspace → Restore reads, or null when there is none. */
export async function preMoveBackupZip(): Promise<Blob | null> {
	const v = await studioVault();
	if (!v) return null;
	try {
		const b = await v.read(BACKUP_PATH);
		return b.slice(0, b.size, 'application/zip');
	} catch {
		return null;
	}
}

/** Delete the move's backup. Its photos are in the vault by now; the zip only held copies. Under the move's lock,
 *  so a Delete everything during a move waits for it and then deletes the backup it wrote, rather than running
 *  first and leaving a fresh copy of everything behind (the red team's finding). */
export function deletePreMoveBackup(): Promise<void> {
	return withMediaLock('exclusive', async () => {
		const v = await studioVault();
		await v?.remove(BACKUP_PATH).catch(() => {});
	});
}
