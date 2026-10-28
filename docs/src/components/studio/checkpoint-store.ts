// Version history (checkpoints) storage — IndexedDB behind a synchronous cache.
//
// WHY THIS EXISTS. Checkpoints used to live in localStorage as full copies of the
// deck, 25 per deck, sharing a ~5 M character quota with every deck, chat and
// setting. Measured in real engines (engineering/decisions/2026-10-27-filo-undo-history.md
// §1): 25 checkpoints of a 134 KB deck do not fit WebKit's quota at all (WebKit counts
// two bytes per character, so it holds 18), and in every engine a write that hit the
// quota was swallowed, so "Saved version" silently saved nothing.
//
// THE SHAPE.
//   · Reads are synchronous, from an in-memory cache: about fifteen call sites, the
//     workspace backup and many tests read checkpoints synchronously.
//   · Each checkpoint is its own record, keyed [deckId, id]. Every change is ONE
//     read-modify-write transaction (add, then trim to the cap; or map; or delete), never
//     a blind write of a whole cached list. Two tabs on one deck therefore cannot erase
//     each other's versions, which a whole-list write would (last writer wins).
//   · After each transaction the cache takes the deck's list as the transaction left it,
//     and other tabs hear about it on a BroadcastChannel and re-read.
//   · Every change returns a Promise<boolean> that settles once the change is durable.
//     A caller that must not proceed on an unsaved undo (the Library's rename) awaits it.
//   · A failed write is REPORTED through `onCheckpointWriteError`, never swallowed. A
//     failed save stays in the cache, so it is restorable for the rest of the session.
//
// MIGRATION. Hydration moves every legacy `SNAP_PREFIX` localStorage list into
// IndexedDB, merged by id with anything already there, and deletes each localStorage key
// only after its transaction committed. Until hydration finishes, a deck with no cached
// list falls back to its legacy list, so a returning author never sees an empty history.
//
// NO INDEXEDDB (private modes, a database that will not open, tests without
// fake-indexeddb): the module reads and writes localStorage as the Studio always did,
// and a failed write is reported there too.
//
// This is slice 0 of the Filo plan. Filo (slice 6) later turns checkpoints into marks.

export type Checkpoint = { id: string; ts: number; label: string; source: string };

export const SNAP_PREFIX = 'lattice-studio-snap-'; // + deckId → Checkpoint[] (legacy localStorage key; exported for the storage-overlay drift test)
export const SNAP_CAP = 25; // keep the most recent N per deck

const DB_NAME = 'lattice-studio-versions';
const DB_VERSION = 1;
const STORE = 'checkpoints'; // records: Checkpoint & { deckId }, keyPath [deckId, id]

type Backend = 'idb' | 'local';
type Rec = Checkpoint & { deckId: string };
/** `save`: a version the author made did not persist. `migrate`: a legacy list could not
 *  move yet (it stays in localStorage and is retried next load). `clear`: Clear all did not
 *  reach IndexedDB. Only `save` warrants telling the author at the moment it happens. */
export type CheckpointWriteError = { deckId: string; error: unknown; kind: 'save' | 'migrate' | 'clear' };

const cache = new Map<string, Checkpoint[]>();
let backend: Backend = typeof indexedDB === 'undefined' ? 'local' : 'idb';
let hydrated = false;
let hydration: Promise<void> | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let dbOpenFailed = false; // the database never opened: hydration falls back to localStorage
// Bumped by a clear (here or in another tab). A hydration or change that started before it
// does not write what it read into the cache, so a Clear all is never undone by a read
// already in flight. (Writes need no guard: IndexedDB runs read-write transactions on one
// store in the order they were created, so a write issued before the clear lands before it.)
let generation = 0;
const inflight = new Map<string, number>(); // deckId → transactions not yet settled
const droppedDuringHydration = new Set<string>();
const deckGeneration = new Map<string, number>(); // bumped when a deck is dropped: a change issued before it must not refill the cache
let pending = new Set<Promise<unknown>>();
let channel: BroadcastChannel | null = null;
const changeListeners = new Set<() => void>();
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
/** Returns the thrown error, or null on success. */
function lsWrite(deckId: string, list: Checkpoint[]): unknown {
	try {
		if (list.length) localStorage.setItem(SNAP_PREFIX + deckId, JSON.stringify(list));
		else localStorage.removeItem(SNAP_PREFIX + deckId);
		return null;
	} catch (e) {
		return e ?? new Error('localStorage write failed');
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
function hasLegacy(deckId: string): boolean {
	try {
		return localStorage.getItem(SNAP_PREFIX + deckId) !== null;
	} catch {
		return false;
	}
}

// ── IndexedDB ───────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;
	const p = new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: ['deckId', 'id'] });
		};
		req.onsuccess = () => {
			const db = req.result;
			// A newer tab upgrading the schema, or the browser dropping the connection (a
			// known WebKit failure): let go, so the next transaction opens afresh instead of
			// failing for the rest of the session.
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
		req.onblocked = () => reject(new Error('checkpoint database blocked'));
	});
	p.catch(() => {
		dbOpenFailed = true;
	});
	dbPromise = p;
	return p;
}

type Tx = {
	/** Record a request's own error if it fails. */
	watch: (r: IDBRequest) => void;
	/** Wrap a request callback: an exception it throws aborts the transaction AND is kept as
	 *  the reason (IndexedDB would otherwise report a bare AbortError). */
	guard: (fn: () => void) => () => void;
};

/** One transaction. `run` issues its requests and returns a getter for the result. Rejects
 *  with the first real error, so a QuotaExceededError keeps its name. */
function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, h: Tx) => () => T): Promise<T> {
	return openDB().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				let firstError: unknown = null;
				const t = db.transaction(STORE, mode);
				const watch = (r: IDBRequest) => {
					r.onerror = () => {
						firstError ??= r.error;
					};
				};
				const guard = (fn: () => void) => () => {
					try {
						fn();
					} catch (e) {
						firstError ??= e;
						try {
							t.abort();
						} catch {
							/* already finished */
						}
					}
				};
				let result: () => T;
				try {
					result = run(t.objectStore(STORE), { watch, guard });
				} catch (e) {
					try {
						t.abort();
					} catch {
						/* already finished */
					}
					reject(e);
					return;
				}
				t.oncomplete = () => resolve(result());
				t.onabort = () => reject(firstError ?? t.error ?? new Error('checkpoint transaction aborted'));
			}),
	);
}

const deckRange = (deckId: string) => IDBKeyRange.bound([deckId, ''], [deckId, '￿']);
const strip = ({ deckId: _deckId, ...c }: Rec): Checkpoint => c;
const newestFirst = (list: Checkpoint[]) => [...list].sort((a, b) => b.ts - a.ts);

/**
 * Inside a transaction: read the deck's records, apply `edit` to the newest-first list,
 * write back only the difference, and trim to the cap. Returns a getter for the final list.
 */
function editDeck(store: IDBObjectStore, { watch, guard }: Tx, deckId: string, edit: (list: Checkpoint[]) => Checkpoint[]): () => Checkpoint[] {
	let final: Checkpoint[] = [];
	const all = store.getAll(deckRange(deckId));
	watch(all);
	all.onsuccess = guard(() => {
		const before = newestFirst((all.result as Rec[]).map(strip));
		const after = newestFirst(edit(before)).slice(0, SNAP_CAP);
		const keep = new Set(after.map((c) => c.id));
		for (const c of before) if (!keep.has(c.id)) watch(store.delete([deckId, c.id]));
		const prev = new Map(before.map((c) => [c.id, c]));
		for (const c of after) {
			const old = prev.get(c.id);
			if (!old || old.source !== c.source || old.label !== c.label || old.ts !== c.ts) watch(store.put({ ...c, deckId }));
		}
		final = after;
	});
	return () => final;
}

function report(e: CheckpointWriteError): void {
	for (const fn of errorListeners) {
		try {
			fn(e);
		} catch {
			/* a listener's own failure must not hide the next one */
		}
	}
}

function notifyChanged(): void {
	for (const fn of changeListeners) {
		try {
			fn();
		} catch {
			/* one listener's failure must not hide the next one */
		}
	}
}

function track<T>(p: Promise<T>): Promise<T> {
	pending.add(p);
	p.finally(() => pending.delete(p)).catch(() => undefined);
	return p;
}

type Msg = { deckId: string } | { all: true };
function broadcast(msg: Msg): void {
	try {
		channel?.postMessage(msg);
	} catch {
		/* a closed channel only costs other tabs a stale list until they reload */
	}
}
function listen(): void {
	if (channel || typeof BroadcastChannel === 'undefined') return;
	channel = new BroadcastChannel(DB_NAME);
	channel.onmessage = (ev: MessageEvent<Msg>) => {
		const msg = ev.data;
		if ('all' in msg) {
			generation++;
			cache.clear();
			notifyChanged();
			return;
		}
		if (backend === 'local') {
			notifyChanged(); // reads go to localStorage, which is already current
			return;
		}
		void refreshDeck(msg.deckId);
	};
}

async function refreshDeck(deckId: string): Promise<void> {
	const gen = generation;
	try {
		const list = await tx('readonly', (s, { watch }) => {
			const r = s.getAll(deckRange(deckId));
			watch(r);
			return () => newestFirst((r.result as Rec[]).map(strip));
		});
		if (gen !== generation) return;
		if (list.length) cache.set(deckId, list);
		else cache.delete(deckId);
		notifyChanged();
	} catch {
		/* the next local change re-reads the deck anyway */
	}
}

/**
 * Run one change against a deck. The cache takes `optimistic` at once (reads stay
 * synchronous); once the transaction commits, it takes the list the database actually
 * holds, which also folds in any version another tab added meanwhile.
 */
function change(deckId: string, optimistic: Checkpoint[], edit: (list: Checkpoint[]) => Checkpoint[]): Promise<boolean> {
	listen();
	if (backend === 'local') {
		// Read-modify-write against localStorage itself, as the Studio always did, so two
		// tabs see each other's versions.
		const next = newestFirst(edit(lsRead(deckId) ?? [])).slice(0, SNAP_CAP);
		const err = lsWrite(deckId, next);
		if (err) {
			report({ deckId, error: err, kind: 'save' });
			return Promise.resolve(false);
		}
		broadcast({ deckId });
		return Promise.resolve(true);
	}
	void hydrateCheckpoints();
	if (optimistic.length) cache.set(deckId, optimistic.slice(0, SNAP_CAP));
	else cache.delete(deckId);
	inflight.set(deckId, (inflight.get(deckId) ?? 0) + 1);
	const gen = generation;
	const dgen = deckGeneration.get(deckId) ?? 0;
	return track(
		tx('readwrite', (s, h) => editDeck(s, h, deckId, edit))
			.then(
				(final) => {
					if (gen === generation && dgen === (deckGeneration.get(deckId) ?? 0)) {
						if (final.length) cache.set(deckId, final);
						else cache.delete(deckId);
					}
					broadcast({ deckId });
					return true;
				},
				(error) => {
					// A database that never opened is not a lost write: hydration's fallback
					// re-applies the cache to localStorage and reports only if THAT fails.
					if (!dbOpenFailed) report({ deckId, error, kind: 'save' });
					return false;
				},
			)
			.finally(() => {
				const n = (inflight.get(deckId) ?? 1) - 1;
				if (n) inflight.set(deckId, n);
				else inflight.delete(deckId);
			}),
	);
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Checkpoints for a deck, newest first. Synchronous. */
export function readCheckpoints(deckId: string): Checkpoint[] {
	listen();
	if (backend === 'local') return lsRead(deckId) ?? [];
	void hydrateCheckpoints();
	const hit = cache.get(deckId);
	if (hit) return hit;
	return hydrated ? [] : (lsRead(deckId) ?? []);
}

/** Add one checkpoint as the newest. Settles true once it is durable. */
export function appendCheckpoint(deckId: string, cp: Checkpoint): Promise<boolean> {
	const add = (list: Checkpoint[]) => [cp, ...list.filter((c) => c.id !== cp.id)];
	return change(deckId, newestFirst(add(readCheckpoints(deckId))), add);
}

/** Replace a deck's whole list (a restore from backup into a deck with none). */
export function replaceCheckpoints(deckId: string, list: Checkpoint[]): Promise<boolean> {
	return change(deckId, newestFirst(list), () => list);
}

/** Rewrite every checkpoint's source through `fn` (a restore that renamed a photo). */
export function mapCheckpoints(deckId: string, fn: (source: string) => string): Promise<boolean> {
	const map = (list: Checkpoint[]) =>
		list.map((c) => {
			const source = fn(c.source);
			return source === c.source ? c : { ...c, source };
		});
	const cached = readCheckpoints(deckId);
	const optimistic = map(cached);
	if (backend === 'local' && optimistic.every((c, i) => c === cached[i])) return Promise.resolve(true);
	return change(deckId, optimistic, map);
}

/** Forget a deck's checkpoints (deck deleted). */
export function dropCheckpoints(deckId: string): Promise<boolean> {
	deckGeneration.set(deckId, (deckGeneration.get(deckId) ?? 0) + 1);
	cache.delete(deckId);
	lsRemove(deckId);
	if (backend === 'local') {
		broadcast({ deckId });
		return Promise.resolve(true);
	}
	if (!hydrated) droppedDuringHydration.add(deckId);
	return track(
		tx('readwrite', (s, { watch }) => {
			watch(s.delete(deckRange(deckId)));
			return () => undefined;
		}).then(
			() => {
				broadcast({ deckId });
				return true;
			},
			() => false,
		),
	);
}

let lastClear: Promise<boolean> = Promise.resolve(true);

/**
 * Forget every deck's checkpoints (Clear all / Delete everything), here and in other tabs.
 * Callers that reload afterwards await `checkpointsSettled()`; `lastCheckpointClear()`
 * says whether it reached the database.
 */
export function clearCheckpoints(): Promise<boolean> {
	listen();
	generation++;
	cache.clear();
	for (const id of lsLegacyDeckIds()) lsRemove(id);
	broadcast({ all: true });
	let p: Promise<boolean>;
	if (backend === 'idb') {
		p = tx('readwrite', (s, { watch }) => {
			watch(s.clear());
			return () => true;
		}).catch((error) => {
			report({ deckId: '*', error, kind: 'clear' });
			return false;
		});
	} else if (typeof indexedDB !== 'undefined') {
		// This page fell back to localStorage, but an earlier session may have stored
		// versions in IndexedDB. Delete that database too, or a later session that can open
		// it would bring the "deleted" history back.
		p = new Promise<boolean>((resolve) => {
			try {
				const req = indexedDB.deleteDatabase(DB_NAME);
				req.onsuccess = () => resolve(true);
				req.onerror = () => {
					report({ deckId: '*', error: req.error, kind: 'clear' });
					resolve(false);
				};
				req.onblocked = () => resolve(true); // completes once other tabs close it
			} catch (error) {
				report({ deckId: '*', error, kind: 'clear' });
				resolve(false);
			}
		});
	} else p = Promise.resolve(true);
	lastClear = track(p);
	return lastClear;
}

/** Whether the most recent clear reached the database. */
export function lastCheckpointClear(): Promise<boolean> {
	return lastClear;
}

/**
 * Bytes the IndexedDB-held checkpoint lists take (UTF-16 characters of their JSON), for
 * the Privacy & Data row. A deck whose legacy localStorage list still exists is left out:
 * the localStorage scan already counts that key.
 */
export function checkpointBytes(): number {
	let n = 0;
	for (const [id, list] of cache) if (!hasLegacy(id)) n += id.length + JSON.stringify(list).length;
	return n;
}

/** Resolves when every change issued so far has settled (or failed and been reported). */
export async function checkpointsSettled(): Promise<void> {
	while (pending.size) await Promise.allSettled([...pending]);
}

/** Load stored lists into the cache and migrate legacy localStorage lists. Idempotent. */
export function hydrateCheckpoints(): Promise<void> {
	if (hydration) return hydration;
	listen();
	if (backend === 'local') {
		hydrated = true;
		hydration = Promise.resolve();
		return hydration;
	}
	const gen = generation;
	hydration = (async () => {
		let stored: Rec[];
		try {
			stored = await tx('readonly', (s, { watch }) => {
				const r = s.getAll();
				watch(r);
				return () => r.result as Rec[];
			});
		} catch {
			// IndexedDB is unusable here: keep the legacy store, and carry over what this page
			// put in the cache meanwhile.
			backend = 'local';
			for (const [id, list] of cache) {
				const legacy = lsRead(id) ?? [];
				const err = lsWrite(id, newestFirst([...list, ...legacy.filter((c) => !list.some((l) => l.id === c.id))]).slice(0, SNAP_CAP));
				if (err) report({ deckId: id, error: err, kind: 'save' });
			}
			cache.clear();
			finishHydration();
			return;
		}
		if (gen !== generation) {
			finishHydration(); // cleared while the read was in flight: what it read is gone
			return;
		}
		const byDeck = new Map<string, Checkpoint[]>();
		for (const r of stored) byDeck.set(r.deckId, [...(byDeck.get(r.deckId) ?? []), strip(r)]);
		for (const [id, list] of byDeck) {
			// A deck with a change in flight takes the list that change commits, which is newer.
			if (inflight.has(id) || droppedDuringHydration.has(id)) continue;
			cache.set(id, newestFirst(list).slice(0, SNAP_CAP));
		}
		for (const id of lsLegacyDeckIds()) {
			if (droppedDuringHydration.has(id)) continue;
			const legacy = lsRead(id) ?? [];
			const merge = (list: Checkpoint[]) => [...list, ...legacy.filter((c) => !list.some((l) => l.id === c.id))];
			cache.set(id, newestFirst(merge(cache.get(id) ?? [])).slice(0, SNAP_CAP));
			// Delete the legacy key only once its versions are committed to IndexedDB.
			track(
				tx('readwrite', (s, h) => editDeck(s, h, id, merge)).then(
					() => lsRemove(id),
					(error) => report({ deckId: id, error, kind: 'migrate' }),
				),
			);
		}
		finishHydration();
	})();
	return hydration;
}

function finishHydration(): void {
	hydrated = true;
	droppedDuringHydration.clear();
	notifyChanged();
}

/** Called after hydration and whenever another tab changes a list, so a view can re-read. */
export function onCheckpointsChanged(fn: () => void): () => void {
	if (hydrated) queueMicrotask(fn);
	changeListeners.add(fn);
	return () => changeListeners.delete(fn);
}

/** Called whenever a checkpoint write fails. The Studio tells the author about `save` failures. */
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
	generation = 0;
	inflight.clear();
	droppedDuringHydration.clear();
	deckGeneration.clear();
	pending = new Set();
	lastClear = Promise.resolve(true);
	channel?.close();
	channel = null;
	changeListeners.clear();
	errorListeners.clear();
}
