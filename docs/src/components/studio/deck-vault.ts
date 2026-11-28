// Decks in the storage vault, in their final form (design §6.4, slice 3). As built:
// engineering/decisions/2026-11-28-vault-slice-3-as-built.md.
//
// THE FILES, per deck (`id` is the deck's stable id; human names arrive with sync, as an index-only move):
//   Decks/<id>.md                                   the readable copy: the merged doc's text, LF, no BOM
//   .lattice/decks/<id>/base-<sha256>.yjs           the doc the deck started from (the move, or its first save)
//   .lattice/decks/<id>/updates/<device>-<seq>.yjsu one device's edits, at most one file a minute
//   .lattice/decks/<id>/pending/<device>-<slot>.yjsu this tab's edits since its last update file, rewritten on
//                                                   every save, so a closed tab loses nothing; local only
//   .lattice/decks/<id>/head.json                   the stamp: sha256 of deck.md's text and the doc snapshot it
//                                                   was written from (the chained base for an outside edit)
//
// A SAVE, under the deck's Web Lock: catch up on every file another tab wrote, merge three-way against the
// text this tab last had (deck-doc `localSave`), write the pending file, then deck.md, then head.json. The
// order is the crash rule: deck.md never holds text the doc files lack, so a deck.md that differs from the doc
// with a stamp that does not match it is an edit made outside Lattice, and a deck.md that matches its stamp
// but trails the doc is one this tab could not finish writing.
//
// Yjs (~90 KB) loads with this module, which the store imports on first use: the Studio's eager bundle
// carries none of it (check:route-budget).
import type { Change, Vault } from '@/lib/vault';
import { defaultLocks } from '@/lib/vault/backing';
import { adoptOutside, clientIdFor, type DeckDoc, deckDoc, docText, encodeDoc, hasPending, headOf, loadDoc, localSave, mergeUpdates, applyUpdate as yApply } from '@/lib/vault/deck-doc';
import { sha256 } from '@/lib/vault/path';

export const DECKS_DIR = 'Decks';
export const deckPath = (id: string) => `${DECKS_DIR}/${id}.md`;
export const deckMetaDir = (id: string) => `.lattice/decks/${id}`;
const headPath = (id: string) => `${deckMetaDir(id)}/head.json`;
/** At most one update file a minute per tab (§6.4); the pending file carries the edits in between. */
export const PROMOTE_MS = 60_000;
/** Web Lock slots a tab may hold; a tab past the last one gets a random client id for this session. */
const SLOTS = 64;

const enc = new TextEncoder();
const shaText = (text: string) => sha256(enc.encode(text));
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const codeOf = (err: unknown): string | undefined => (err as { code?: string } | null)?.code;
const notFound = (err: unknown) => {
	if (codeOf(err) !== 'not-found') throw err;
};
async function bytesOf(vault: Vault, path: string): Promise<Uint8Array> {
	return new Uint8Array(await (await vault.read(path)).arrayBuffer());
}

type Head = { sha256: string; head: string };
type Open = {
	doc: DeckDoc;
	/** Every doc file this tab has applied, by path → revision, so catching up reads only what changed. */
	seen: Map<string, number>;
	/** This tab's own updates since its last update file. */
	own: Uint8Array[];
	promotedAt: number;
};

export type DeckVaultDeps = {
	vault: Vault & { deviceId(): Promise<string>; nextSeq(): Promise<number> };
	/** Test seam: the tab's slot, instead of a Web Lock. */
	slot?: number | null;
	now?: () => number;
};

export type DeckWrite = {
	/** The doc's text after the save: the saved text, unless another tab changed the deck since this tab's base. */
	merged: string;
};

/**
 * One tab's view of the decks in the vault. Each deck's doc is opened on its first save in this tab (boot reads
 * only the deck.md files), and kept open.
 */
export class DeckVault {
	readonly vault: DeckVaultDeps['vault'];
	private readonly now: () => number;
	private readonly locks = defaultLocks();
	private readonly docs = new Map<string, Promise<Open>>();
	private identity: Promise<{ device: string; slot: number | null; clientID: number }> | null = null;
	private readonly slotOverride: number | null | undefined;

	constructor(deps: DeckVaultDeps) {
		this.vault = deps.vault;
		this.now = deps.now ?? Date.now;
		this.slotOverride = deps.slot;
	}

	/** Every deck.md in the vault: the shelf's hydration. A file that cannot be read is left out and named. */
	async readAll(): Promise<{ texts: Map<string, string>; unreadable: string[] }> {
		const texts = new Map<string, string>();
		const unreadable: string[] = [];
		for (const e of await this.vault.list(DECKS_DIR)) {
			const m = /^Decks\/(.+)\.md$/.exec(e.path);
			if (!m) continue;
			try {
				texts.set(m[1], await (await this.vault.read(e.path)).text());
			} catch {
				unreadable.push(m[1]);
			}
		}
		return { texts, unreadable };
	}

	async readDeck(id: string): Promise<string | null> {
		try {
			return await (await this.vault.read(deckPath(id))).text();
		} catch (err) {
			notFound(err);
			return null;
		}
	}

	/** This tab's device id, Web Lock slot and Yjs client id (spike 2d: one stable id per slot, never shared). */
	private me() {
		this.identity ??= (async () => {
			const device = await this.vault.deviceId();
			const slot = this.slotOverride !== undefined ? this.slotOverride : await takeSlot();
			const clientID = slot === null ? (Math.floor(Math.random() * 0x3ffffffe) + 1) : clientIdFor(`tab:${device}:${slot}`);
			if (slot !== null) await this.adoptLeftovers(device, slot);
			return { device, slot, clientID };
		})();
		return this.identity;
	}

	/** A slot's previous holder may have closed with edits only in its pending files: make them update files. */
	private async adoptLeftovers(device: string, slot: number): Promise<void> {
		const all = await this.vault.list('.lattice/decks', { recursive: true }).catch(() => []);
		for (const e of all) {
			const m = /^\.lattice\/decks\/(.+)\/pending\/(.+)-(\d+)\.yjsu$/.exec(e.path);
			if (!m || m[2] !== device || Number(m[3]) !== slot) continue;
			await this.withDeckLock(m[1], async () => {
				const bytes = await bytesOf(this.vault, e.path).catch(() => null);
				if (bytes?.length) await this.vault.write(`${deckMetaDir(m[1])}/updates/${device}-${seqName(await this.vault.nextSeq())}.yjsu`, bytes);
				await this.vault.remove(e.path).catch(notFound);
			});
		}
	}

	private pendingPath(id: string, device: string, slot: number | null, clientID: number) {
		return `${deckMetaDir(id)}/pending/${device}-${slot ?? `c${clientID}`}.yjsu`;
	}

	withDeckLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
		return this.locks.request(`lattice-deck-doc:${id}`, 'exclusive', fn);
	}

	/** Apply every doc file of `id` this tab has not seen yet (another tab's pending and update files). A deck with
	 *  no base is fine: its first save's update is the whole text, and a later compaction (slice 6) makes the base. */
	private async catchUp(id: string, open: Open, mine: string): Promise<void> {
		const files = await this.vault.list(deckMetaDir(id), { recursive: true });
		const fresh = files.filter((e) => /\.yjsu?$/.test(e.path) && e.path !== mine && open.seen.get(e.path) !== e.revision);
		if (!fresh.length) return;
		// Every new file first: the list is in path order, not causal order, and Yjs parks an early update until what it
		// depends on arrives. Only what is still pending after all of them is from history this doc lacks.
		for (const e of fresh) yApply(open.doc, await bytesOf(this.vault, e.path));
		if (!hasPending(open.doc)) {
			for (const e of fresh) open.seen.set(e.path, e.revision);
			return;
		}
		// Finding 2b-ii: reopen from the files, which sets the stray update aside (and never marks it seen), and keep
		// this tab's own edits, which the files may not hold yet.
		const re = await this.loadOpen(id, open.doc.clientID, mine);
		open.doc = re.doc;
		open.seen = re.seen;
		for (const u of open.own) yApply(open.doc, u);
	}

	private async loadOpen(id: string, clientID: number, mine: string): Promise<Open> {
		const files = await this.vault.list(deckMetaDir(id), { recursive: true });
		const bases = files.filter((e) => /\/base-[0-9a-f]+\.yjs$/.test(e.path));
		const ups = files.filter((e) => /\.yjsu$/.test(e.path));
		const seen = new Map<string, number>();
		const base = bases.length ? mergeUpdates(await Promise.all(bases.map((e) => bytesOf(this.vault, e.path)))) : null;
		for (const e of bases) seen.set(e.path, e.revision);
		const updates = [];
		for (const e of ups) {
			updates.push({ name: e.path, bytes: await bytesOf(this.vault, e.path) });
			seen.set(e.path, e.revision);
		}
		const { doc, pending } = loadDoc(clientID, base, updates);
		for (const name of pending) seen.delete(name); // a set-aside file is tried again on the next catch-up
		seen.delete(mine);
		return { doc, seen, own: [], promotedAt: this.now() };
	}

	/** Open `id`'s doc, reconciled with deck.md: a stale deck.md is rewritten, an outside edit is adopted. */
	private open(id: string): Promise<Open> {
		let p = this.docs.get(id);
		if (!p) {
			p = (async () => {
				const { device, slot, clientID } = await this.me();
				const mine = this.pendingPath(id, device, slot, clientID);
				const open = await this.loadOpen(id, clientID, mine);
				await this.reconcile(id, open, mine);
				return open;
			})();
			p.catch(() => this.docs.delete(id));
			this.docs.set(id, p);
		}
		return p;
	}

	private async reconcile(id: string, open: Open, mine: string): Promise<void> {
		const md = await this.readDeck(id);
		const cur = docText(open.doc);
		if (md === null || md === cur) return;
		const head = await this.readHead(id);
		const mdSha = await shaText(md);
		if (cur !== '' && head?.sha256 === mdSha) return; // deck.md trails the doc: the next write brings it level
		// An edit made outside Lattice (or a deck whose doc files are new or were lost): adopt deck.md on a fork at the
		// stamp's state, as a client named by the text, so two tabs adopting it create the same items.
		const adopted = head ? adoptOutside(open.doc, unb64(head.head), md, `${id}:${mdSha}`) : null;
		const res = adopted ?? localSave(open.doc, cur, md);
		if (res.delta) await this.persistOwn(open, mine, res.delta);
	}

	private async readHead(id: string): Promise<Head | null> {
		try {
			const h = JSON.parse(await (await this.vault.read(headPath(id))).text()) as Head;
			return typeof h?.sha256 === 'string' && typeof h.head === 'string' ? h : null;
		} catch {
			return null;
		}
	}

	private async persistOwn(open: Open, mine: string, delta: Uint8Array): Promise<void> {
		open.own.push(delta);
		await this.vault.write(mine, mergeUpdates(open.own));
	}

	/**
	 * Save `next` for deck `id`. `base` is the text this tab last had for the deck. Writes the pending file, then
	 * deck.md, then the stamp. Throws what the vault throws (a full disk is a `QuotaExceededError`).
	 */
	async save(id: string, base: string, next: string): Promise<DeckWrite> {
		// Identity first, outside the deck lock: taking a slot adopts its leftovers under deck locks.
		const { device, slot, clientID } = await this.me();
		return this.withDeckLock(id, async () => {
			const open = await this.open(id);
			const mine = this.pendingPath(id, device, slot, clientID);
			await this.catchUp(id, open, mine);
			const { merged, delta } = localSave(open.doc, base, next);
			try {
				if (delta) await this.persistOwn(open, mine, delta);
				await this.writeReadable(id, open.doc);
				if (open.own.length && this.now() - open.promotedAt >= PROMOTE_MS) await this.promoteLocked(id, open, device, mine);
			} catch (err) {
				// The edit is in this tab's doc and in `own`, so the next write that lands carries it: mark the error so the
				// caller diffs its next save from this one's text, not from before it.
				throw markHeld(err);
			}
			return { merged };
		});
	}

	private async writeReadable(id: string, doc: DeckDoc): Promise<void> {
		const text = docText(doc);
		if ((await this.readDeck(id)) !== text) await this.vault.write(deckPath(id), text);
		const head: Head = { sha256: await shaText(text), head: b64(headOf(doc)) };
		await this.vault.write(headPath(id), JSON.stringify(head));
	}

	/** Turn this tab's pending edits into one update file (`<device>-<seq>`, seq under the vault's lock). */
	private async promoteLocked(id: string, open: Open, device: string, mine: string): Promise<void> {
		const path = `${deckMetaDir(id)}/updates/${device}-${seqName(await this.vault.nextSeq())}.yjsu`;
		const e = await this.vault.write(path, mergeUpdates(open.own));
		open.seen.set(path, e.revision);
		open.own = [];
		open.promotedAt = this.now();
		await this.vault.remove(mine).catch(notFound);
	}

	/** Promote every open deck's pending edits now: on page hide, and in tests. */
	async promoteAll(): Promise<void> {
		const { device, slot, clientID } = await this.me();
		for (const [id, p] of this.docs) {
			const open = await p.catch(() => null);
			if (open?.own.length) await this.withDeckLock(id, () => this.promoteLocked(id, open, device, this.pendingPath(id, device, slot, clientID)));
		}
	}

	/**
	 * Write a deck as it is moved in: a base made by the move's client (one per device and deck, so a rerun makes
	 * the same items), deck.md and the stamp. Returns the text read back from the vault.
	 */
	async moveIn(id: string, text: string): Promise<string | null> {
		await this.me();
		return this.withDeckLock(id, async () => {
			const device = await this.vault.deviceId();
			const files = await this.vault.list(deckMetaDir(id)).catch(() => []);
			if (!files.some((e) => /\/base-[0-9a-f]+\.yjs$/.test(e.path))) {
				const doc = deckDoc(clientIdFor(`move:${device}:${id}`));
				localSave(doc, '', text);
				const bytes = encodeDoc(doc);
				await this.vault.write(`${deckMetaDir(id)}/base-${await sha256(bytes)}.yjs`, bytes);
				this.docs.delete(id);
				const open = await this.open(id);
				await this.writeReadable(id, open.doc);
			} else {
				// A rerun after a move that died: the base is there; bring the doc to the text through an ordinary save.
				const open = await this.open(id);
				const cur = docText(open.doc);
				const { clientID, slot } = await this.me();
				const mine = this.pendingPath(id, device, slot, clientID);
				const { delta } = localSave(open.doc, cur, text);
				if (delta) await this.persistOwn(open, mine, delta);
				await this.writeReadable(id, open.doc);
			}
			return this.readDeck(id);
		});
	}

	/** Remove a deck's files: deck.md and everything under its `.lattice/decks/<id>/`. */
	remove(id: string): Promise<void> {
		return this.withDeckLock(id, async () => {
			this.docs.delete(id);
			await this.vault.remove(deckPath(id)).catch(notFound);
			for (const e of await this.vault.list(deckMetaDir(id), { recursive: true }).catch(() => [])) await this.vault.remove(e.path).catch(notFound);
		});
	}

	/** Hear deck.md changes another tab made. */
	watch(fn: (id: string, change: Change) => void): () => void {
		return this.vault.watch((changes) => {
			for (const c of changes) {
				if (c.origin !== 'remote') continue;
				const m = /^Decks\/(.+)\.md$/.exec(c.path);
				if (m) fn(m[1], c);
			}
		});
	}
}

/** Zero-padded, so a path listing sorts update files in the order they were written. */
const seqName = (n: number) => String(n).padStart(10, '0');

/** An error after the save's edit reached this tab's doc: the edit is held there and goes out with the next write. */
export const isHeld = (err: unknown): boolean => (err as { deckHeld?: boolean } | null)?.deckHeld === true;
function markHeld(err: unknown): unknown {
	try {
		(err as { deckHeld?: boolean }).deckHeld = true;
		return err;
	} catch {
		return Object.assign(new Error(String(err)), { deckHeld: true });
	}
}

/** Hold the lowest free `lattice-deck-slot-<n>` Web Lock for the rest of this tab's life, or null without Web Locks. */
async function takeSlot(): Promise<number | null> {
	const locks = (globalThis.navigator as Navigator | undefined)?.locks;
	if (!locks?.request) return null;
	for (let n = 0; n < SLOTS; n++) {
		const got = await new Promise<boolean>((resolve) => {
			locks
				.request(`lattice-deck-slot-${n}`, { ifAvailable: true }, (lock) => {
					resolve(!!lock);
					return lock ? new Promise<void>(() => {}) : undefined; // held until the tab closes
				})
				.catch(() => resolve(false));
		});
		if (got) return n;
	}
	return null;
}
