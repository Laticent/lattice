// The deck shelf's vault side (vault slice 3), loaded on first use: the shelf's hydration, each deck's ordered
// write queue, and the move's hand-overs. The synchronous half, and the guard, are in studio-store.ts.
// As built: engineering/decisions/2026-11-28-vault-slice-3-as-built.md.

import type { DeckVault } from './deck-vault';
import { DECKS } from './decks';
import { shelfInternals as S, SRC_PREFIX, titleFromSource } from './studio-store';

let engineP: Promise<DeckVault | null> | null = null;
/** This tab's one deck engine (null with no vault). The move uses it too, so the tab holds one Web Lock slot. */
export function shelfEngine(): Promise<DeckVault | null> {
	engineP ??= (async () => {
		const [{ studioVault }, { DeckVault: Engine }] = await Promise.all([import('./media-vault'), import('./deck-vault')]);
		const vault = await studioVault();
		return vault ? new Engine({ vault }) : null;
	})().catch(() => {
		engineP = null;
		return null;
	});
	return engineP;
}

/** Each deck's vault writes, in order. A save waits for the one before it, so its base is what that one left. */
const chains = new Map<string, Promise<void>>();
/** A deck whose last write failed before its edit reached the doc: that write's base, which the next one diffs from,
 *  so the failed save's edits ride with it instead of reading as already stored. */
const failedBase = new Map<string, string>();
let stopWatch: (() => void) | null = null;

function queue(id: string, op: (dv: DeckVault) => Promise<void>): Promise<void> {
	const p = (chains.get(id) ?? Promise.resolve()).then(async () => {
		const dv = await shelfEngine();
		if (!dv) throw new Error('the storage vault did not open');
		await op(dv);
	});
	const settledP = p.catch(() => {});
	chains.set(id, settledP);
	void settledP.then(() => {
		if (chains.get(id) === settledP) chains.delete(id);
	});
	return p;
}
export async function settled(): Promise<void> {
	while (chains.size) await Promise.all([...chains.values()]);
}
export function reset(): void {
	engineP = null;
	chains.clear();
	failedBase.clear();
	stopWatch?.();
	stopWatch = null;
}

export function queueSave(id: string, base: string, source: string): void {
	queue(id, async (dv) => {
		const from = failedBase.get(id) ?? base;
		try {
			const { merged } = await dv.save(id, from, source);
			failedBase.delete(id);
			S.vaultText.set(id, merged);
			if (S.loadActiveDeck()?.deckId === id && S.shelf.get(id)?.text === source) S.writeBootCache(id);
			if (merged !== source && S.shelf.get(id)?.text === source) heardDeck(id, merged, source);
		} catch (error) {
			// Failed after the edit reached the doc (deck-vault `isHeld`): the doc holds it, and the next write carries it.
			if (!(error as { deckHeld?: boolean } | null)?.deckHeld && !failedBase.has(id)) failedBase.set(id, from);
			throw error;
		}
	}).catch((error) => S.reportSourceWriteError(id, error));
}
export function removeDeck(id: string): void {
	void queue(id, (dv) => dv.remove(id)).catch(() => {});
}
export function clearDecks(ids: string[]): void {
	for (const id of ids) removeDeck(id);
	// Files of decks no index names (an earlier delete that did not finish).
	void queue('*', async (dv) => {
		for (const e of await dv.vault.list('Decks').catch(() => [])) await dv.vault.remove(e.path).catch(() => {});
		for (const e of await dv.vault.list('.lattice/decks', { recursive: true }).catch(() => [])) await dv.vault.remove(e.path).catch(() => {});
	}).catch(() => {});
}

/** A new text for `id` from the vault: another tab's save, or a merge of this tab's save with one. */
function heardDeck(id: string, text: string, from?: string): void {
	S.vaultText.set(id, text);
	const e = S.shelf.get(id);
	if (e?.text === text) return;
	const base = from ?? e?.base ?? text;
	const active = S.loadActiveDeck()?.deckId === id;
	S.shelf.set(id, { text, base: active && S.mergedListeners.size ? base : text });
	S.recordListTitles({ [id]: [JSON.stringify(text).length, S.listTitleOf(text)] });
	if (active) {
		S.writeBootCache(id);
		for (const fn of S.mergedListeners) fn({ deckId: id, from: base, text });
	}
}

/**
 * Read every vault deck onto the shelf, and rebuild the caches from the vault (design §8): the index's `vault` marks,
 * an index entry for a deck only the vault knows, and the boot cache. A deck still in its localStorage key stays
 * there until the move takes it.
 */
export async function hydrate(): Promise<void> {
	S.seedBoot(); // the boot cache is on the shelf first, so a cut-off save in it can be told apart below
	const dv = await shelfEngine();
	S.setVault(dv ? 'yes' : 'no');
	if (!dv) return;
	const { texts, unreadable } = await dv.readAll();
	const index = S.loadIndex();
	let changed = false;
	for (const [id, text] of texts) {
		if (S.hasLegacySource(id)) continue;
		let e = index.find((x) => x.id === id);
		if (!e) {
			e = { id, title: titleFromSource(text, 'Untitled deck'), builtin: DECKS.some((d) => d.id === id) };
			index.push(e);
			changed = true;
		}
		if (!e.vault) {
			e.vault = true;
			changed = true;
		}
	}
	// A mark with no file: the deck was deleted in another tab, or never written. An unreadable file keeps its mark.
	for (const e of index) {
		if (e.vault && !texts.has(e.id) && !unreadable.includes(e.id) && !S.unmarked.has(e.id)) {
			delete e.vault;
			changed = true;
		}
	}
	if (changed) S.saveIndex(index);
	const cache = S.read<{ id?: string; base?: string }>(S.BOOT_SRC_LS);
	for (const [id, text] of texts) {
		if (S.hasLegacySource(id)) continue;
		const mine = S.shelf.get(id)?.text;
		if (cache?.id === id && mine != null && mine !== text && cache.base === S.fnv(text)) {
			// The boot deck's last save never reached the vault (a reload cut it off): save it again, from its base.
			S.vaultText.set(id, text);
			queueSave(id, text, mine);
			continue;
		}
		heardDeck(id, text);
	}
	const active = S.loadActiveDeck()?.deckId;
	if (active) S.writeBootCache(active);
	stopWatch = dv.watch((id) => {
		if (chains.has(id)) return; // this tab's own save is in flight: its result carries the merge
		void dv
			.readDeck(id)
			.then((t) => {
				if (t !== null && S.isVaultDeck(id)) heardDeck(id, t);
			})
			.catch(() => {});
	});
	if (typeof addEventListener === 'function') addEventListener('pagehide', () => void dv.promoteAll().catch(() => {}));
}

// For the move (deck-vault-move.ts).
/** The index's decks whose text is still in its `SRC_PREFIX` key, with that key's raw value. */
export function legacyDecks(): { id: string; raw: string }[] {
	const out: { id: string; raw: string }[] = [];
	for (const e of S.loadIndex()) {
		try {
			const raw = localStorage.getItem(SRC_PREFIX + e.id);
			if (raw !== null) out.push({ id: e.id, raw });
		} catch {
			/* unavailable */
		}
	}
	return out;
}
/** The vault has `text` for `id`, read back and checked. If the key still holds `raw` (nothing saved meanwhile), the
 *  deck becomes a vault deck and its key goes. Synchronous, so no save can land between the check and the swap. */
export function takeDeckIntoVault(id: string, raw: string, text: string): boolean {
	try {
		if (localStorage.getItem(SRC_PREFIX + id) !== raw) return false;
	} catch {
		return false;
	}
	S.shelf.set(id, { text, base: text });
	S.vaultText.set(id, text);
	S.markVault(id, true);
	S.recordListTitles({ [id]: [JSON.stringify(text).length, S.listTitleOf(text)] });
	S.remove(SRC_PREFIX + id);
	if (S.loadActiveDeck()?.deckId === id) S.writeBootCache(id);
	return true;
}
/** Vault decks with their shelf text (the move-back reads these). */
export function vaultDecks(): { id: string; text: string | null }[] {
	return [...S.vaultIds()].map((id) => ({ id, text: S.shelf.get(id)?.text ?? null }));
}
/** Put `text` back in `id`'s key; true when it is there, read back. The vault's files go after (the caller). */
export function returnDeckToLocal(id: string, text: string): boolean {
	if (S.writeOrError(SRC_PREFIX + id, JSON.stringify(text)) !== null) return false;
	if (S.read<string>(SRC_PREFIX + id) !== text) return false;
	S.markVault(id, false);
	S.shelf.delete(id);
	S.vaultText.delete(id);
	if (S.read<{ id?: string }>(S.BOOT_SRC_LS)?.id === id) S.remove(S.BOOT_SRC_LS);
	return true;
}
