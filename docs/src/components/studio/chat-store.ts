// Chat threads storage: IndexedDB behind a synchronous cache.
//
// WHY THIS EXISTS. Chats used to live in localStorage, in the same ~5.2 M character
// allowance as every deck's text (half that in WebKit once a string holds a non-Latin-1
// character, measured in 2026-11-11-studio-storage-pointer-records.md §10). Sixty
// replies on each of 40 decks is about 1.4 M characters: a quarter of the allowance
// spent on threads, and when it fills, deck edits stop saving. Nothing reads a chat
// before paint or on `pagehide`, so chats are the cheapest thing to move
// (that note, §4 item 4).
//
// THE SHAPE.
//   · One record per deck, `{ deckId, messages }`, in `lattice-studio-chats` / `chats`.
//   · Reads are synchronous, from a cache that holds only the decks this page loaded
//     (`hydrateChat`). A deck not loaded yet reads its legacy localStorage thread, so a
//     returning author never sees an empty chat while the first read is in flight.
//   · `writeChat` updates the cache at once and stores the thread in one transaction.
//     A failed transaction writes the thread to the legacy localStorage key instead.
//
// HOW THE TWO STORES AGREE. A legacy localStorage thread next to an IndexedDB record exists
// because (a) this build's IndexedDB write failed and fell back to it, or this session lost
// IndexedDB; or (b) an older build in another tab wrote it after the migration deleted the key.
// (a) is this build's latest state, a regenerate or a compaction included, so it replaces the
// record: `lsWrite` keeps its fingerprint, and the key wins while it still holds that exact text.
// (b) can hold anything, because the older build saves on mount and on a deck switch: an empty
// "[]" for a deck it found no key for, an older copy of the thread, or a new conversation. So
// `mergeThreads` keeps every message of both, in order. Loading a deck stores the result and deletes
// the key only after that transaction committed and only while the key still holds the exact text.
//
// WHAT IS GIVEN UP, stated rather than hidden (2026-11-11-studio-storage-pointer-records.md
// §11): the keys are deleted once moved, not kept until a later release, because freeing the
// space is the point; rolling this build back hides migrated chats from the older build (they
// are still in IndexedDB and come back with this build). And Clear all is guarded by a per-tab
// generation only, as the localStorage store was: a frozen tab's late write can bring one
// thread back.
//
// MIGRATION. `migrateLegacyChats` moves every legacy thread once the page is idle, so
// the localStorage space frees up without the author opening each chat.
//
// NO INDEXEDDB (private modes, a database that will not open, tests without
// fake-indexeddb): the module reads and writes localStorage as the Studio always did.
//
// What this module does NOT know: the cap on a thread and which traces to drop. Those
// stay in studio-store.ts `saveChat`, which hands over the thread to store and the
// smaller versions to try when localStorage refuses it.

import type { ChatMessage } from './studio-store';

/** + deckId → ChatMessage[], the legacy localStorage key (and the fallback store). */
export const CHAT_PREFIX = 'lattice-studio-chat-';
/** Keys under CHAT_PREFIX that are NOT a deck's thread: the chat's model choice
 *  (`CHAT_SELECTION_KEY`, lib/model-selection.js; spelled out here so the boot path does not load
 *  that module; chat-store.test.ts pins the two together). A preference, never migrated or cleared. */
export const NOT_A_THREAD: ReadonlySet<string> = new Set(['lattice-studio-chat-selection', 'lattice-studio-chat-fallback']);

const DB_NAME = 'lattice-studio-chats';
const DB_VERSION = 1;
const STORE = 'chats'; // records: { deckId, messages }, keyPath deckId

type Backend = 'idb' | 'local';
type Rec = { deckId: string; messages: ChatMessage[] };

export type ChatStoreError = { deckId: string; error: unknown; kind: 'save' | 'read' };

let backend: Backend = typeof indexedDB === 'undefined' ? 'local' : 'idb';
const cache = new Map<string, ChatMessage[]>(); // decks this page loaded, or wrote
const loading = new Map<string, Promise<void>>();
const fromDb = new Set<string>(); // decks whose thread this page read from IndexedDB: their writes build on the stored thread
const readFailed = new Set<string>(); // a deck whose stored thread could not be read: writes to it are refused
const writeSeq = new Map<string, number>(); // bumped by every write or drop of a deck
let generation = 0; // bumped by a clear: a read issued before it must not refill the cache
let dbPromise: Promise<IDBDatabase> | null = null;
let dbOpenFailed = false;
let pending = new Set<Promise<unknown>>();
let channel: BroadcastChannel | null = null;
const errorListeners = new Set<(e: ChatStoreError) => void>();
let migrationScheduled = false;
let migrationEpoch = 0; // bumped by a test reset: a migration scheduled before it does nothing

// ── localStorage (the legacy store, and the fallback) ───────────────────────

function lsRaw(deckId: string): string | null {
	try {
		return localStorage.getItem(CHAT_PREFIX + deckId);
	} catch {
		return null;
	}
}
function parse(raw: string | null): ChatMessage[] | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? (v as ChatMessage[]) : null;
	} catch {
		return null;
	}
}
/** Store the first attempt localStorage accepts; the error of the last refusal, or null. `latest`:
 *  the thread was built on the deck's loaded thread, so it is this build's latest state and replaces
 *  the record on the next load (see "Which legacy threads this build wrote"). A session that never
 *  read IndexedDB does not know the stored thread, so its writes are merged instead. */
function lsWrite(deckId: string, attempts: ChatMessage[][], latest = false): unknown {
	let last: unknown = null;
	for (const list of attempts) {
		try {
			const raw = JSON.stringify(list);
			localStorage.setItem(CHAT_PREFIX + deckId, raw);
			setFallbackMark(deckId, latest ? raw : null);
			return null;
		} catch (e) {
			last = e ?? new Error('localStorage write failed');
		}
	}
	return last;
}
function lsRemove(deckId: string): void {
	try {
		localStorage.removeItem(CHAT_PREFIX + deckId);
	} catch {
		/* storage unavailable */
	}
	setFallbackMark(deckId, null);
}
/** The same message, for merging: role and words. Traces and flags are not compared, because a
 *  write that fell back to localStorage drops old traces to fit (studio-store.ts `saveChat`). */
const same = (a: ChatMessage, b: ChatMessage) => a.role === b.role && a.content === b.content;

/**
 * Join a stored thread and a legacy thread written by ANOTHER build (an older tab; see the header)
 * without losing a message of either, in order. The two are aligned where they overlap the most,
 * every overlapping message equal: that covers one extending the other, a newer thread that the cap
 * trimmed from the front starting partway into an older one, and an older one ending partway into
 * a newer one. The overlap keeps the copies of whichever thread runs on past it (the newer one,
 * whose flags are newer). With no overlap the legacy thread is a new conversation and follows.
 * A legacy thread THIS build wrote is not merged: it is the latest state and wins (`resolveLegacy`).
 */
export function mergeThreads(stored: ChatMessage[], legacy: ChatMessage[]): ChatMessage[] {
	if (!legacy.length) return stored;
	if (!stored.length) return legacy;
	// d = where legacy[0] sits in stored (negative: legacy starts before stored).
	let best: { d: number; overlap: number } | null = null;
	for (let d = -(legacy.length - 1); d <= stored.length - 1; d++) {
		const from = Math.max(0, d);
		const to = Math.min(stored.length, d + legacy.length);
		const overlap = to - from;
		if (overlap <= 0 || (best && overlap <= best.overlap)) continue;
		let ok = true;
		for (let i = from; i < to && ok; i++) ok = same(stored[i], legacy[i - d]);
		if (ok) best = { d, overlap };
	}
	if (!best) {
		// No full overlap. Threads that start alike and then part (an older build's tab continued the thread
		// it had loaded while this build continued it too) share that start: keep it once, then each tail.
		let c = 0;
		while (c < stored.length && c < legacy.length && same(stored[c], legacy[c])) c++;
		// A tail that opens with a reply keeps the question it answers, so it never reads as answering
		// whatever the stored thread ended on.
		while (c > 0 && legacy[c]?.role === 'assistant') c--;
		return [...stored, ...legacy.slice(c)];
	}
	const { d } = best;
	const head = d >= 0 ? stored.slice(0, d) : legacy.slice(0, -d);
	const storedEnd = stored.length;
	const legacyEnd = d + legacy.length; // in stored's positions
	const legacyNewer = legacyEnd > storedEnd || (legacyEnd === storedEnd && d < 0);
	const from = Math.max(0, d);
	const to = Math.min(storedEnd, legacyEnd);
	const middle = legacyNewer ? legacy.slice(from - d, to - d) : stored.slice(from, to);
	const tail = legacyEnd > storedEnd ? legacy.slice(storedEnd - d) : stored.slice(to);
	return [...head, ...middle, ...tail];
}

// ── Which legacy threads this build wrote ───────────────────────────────────
// A thread this build falls back to localStorage for (`writeChat` when IndexedDB refuses, a session
// that lost IndexedDB) is its latest state: a regenerate, a compaction or an answered card included,
// none of which merely extends the stored thread. Merging it would duplicate or undo those, so its
// fingerprint is kept here and, while the key still holds that exact text, it replaces the record.
// A key an older build wrote since has another fingerprint and is merged instead.
const FALLBACK_LS = `${CHAT_PREFIX}fallback`; // { [deckId]: fingerprint }
function fingerprint(raw: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 0x01000193);
	return `${raw.length}:${(h >>> 0).toString(36)}`;
}
function fallbackMarks(): Record<string, string> {
	try {
		const v = JSON.parse(localStorage.getItem(FALLBACK_LS) || '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}
/** Fingerprints THIS tab wrote: the marks key is shared by every tab, and only this tab's own write is known to
 *  hold this tab's loaded thread (`fallBackToLocal`). */
const ownMarks = new Map<string, string>();
function setFallbackMark(deckId: string, raw: string | null): void {
	if (raw == null) ownMarks.delete(deckId);
	else ownMarks.set(deckId, fingerprint(raw));
	const marks = fallbackMarks();
	if (raw == null) {
		if (!(deckId in marks)) return;
		delete marks[deckId];
	} else marks[deckId] = fingerprint(raw);
	try {
		if (Object.keys(marks).length) localStorage.setItem(FALLBACK_LS, JSON.stringify(marks));
		else localStorage.removeItem(FALLBACK_LS);
	} catch {
		/* no mark: the thread is merged instead, which keeps every message */
	}
}
/** The thread to keep, given the stored one and a legacy key's text. */
function resolveLegacy(deckId: string, stored: ChatMessage[], raw: string, legacy: ChatMessage[]): ChatMessage[] {
	return fallbackMarks()[deckId] === fingerprint(raw) ? legacy : mergeThreads(stored, legacy);
}

/** Remove the legacy key only while it still holds `raw`: another tab may have written since. */
function lsRemoveIf(deckId: string, raw: string): void {
	if (lsRaw(deckId) === raw) lsRemove(deckId);
}
function lsLegacyDeckIds(): string[] {
	const ids: string[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k?.startsWith(CHAT_PREFIX) && !NOT_A_THREAD.has(k)) ids.push(k.slice(CHAT_PREFIX.length));
		}
	} catch {
		/* storage unavailable */
	}
	return ids;
}

// ── IndexedDB ───────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;
	const p = new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'deckId' });
		};
		req.onsuccess = () => {
			const db = req.result;
			// A newer tab upgrading the schema, or the browser dropping the connection (a known
			// WebKit failure): let go, so the next transaction opens afresh.
			db.onversionchange = () => {
				db.close();
				if (dbPromise === p) dbPromise = null;
			};
			db.onclose = () => {
				if (dbPromise === p) dbPromise = null;
			};
			resolve(db);
		};
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('chat database blocked'));
	});
	p.catch(() => {
		dbOpenFailed = true;
	});
	dbPromise = p;
	return p;
}

/** One transaction; resolves with `result()` once it committed, rejects with the first real error. */
function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => () => T): Promise<T> {
	return openDB().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				let firstError: unknown = null;
				const t = db.transaction(STORE, mode);
				let result: () => T;
				try {
					const store = t.objectStore(STORE);
					result = run(store);
				} catch (e) {
					try {
						t.abort();
					} catch {
						/* already finished */
					}
					reject(e);
					return;
				}
				t.onerror = () => {
					firstError ??= t.error;
				};
				t.oncomplete = () => resolve(result());
				t.onabort = () => reject(firstError ?? t.error ?? new Error('chat transaction aborted'));
			}),
	);
}

function getRec(deckId: string): Promise<Rec | undefined> {
	return tx('readonly', (store) => {
		const r = store.get(deckId);
		return () => r.result as Rec | undefined;
	});
}
function putRecs(recs: Rec[]): Promise<void> {
	return tx('readwrite', (store) => {
		for (const r of recs) store.put(r);
		return () => undefined;
	});
}

function track<T>(p: Promise<T>): Promise<T> {
	pending.add(p);
	p.finally(() => pending.delete(p)).catch(() => undefined);
	return p;
}

// A failure raised before anyone listens (the Studio subscribes after boot, storage-notices.ts) waits
// here and is handed to the first listener, so it is never dropped. Bounded: only the latest few matter.
let unheard: ChatStoreError[] = [];
function report(e: ChatStoreError): void {
	if (!errorListeners.size) {
		unheard = [...unheard.slice(-4), e];
		return;
	}
	for (const fn of errorListeners) {
		try {
			fn(e);
		} catch {
			/* one listener's failure must not hide the next one */
		}
	}
}

type Msg = { deckId: string } | { all: true };
function broadcast(msg: Msg): void {
	try {
		channel?.postMessage(msg);
	} catch {
		/* a closed channel costs another tab only a stale thread until its next load */
	}
}
function listen(): void {
	if (channel || typeof BroadcastChannel === 'undefined') return;
	channel = new BroadcastChannel(DB_NAME);
	// Another tab stored a thread (or cleared them all): forget ours, so the next load reads theirs.
	// Not pushed into an open panel: a thread changing under the author mid-turn is worse than the
	// last-writer-wins the localStorage store always had, and the next deck switch picks it up.
	channel.onmessage = (ev: MessageEvent<Msg>) => {
		if ('all' in ev.data) {
			generation++;
			cache.clear();
			readFailed.clear();
			fromDb.clear();
		} else {
			cache.delete(ev.data.deckId);
			fromDb.delete(ev.data.deckId); // what this tab shows next is not what it read: never "latest"
		}
	};
}

/** The session moved to localStorage. A function: after an `await` the answer can change. */
function fellBack(): boolean {
	return backend === 'local';
}
function fallBackToLocal(): void {
	if (backend === 'local') return;
	backend = 'local';
	// Said once: threads stored in IndexedDB before it stopped opening are out of reach this session,
	// so a chat can look empty and a backup leaves them out. Nothing is overwritten (`mergeThreads`).
	report({ deckId: '', error: new Error('the chat database would not open'), kind: 'read' });
	// What this page wrote is in the cache; a thread written only to IndexedDB this session is
	// otherwise unreachable now. Copy the cached threads into localStorage, newest data first.
	// Only a deck copied here keeps its "read from IndexedDB" standing: any other deck now shows a
	// localStorage stand-in, and a write built on that must be merged next load, never put over the record.
	// A key holding this tab's own marked fallback write already is that thread (a later successful write
	// would have deleted it), so the deck keeps its standing without a copy. A copy that localStorage
	// refuses does not: a panel opened afterwards would show an empty stand-in.
	const copied = new Set<string>();
	for (const [deckId, messages] of cache) {
		const raw = lsRaw(deckId);
		if (raw != null && fromDb.has(deckId) && ownMarks.get(deckId) === fingerprint(raw)) copied.add(deckId);
		else if (raw == null && messages.length && fromDb.has(deckId) && lsWrite(deckId, [messages], true) == null) copied.add(deckId);
		else if (raw == null && messages.length && !fromDb.has(deckId)) lsWrite(deckId, [messages]);
	}
	for (const id of [...fromDb]) if (!copied.has(id)) fromDb.delete(id);
	cache.clear();
}

// ── Public API ──────────────────────────────────────────────────────────────

/** A deck's thread, synchronously: the loaded thread, else the legacy localStorage one, else []. */
export function readChat(deckId: string): ChatMessage[] {
	if (backend === 'idb') {
		const hit = cache.get(deckId);
		if (hit) return hit;
	}
	return parse(lsRaw(deckId)) ?? [];
}

/** Whether `readChat` returns the stored thread (true) or a stand-in while the first read is in
 *  flight (false). A panel must not SAVE a thread it showed before this was true. */
export function chatLoaded(deckId: string): boolean {
	return backend === 'local' || cache.has(deckId) || readFailed.has(deckId);
}

/** Whether this deck's stored thread could not be read: its writes are refused this session. */
export function chatReadFailed(deckId: string): boolean {
	return backend === 'idb' && readFailed.has(deckId);
}

/** Load one deck's thread into the cache, migrating its legacy thread. Settles at once when loaded. */
export function hydrateChat(deckId: string): Promise<void> {
	if (backend === 'local' || cache.has(deckId)) return Promise.resolve();
	const running = loading.get(deckId);
	if (running) return running;
	listen();
	scheduleChatMigration();
	const gen = generation;
	const seq = writeSeq.get(deckId) ?? 0;
	const p = (async () => {
		let rec: Rec | undefined;
		try {
			// One retry: a dropped connection (the WebKit failure `openDB` handles) fails the first
			// transaction and reopens for the next.
			rec = await getRec(deckId).catch(() => getRec(deckId));
		} catch (error) {
			if (dbOpenFailed) {
				fallBackToLocal();
				return;
			}
			// The stored thread exists and cannot be read. Saving over it would erase it, so this
			// deck's writes are refused this session and the author is told once.
			if (!readFailed.has(deckId)) {
				readFailed.add(deckId);
				report({ deckId, error, kind: 'read' });
			}
			return;
		} finally {
			loading.delete(deckId);
		}
		if (fellBack() || gen !== generation) return;
		// A write landed while the read was in flight: the cache already holds the newer thread,
		// and that write's commit deletes the legacy key.
		if ((writeSeq.get(deckId) ?? 0) !== seq) return;
		readFailed.delete(deckId);
		const raw = lsRaw(deckId);
		const legacy = parse(raw);
		if (raw != null && legacy) {
			const merged = resolveLegacy(deckId, rec?.messages ?? [], raw, legacy);
			cache.set(deckId, merged);
			fromDb.add(deckId);
			void track(
				putRecs([{ deckId, messages: merged }]).then(
					() => lsRemoveIf(deckId, raw),
					() => undefined, // the legacy key stays, and is merged again on the next load
				),
			);
			return;
		}
		cache.set(deckId, rec?.messages ?? []);
		fromDb.add(deckId);
	})();
	loading.set(deckId, p);
	return p;
}

/** Load every deck's thread (the backup, a restore, the Privacy & Data stats). */
export async function hydrateAllChats(): Promise<void> {
	if (backend === 'local') return;
	listen();
	// Legacy threads first, so the read below sees them as records.
	await migrateLegacyChats();
	if (fellBack()) return;
	const gen = generation;
	const seqs = new Map(writeSeq);
	let recs: Rec[];
	try {
		const all = () =>
			tx('readonly', (store) => {
				const r = store.getAll();
				return () => r.result as Rec[];
			});
		recs = await all().catch(() => all());
	} catch (error) {
		if (dbOpenFailed) {
			fallBackToLocal();
			return;
		}
		// A backup must not be saved without the threads it could not read.
		throw error;
	}
	if (fellBack() || gen !== generation) return;
	const unchanged = (id: string) => (writeSeq.get(id) ?? 0) === (seqs.get(id) ?? 0);
	for (const r of recs) {
		if (cache.has(r.deckId) || !unchanged(r.deckId)) continue;
		readFailed.delete(r.deckId);
		// A legacy thread that is still here (its migration failed, or an older build wrote it since)
		// is merged in (see the header).
		const raw = lsRaw(r.deckId);
		const legacy = parse(raw);
		cache.set(r.deckId, raw != null && legacy ? resolveLegacy(r.deckId, r.messages, raw, legacy) : r.messages);
		fromDb.add(r.deckId);
	}
	// A deck this page loaded earlier whose key an older build has written since: merged in, so the
	// backup carries it. This build's own fallback write already matches the cache.
	// Merged even when this build wrote the key: another tab's fallback write is not in this tab's cache, and
	// this tab's own write equals its cache, which the merge leaves as it is.
	for (const id of lsLegacyDeckIds()) {
		const legacy = parse(lsRaw(id));
		const cached = cache.get(id);
		if (cached && legacy) cache.set(id, mergeThreads(cached, legacy));
	}
}

/**
 * Store a deck's thread. `attempts[0]` is the thread; the rest are smaller versions to try
 * only if localStorage (the fallback) refuses it. Resolves true once the thread is durable.
 */
export function writeChat(deckId: string, attempts: ChatMessage[][]): Promise<boolean> {
	const messages = attempts[0] ?? [];
	writeSeq.set(deckId, (writeSeq.get(deckId) ?? 0) + 1);
	if (backend === 'local') {
		// A deck read from IndexedDB before this session lost it is still built on the stored thread.
		const error = lsWrite(deckId, attempts, fromDb.has(deckId));
		if (error) report({ deckId, error, kind: 'save' });
		return Promise.resolve(error == null);
	}
	if (readFailed.has(deckId)) {
		report({ deckId, error: new Error('the stored chat could not be read'), kind: 'save' });
		return Promise.resolve(false);
	}
	listen();
	cache.set(deckId, messages);
	const seq = writeSeq.get(deckId);
	return track(
		putRecs([{ deckId, messages }]).then(
			() => {
				// Stored: an older legacy thread is now superseded. Not when a later write of this
				// deck fell back to localStorage meanwhile (it is newer than this one).
				if (writeSeq.get(deckId) === seq) lsRemove(deckId);
				broadcast({ deckId });
				return true;
			},
			() => {
				if (dbOpenFailed) fallBackToLocal();
				// The legacy key is the fallback store. Built on the thread read from IndexedDB, it is the latest
				// state and replaces the record next load; otherwise it is merged (see the header).
				const error = lsWrite(deckId, attempts, fromDb.has(deckId));
				if (error) report({ deckId, error, kind: 'save' });
				// Other tabs forget their cached copy: their next load (a deck switch, a backup) merges this thread
				// in. A panel already open there keeps its own state, and its next write wins, as it always did.
				else broadcast({ deckId });
				return error == null;
			},
		),
	);
}

/** Forget one deck's thread (the deck was deleted). */
export function dropChat(deckId: string): Promise<boolean> {
	writeSeq.set(deckId, (writeSeq.get(deckId) ?? 0) + 1);
	lsRemove(deckId);
	cache.delete(deckId);
	readFailed.delete(deckId);
	fromDb.delete(deckId);
	if (backend === 'local') return Promise.resolve(true);
	return track(
		tx('readwrite', (store) => {
			store.delete(deckId);
			return () => true;
		}).then(
			(ok) => {
				broadcast({ deckId });
				return ok;
			},
			() => false,
		),
	);
}

let lastClear: Promise<boolean> = Promise.resolve(true);

/** Delete every thread. The legacy keys are swept by the caller's prefix sweep and here. */
export function clearChats(): Promise<boolean> {
	generation++;
	cache.clear();
	loading.clear();
	readFailed.clear();
	fromDb.clear();
	for (const id of lsLegacyDeckIds()) lsRemove(id);
	try {
		localStorage.removeItem(FALLBACK_LS); // the fingerprints name decks: they go with the threads
		ownMarks.clear();
	} catch {
		/* storage unavailable */
	}
	if (backend === 'local') {
		lastClear = Promise.resolve(true);
		return lastClear;
	}
	lastClear = track(
		tx('readwrite', (store) => {
			store.clear();
			return () => true;
		}).then(
			(ok) => {
				broadcast({ all: true });
				return ok;
			},
			() => false,
		),
	);
	return lastClear;
}

/** The outcome of the most recent `clearChats`. */
export function lastChatClear(): Promise<boolean> {
	return lastClear;
}

/** Every write, drop and clear issued so far has settled. */
export async function chatsSettled(): Promise<void> {
	while (pending.size) await Promise.allSettled([...pending]);
}

/** Characters the loaded threads hold, as JSON (the Privacy & Data stats; call `hydrateAllChats` first). */
export function chatChars(): number {
	if (backend === 'local') return 0; // still in localStorage, which the caller's scan counts
	let n = 0;
	for (const [id, messages] of cache) if (lsRaw(id) == null) n += JSON.stringify(messages).length;
	return n;
}

/**
 * Move every legacy thread into IndexedDB, in one transaction, and free its localStorage key.
 * Each key is deleted only while it still holds the text that was stored. A deck this page has
 * loaded or written is left alone: its own load migrates it, and its own writes supersede it,
 * and a migration that stored an older legacy thread after one of those writes would erase it.
 */
export async function migrateLegacyChats(): Promise<void> {
	if (backend === 'local') return;
	const mine = (deckId: string) => cache.has(deckId) || loading.has(deckId) || readFailed.has(deckId);
	const candidates: { deckId: string; raw: string; messages: ChatMessage[] }[] = [];
	for (const deckId of lsLegacyDeckIds()) {
		if (mine(deckId)) continue;
		const raw = lsRaw(deckId);
		const messages = parse(raw);
		if (raw != null && messages) candidates.push({ deckId, raw, messages });
	}
	if (!candidates.length) return;
	const gen = generation;
	let moved: typeof candidates = [];
	try {
		await track(
			tx('readwrite', (store) => {
				// Checked again here, when the transaction starts: a write issued since the scan above is
				// ordered before this transaction, and its thread is newer than the legacy one.
				moved = candidates.filter((m) => !mine(m.deckId) && lsRaw(m.deckId) === m.raw);
				// Merged with what is stored, inside this transaction, so nothing written between the read
				// and the put is lost.
				for (const m of moved) {
					const got = store.get(m.deckId);
					got.onsuccess = () => store.put({ deckId: m.deckId, messages: resolveLegacy(m.deckId, (got.result as Rec | undefined)?.messages ?? [], m.raw, m.messages) });
				}
				return () => undefined;
			}),
		);
	} catch {
		if (dbOpenFailed) fallBackToLocal();
		return; // the keys stay; the next load tries again
	}
	if (gen !== generation) return; // cleared meanwhile: what was stored is gone too
	for (const m of moved) lsRemoveIf(m.deckId, m.raw);
}

/** Run `migrateLegacyChats` once, when the page is idle. */
export function scheduleChatMigration(): void {
	if (migrationScheduled || backend === 'local') return;
	migrationScheduled = true;
	const epoch = migrationEpoch;
	const run = () => {
		if (epoch !== migrationEpoch) return;
		void migrateLegacyChats().catch(() => undefined);
	};
	const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
	if (idle) idle(run, { timeout: 10_000 });
	else setTimeout(run, 2_000);
}

export function onChatStoreError(fn: (e: ChatStoreError) => void): () => void {
	errorListeners.add(fn);
	const held = unheard;
	unheard = [];
	for (const e of held) report(e);
	return () => errorListeners.delete(fn);
}

/** Test seam: forget all module state. Not used by the app. */
export function __resetChatStoreForTests(opts: { backend?: Backend } = {}): void {
	backend = opts.backend ?? (typeof indexedDB === 'undefined' ? 'local' : 'idb');
	cache.clear();
	loading.clear();
	readFailed.clear();
	fromDb.clear();
	ownMarks.clear();
	writeSeq.clear();
	generation = 0;
	try {
		dbPromise?.then((db) => db.close()).catch(() => undefined);
	} catch {
		/* nothing open */
	}
	dbPromise = null;
	dbOpenFailed = false;
	pending = new Set();
	try {
		channel?.close();
	} catch {
		/* already closed */
	}
	channel = null;
	errorListeners.clear();
	unheard = [];
	migrationScheduled = false;
	migrationEpoch++;
	lastClear = Promise.resolve(true);
}
