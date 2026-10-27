// Version history (checkpoints) storage — IndexedDB behind a synchronous cache.
//
// WHY THIS EXISTS. Checkpoints used to live in localStorage as full copies of the
// deck, 25 per deck, sharing a ~5 M character quota with every deck, chat and
// setting. Measured in real engines (engineering/decisions/2026-10-27-filo-undo-history.md
// §1): 25 checkpoints of a 134 KB deck do not fit WebKit's quota at all (WebKit counts
// two bytes per character, so it holds 18), and in every engine a write that hit the
// quota was swallowed by `write()`, so "Saved version" silently saved nothing.
//
// WHAT IT DOES. The checkpoint API stays synchronous, because about fifteen call sites,
// the workspace backup and many tests read it synchronously. Reads come from an
// in-memory cache; every change updates the cache at once and is persisted to its own
// IndexedDB database in the background. A write that fails (quota, a closed database)
// is REPORTED through `onCheckpointWriteError`, never swallowed; the version stays in
// the cache, so it is still restorable for the rest of the session.
//
// MIGRATION. `hydrateCheckpoints()` reads the stored lists once, moves every legacy
// `SNAP_PREFIX` localStorage list into IndexedDB (merged with anything written before
// hydration finished), and deletes each localStorage key only after its IndexedDB write
// succeeded. Until hydration finishes, a deck with no cached list falls back to its
// legacy localStorage list, so a returning author never sees an empty history flash.
//
// NO INDEXEDDB (private modes, tests without fake-indexeddb): the module falls back to
// localStorage exactly as before, and a failed write is reported there too.
//
// This is slice 0 of the Filo plan: it stops today's silent loss before Filo exists.
// Filo (slice 6) later turns these checkpoints into marks on its history.

export type Checkpoint = { id: string; ts: number; label: string; source: string };

export const SNAP_PREFIX = 'lattice-studio-snap-'; // + deckId → Checkpoint[] (legacy localStorage key; exported for the storage-overlay drift test)
export const SNAP_CAP = 25; // keep the most recent N per deck

const DB_NAME = 'lattice-studio-versions';
const DB_VERSION = 1;
const STORE = 'checkpoints'; // { deckId, list: Checkpoint[] }

type Backend = 'idb' | 'local';
export type CheckpointWriteError = { deckId: string; error: unknown };

const cache = new Map<string, Checkpoint[]>();
let backend: Backend = typeof indexedDB === 'undefined' ? 'local' : 'idb';
let hydrated = false;
let hydration: Promise<void> | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let dbOpenFailed = false; // the database never opened: hydration falls back to localStorage, so writes are not lost
let pending = new Set<Promise<void>>();
// Bumped by clearCheckpoints. A hydration that started before a clear discards what it
// read, so a Clear all can never be undone by a read that was already in flight.
// (Writes need no such guard: IndexedDB runs read-write transactions on one store in
// the order they were created, so a write issued before the clear lands before it.)
let generation = 0;
const readyListeners = new Set<() => void>();
const errorListeners = new Set<(e: CheckpointWriteError) => void>();

// ── localStorage (legacy + fallback) ────────────────────────────────────────

function lsRead(deckId: string): Checkpoint[] | null {
	try {
		const v = localStorage.getItem(SNAP_PREFIX + deckId);
		return v ? (JSON.parse(v) as Checkpoint[]) : null;
	} catch {
		return null;
	}
}
function lsWrite(deckId: string, list: Checkpoint[]): boolean {
	try {
		localStorage.setItem(SNAP_PREFIX + deckId, JSON.stringify(list));
		return true;
	} catch {
		return false;
	}
}
function lsRemove(deckId: string): void {
	try {
		localStorage.removeItem(SNAP_PREFIX + deckId);
	} catch {
		/* storage unavailable — non-fatal */
	}
}
function lsLegacyDeckIds(): string[] {
	const ids: string[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k?.startsWith(SNAP_PREFIX)) ids.push(k.slice(SNAP_PREFIX.length));
		}
	} catch {
		/* storage unavailable */
	}
	return ids;
}

// ── IndexedDB ───────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'deckId' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('checkpoint database blocked'));
	});
	dbPromise.catch(() => {
		dbOpenFailed = true;
	});
	return dbPromise;
}

function tx(mode: IDBTransactionMode, run: (store: IDBObjectStore) => { readonly result: unknown }): Promise<unknown> {
	return openDB().then(
		(db) =>
			new Promise<unknown>((resolve, reject) => {
				const t = db.transaction(STORE, mode);
				const req = run(t.objectStore(STORE));
				t.oncomplete = () => resolve(req.result);
				t.onerror = () => reject(t.error);
				t.onabort = () => reject(t.error ?? new Error('checkpoint transaction aborted'));
			}),
	);
}

function track(p: Promise<void>): void {
	pending.add(p);
	p.finally(() => pending.delete(p));
}

function report(deckId: string, error: unknown): void {
	for (const fn of errorListeners) {
		try {
			fn({ deckId, error });
		} catch {
			/* a listener's own failure must not hide the next one */
		}
	}
}

/** Persist one deck's list. Never throws; a failure is reported. */
function persist(deckId: string, list: Checkpoint[]): void {
	if (backend === 'local') {
		if (list.length === 0) lsRemove(deckId);
		else if (!lsWrite(deckId, list)) report(deckId, new Error('localStorage write failed'));
		return;
	}
	track(
		tx('readwrite', (s) => (list.length ? s.put({ deckId, list }) : s.delete(deckId))).then(
			() => undefined,
			// A database that never opened is not a lost write: hydration's fallback
			// re-persists the cache to localStorage and reports only if THAT fails.
			(error) => (dbOpenFailed ? undefined : report(deckId, error)),
		),
	);
}

/** Newest first, de-duplicated by id, capped. */
function merge(a: Checkpoint[], b: Checkpoint[]): Checkpoint[] {
	const seen = new Set<string>();
	return [...a, ...b]
		.sort((x, y) => y.ts - x.ts)
		.filter((c) => {
			if (seen.has(c.id)) return false;
			seen.add(c.id);
			return true;
		})
		.slice(0, SNAP_CAP);
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Checkpoints for a deck, newest first. Synchronous. */
export function readCheckpoints(deckId: string): Checkpoint[] {
	if (backend === 'local') return lsRead(deckId) ?? [];
	void hydrateCheckpoints();
	const hit = cache.get(deckId);
	if (hit) return hit;
	return hydrated ? [] : (lsRead(deckId) ?? []);
}

/** Replace a deck's checkpoint list (already capped by the caller or capped here). */
export function writeCheckpoints(deckId: string, list: Checkpoint[]): void {
	const next = list.slice(0, SNAP_CAP);
	if (backend === 'idb') {
		cache.set(deckId, next);
		void hydrateCheckpoints();
	}
	persist(deckId, next);
}

/** Forget a deck's checkpoints (deck deleted). */
export function dropCheckpoints(deckId: string): void {
	cache.delete(deckId);
	lsRemove(deckId);
	if (backend === 'idb') track(tx('readwrite', (s) => s.delete(deckId)).then(() => undefined, () => undefined));
}

/**
 * Forget every deck's checkpoints (Clear all / Delete everything). Callers that reload
 * the page afterwards await `checkpointsSettled()` first, so the clear is not cut off.
 */
export function clearCheckpoints(): void {
	generation++;
	cache.clear();
	for (const id of lsLegacyDeckIds()) lsRemove(id);
	if (backend === 'idb') track(tx('readwrite', (s) => s.clear()).then(() => undefined, () => undefined));
}

/** Bytes the cached checkpoint lists take (UTF-16 characters of their JSON), for the Privacy & Data row. */
export function checkpointBytes(): number {
	let n = 0;
	for (const [id, list] of cache) n += id.length + JSON.stringify(list).length;
	return n;
}

/** Resolves when every write issued so far has finished (or failed and been reported). */
export async function checkpointsSettled(): Promise<void> {
	while (pending.size) await Promise.allSettled([...pending]);
}

/** Load stored lists into the cache and migrate legacy localStorage lists. Idempotent. */
export function hydrateCheckpoints(): Promise<void> {
	if (hydration) return hydration;
	if (backend === 'local') {
		hydrated = true;
		hydration = Promise.resolve();
		return hydration;
	}
	const gen = generation;
	hydration = (async () => {
		let stored: { deckId: string; list: Checkpoint[] }[] = [];
		try {
			stored = ((await tx('readonly', (s) => s.getAll())) as { deckId: string; list: Checkpoint[] }[] | undefined) ?? [];
		} catch {
			// IndexedDB is unusable here (a private mode that throws on open): keep the
			// legacy store, and carry over anything written to the cache meanwhile.
			backend = 'local';
			for (const [id, list] of cache) persist(id, merge(list, lsRead(id) ?? []));
			cache.clear();
			hydrated = true;
			notifyReady();
			return;
		}
		if (gen !== generation) {
			// Cleared while the read was in flight: what it read is gone.
			hydrated = true;
			notifyReady();
			return;
		}
		for (const { deckId, list } of stored) {
			const session = cache.get(deckId);
			cache.set(deckId, session ? merge(session, list) : list);
			if (session) persist(deckId, cache.get(deckId) ?? []);
		}
		for (const id of lsLegacyDeckIds()) {
			const legacy = lsRead(id) ?? [];
			const merged = merge(cache.get(id) ?? [], legacy);
			cache.set(id, merged);
			// Delete the legacy key only once its contents are safely in IndexedDB.
			track(tx('readwrite', (s) => s.put({ deckId: id, list: merged })).then(() => lsRemove(id), (error) => report(id, error)));
		}
		hydrated = true;
		notifyReady();
	})();
	return hydration;
}

function notifyReady(): void {
	for (const fn of readyListeners) fn();
}

/** Called once hydration finishes, so a view that rendered before it can re-read. */
export function onCheckpointsReady(fn: () => void): () => void {
	if (hydrated) queueMicrotask(fn);
	readyListeners.add(fn);
	return () => readyListeners.delete(fn);
}

/** Called whenever a checkpoint write fails. The Studio shows the author a notice. */
export function onCheckpointWriteError(fn: (e: CheckpointWriteError) => void): () => void {
	errorListeners.add(fn);
	return () => errorListeners.delete(fn);
}

/** Test seam: start over as a fresh page would. */
export function __resetCheckpointStoreForTests(opts: { backend?: Backend } = {}): void {
	cache.clear();
	backend = opts.backend ?? (typeof indexedDB === 'undefined' ? 'local' : 'idb');
	hydrated = false;
	hydration = null;
	dbPromise?.then((db) => db.close()).catch(() => undefined);
	dbPromise = null;
	dbOpenFailed = false;
	pending = new Set();
	generation = 0;
	readyListeners.clear();
	errorListeners.clear();
}
