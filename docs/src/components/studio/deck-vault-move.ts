// The one move of deck text from localStorage into the storage vault (design §8, slice 3), and its way back. As
// built: engineering/decisions/2026-11-28-vault-slice-3-as-built.md. The same shape as slice 2's photo move
// (media-vault-move.ts), and under the same lock, so the two moves and a backup delete never overlap.
//
// THE ORDER, and what each step leaves behind if the tab dies there:
//   1. THE BACKUP, refreshed once (storage desk D1). Slice 2 wrote ONE backup, `BACKUP_PATH`, before the photos
//      moved, and it holds the decks as they were then. Before the first deck moves, the same file is rewritten
//      with today's workspace: built, written to a temporary path, read back and checked, and only then copied
//      over `BACKUP_PATH`, which is read back and checked again. The device is never left with no backup or a
//      half-written one; a rewrite that fails keeps the old zip and STOPS the move. If the person deleted slice 2's
//      backup, no new one is written (they chose to have none). Once per device (`DECK_BACKUP_KEY`).
//   2. PER DECK: write its doc files and `Decks/<id>.md` (deck-vault.ts `moveIn`), read the text back, compare it
//      with the key's text, then, in one synchronous step, drop the key if nothing saved to it meanwhile. A tab
//      that dies before that leaves the key in place, and the key still wins every read; the rerun brings the
//      vault copy level and tries again.

import { normalizeSourceText } from '@/lib/normalize-source-text';
import { sha256 } from '@/lib/vault/path';
import { legacyDecks, returnDeckToLocal, shelfEngine, takeDeckIntoVault, vaultDecks } from './deck-shelf-io';
import { studioVault, withMediaLock } from './media-vault';
import { BACKED_UP_KEY, BACKUP_PATH, MAX_DEAD_ATTEMPTS } from './media-vault-move';
import { deckDirection, decksReady } from './studio-store';

const ATTEMPT_KEY = 'lattice-deck-move-attempt';
/** Set once this device has refreshed the backup for the deck move. */
export const DECK_BACKUP_KEY = 'lattice-deck-move-backed-up';
/** How many decks the last move-back could not put back (they stay readable in the vault). */
export const DECK_MOVE_BACK_LEFT_KEY = 'lattice-deck-move-back-left';
const BACKUP_TMP = `${BACKUP_PATH}.tmp`;

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
			/* no localStorage: no guard and no once-mark */
		}
	},
};

export type DeckMoveReport = {
	stopped?: 'no-vault' | 'backup-failed' | 'gave-up';
	/** 'rewritten': the backup now holds today's decks. 'kept': it was already refreshed, or the person deleted it. */
	backup: 'rewritten' | 'kept' | 'none';
	moved: number;
	/** Decks whose copy did not read back the same, or that were saved to during the move; tried again next start. */
	failed: number;
};

export type DeckMoveDeps = {
	/** Builds the backup zip. Default: `packWorkspace`, the Download backup (it reads photos from the vault). */
	pack?: (now: number) => Promise<Blob>;
	now?: number;
};

async function bytesAt(vault: { read(p: string): Promise<Blob> }, path: string): Promise<Uint8Array> {
	return new Uint8Array(await (await vault.read(path)).arrayBuffer());
}

/** Rewrite `BACKUP_PATH` with today's workspace: temp, read back, check, copy over, read back, check. */
async function refreshBackup(vault: NonNullable<Awaited<ReturnType<typeof studioVault>>>, deps: DeckMoveDeps): Promise<boolean> {
	const pack = deps.pack ?? (async (now: number) => (await import('./workspace-backup')).packWorkspace(now));
	try {
		const bytes = new Uint8Array(await (await pack(deps.now ?? Date.now())).arrayBuffer());
		const want = await sha256(bytes);
		const check = async (path: string) => {
			const got = await bytesAt(vault, path);
			if (got.byteLength !== bytes.byteLength || (await sha256(got)) !== want) throw new Error('the vault stored a different backup');
		};
		await vault.write(BACKUP_TMP, new Blob([bytes]));
		await check(BACKUP_TMP);
		await vault.write(BACKUP_PATH, new Blob([bytes]));
		await check(BACKUP_PATH);
		await vault.remove(BACKUP_TMP).catch(() => {});
		return true;
	} catch {
		// The old zip is untouched: a vault write replaces a file only once its new bytes are stored.
		await vault.remove(BACKUP_TMP).catch(() => {});
		return false;
	}
}

export function moveDecksIntoVault(deps: DeckMoveDeps = {}): Promise<DeckMoveReport> {
	return withMediaLock('exclusive', async () => {
		const report: DeckMoveReport = { backup: 'none', moved: 0, failed: 0 };
		const vault = await studioVault();
		if (!vault) return { ...report, stopped: 'no-vault' };
		await decksReady();
		const pending = legacyDecks();
		if (!pending.length) return report;
		const dead = Number(ls.get(ATTEMPT_KEY)) || 0;
		if (dead >= MAX_DEAD_ATTEMPTS) return { ...report, stopped: 'gave-up' };
		ls.set(ATTEMPT_KEY, String(dead + 1));
		if (ls.get(DECK_BACKUP_KEY) !== '1') {
			const have = (await vault.list('.lattice/backups').catch(() => [])).some((e) => e.path === BACKUP_PATH);
			const deletedByPerson = !have && ls.get(BACKED_UP_KEY) === '1';
			if (!deletedByPerson) {
				if (!(await refreshBackup(vault, deps))) {
					ls.set(ATTEMPT_KEY, null);
					return { ...report, stopped: 'backup-failed' };
				}
				report.backup = 'rewritten';
				ls.set(BACKED_UP_KEY, '1');
			} else report.backup = 'kept';
			ls.set(DECK_BACKUP_KEY, '1');
		} else report.backup = 'kept';
		const dv = await shelfEngine();
		if (!dv) return { ...report, stopped: 'no-vault' };
		for (const { id, raw } of legacyDecks()) {
			let text: string;
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed !== 'string') throw new Error('not a deck');
				text = normalizeSourceText(parsed);
			} catch {
				report.failed++; // a corrupt key stays where it is; the Studio reads it as it always has
				continue;
			}
			try {
				const back = await dv.moveIn(id, text);
				if (back === text && takeDeckIntoVault(id, raw, text)) report.moved++;
				else report.failed++;
			} catch {
				report.failed++;
			}
		}
		ls.set(ATTEMPT_KEY, null);
		return report;
	});
}

export type DeckMoveBackReport = { movedBack: number; left: number };

/** The way back (`DECK_DIRECTION = 'local'`): each vault deck into its key, read back, then its vault files go. */
export function moveDecksOutOfVault(): Promise<DeckMoveBackReport> {
	return withMediaLock('exclusive', async () => {
		const report: DeckMoveBackReport = { movedBack: 0, left: 0 };
		const vault = await studioVault();
		if (!vault) return report;
		await decksReady();
		const dv = await shelfEngine();
		if (!dv) return report;
		for (const { id, text: shelfText } of vaultDecks()) {
			try {
				const text = (await dv.readDeck(id)) ?? shelfText;
				// The key is written and read back before a vault file goes, so a tab that dies in between leaves the
				// deck in both places, and the key wins.
				if (text === null || !returnDeckToLocal(id, text)) {
					report.left++;
					continue;
				}
				await dv.remove(id);
				report.movedBack++;
			} catch {
				report.left++;
			}
		}
		ls.set(DECK_MOVE_BACK_LEFT_KEY, String(report.left));
		if (report.left) console.warn(`lattice: ${report.left} deck(s) could not move back out of the storage vault; they still read from it`);
		return report;
	});
}

/** At boot, off the paint path: the move, or the move-back on the way-back release. */
export function settleDeckStorage(): Promise<DeckMoveReport | DeckMoveBackReport> {
	return deckDirection() === 'local' ? moveDecksOutOfVault() : moveDecksIntoVault();
}
