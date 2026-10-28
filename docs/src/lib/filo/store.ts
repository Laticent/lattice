// Filo's storage: one stored history per document, in IndexedDB (§4.4, §5, §6).
//
// What it guarantees:
//   · ONE WRITER PER DOCUMENT. `claim(doc)` takes a Web Lock named for the document and holds it
//     until `release(doc)` or the page goes. A second tab on the same document gets `false` and
//     keeps its history in memory only, so two tabs never interleave entries.
//   · CLEAR ALL IS FINAL. `clear()` empties the store and raises a generation number stored beside
//     it. Every write checks, inside its own transaction, that its store was opened at the current
//     generation, so a flush already on its way from a tab that was open before the clear (its own
//     `pagehide` on the reload, or another tab) is refused instead of bringing deleted text back.
//   · A CROSS-DOCUMENT BUDGET. Every write counts the stored bytes of every document (a small index
//     record each, not the histories). Over the budget, the least recently WRITTEN other documents
//     are compacted first (their steps fold into the floor; their marks stay), then dropped. A
//     dropped document that held marks is reported through `onEvict`.
//   · NO INDEXEDDB (a private mode, a test): `memoryBackend()` keeps the same contract in memory.
//
// Reads and writes are async; Filo's undo never waits on them (§4.2). The host reads once, when it
// opens a document, and writes on idle and when the page hides.

import { History } from './history.js';
import { compactHistory, restoreSnapshot, type Snapshot, toSnapshot } from './snapshot.js';

export const DEFAULT_BUDGET = 50_000_000;

export interface StoredIndex {
	readonly doc: string;
	readonly bytes: number;
	readonly writtenAt: number;
	readonly marks: number;
	/** What the document would still count after a compaction: its text twice (text and floor)
	 *  and its mark anchors, roughly. */
	readonly core: number;
}

/** What a store keeps: the snapshot and its index row, written together. */
export interface Backend {
	/** The generation the store holds now. */
	generation(): Promise<number>;
	read(doc: string): Promise<Snapshot | null>;
	/** Write `snap` if the store is still at `gen` and `doc` was not deleted at or after `since` (when
	 *  this writer claimed it); then evict per `plan`. Resolves false when refused. */
	write(doc: string, snap: Snapshot, row: StoredIndex, gen: number, since: number, plan: (rows: StoredIndex[]) => Eviction[]): Promise<boolean>;
	/** Delete `doc`'s history and leave a tombstone dated `at`, so a writer that claimed it earlier
	 *  (another tab still showing the deck) cannot write it back. */
	remove(doc: string, at: number): Promise<void>;
	/** Empty the store and raise the generation. */
	clear(): Promise<void>;
}

export type Eviction = { doc: string; action: 'compact' | 'drop' };

export interface FiloStoreOptions {
	/** Total stored bytes across documents. Default 50 MB. */
	readonly budget?: number;
	/** A document's history was dropped to keep the budget, and it held this many marks. */
	readonly onEvict?: (doc: string, marks: number) => void;
	readonly now?: () => number;
}

export interface FiloStore {
	/** Become this document's one writer. False when another tab already is. */
	claim(doc: string): Promise<boolean>;
	release(doc: string): void;
	read(doc: string): Promise<Snapshot | null>;
	/** Store `snap`. False when refused: not claimed, a Clear all since this store opened, or a failed write. */
	write(snap: Snapshot): Promise<boolean>;
	remove(doc: string): Promise<void>;
	/** Empty the store. Resolves false when the clear did not reach storage. */
	clear(): Promise<boolean>;
	/** Resolves when every write and clear issued so far has settled. */
	settled(): Promise<void>;
}

/** The size a snapshot is counted at: its characters, as the byte cap counts patches. */
export function snapshotBytes(snap: Snapshot): number {
	let n = snap.text.length + snap.floor.length;
	const steps = (list: Snapshot['done']) => {
		for (const s of list) {
			n += 64 + s.label.length * 3;
			for (const c of s.net) n += 16 + c.insert.length + c.deleted.length;
		}
	};
	steps(snap.done);
	steps(snap.undone);
	for (const m of snap.marks) {
		n += 32 + m.label.length;
		for (const c of m.anchor ?? []) n += 16 + c.insert.length + c.deleted.length;
	}
	return n;
}

/** A compacted snapshot's size: the text and its floor copy, and the mark anchors. */
function coreBytes(snap: Snapshot): number {
	let n = snap.text.length * 2;
	for (const m of snap.marks) {
		n += 32 + m.label.length;
		for (const c of m.anchor ?? []) n += 16 + c.insert.length + c.deleted.length;
	}
	return n;
}

/**
 * The evictions that bring `rows` under `budget`, sparing `keep` (the document being written):
 * least recently written first, compacting a document before dropping it.
 */
export function planEviction(rows: StoredIndex[], keep: string, budget: number, compactedSize: (row: StoredIndex) => number): Eviction[] {
	let total = rows.reduce((n, r) => n + r.bytes, 0);
	if (total <= budget) return [];
	const victims = rows.filter((r) => r.doc !== keep).sort((a, b) => a.writtenAt - b.writtenAt);
	const out: Eviction[] = [];
	for (const r of victims) {
		if (total <= budget) break;
		const smaller = compactedSize(r);
		if (smaller < r.bytes) {
			out.push({ doc: r.doc, action: 'compact' });
			total -= r.bytes - smaller;
		}
	}
	for (const r of victims) {
		if (total <= budget) break;
		out.push({ doc: r.doc, action: 'drop' });
		total -= Math.min(r.bytes, compactedSize(r));
	}
	return out;
}

/** A stored history with every step folded into its floor (marks kept). */
export function compactSnapshot(snap: Snapshot): Snapshot {
	const h = new History(snap.doc, snap.text, { limits: { entries: 500, bytes: Number.MAX_SAFE_INTEGER } });
	if (!restoreSnapshot(h, snap)) return snap;
	compactHistory(h);
	return toSnapshot(h);
}

export function createFiloStore(backend: Backend, opts: FiloStoreOptions = {}): FiloStore {
	const budget = opts.budget ?? DEFAULT_BUDGET;
	const now = opts.now ?? (() => Date.now());
	// The generation this store was opened at, read once. A clear raises the stored number and NOT
	// this one: from then on every write from this page is refused until it reloads.
	const gen = backend.generation().catch(() => -1);
	// The time each document was claimed: a delete after it (in another tab) refuses this writer.
	const claimed = new Map<string, number>();
	const releases = new Map<string, () => void>();
	let queue: Promise<unknown> = Promise.resolve();
	const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
		const p = queue.then(fn, fn);
		queue = p.catch(() => {});
		return p;
	};
	return {
		async claim(doc) {
			if (claimed.has(doc)) return true;
			const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
			if (!locks?.request) {
				claimed.set(doc, now());
				return true;
			}
			return new Promise<boolean>((resolve) => {
				locks
					.request(`filo:${doc}`, { ifAvailable: true }, (lock) => {
						if (!lock) {
							resolve(false);
							return;
						}
						claimed.set(doc, now());
						resolve(true);
						// Held until release: the callback's promise is the lock's lifetime.
						return new Promise<void>((done) => releases.set(doc, done));
					})
					.catch(() => resolve(false));
			});
		},
		release(doc) {
			claimed.delete(doc);
			releases.get(doc)?.();
			releases.delete(doc);
		},
		read: (doc) => backend.read(doc).catch(() => null),
		write(snap) {
			const since = claimed.get(snap.doc);
			if (since === undefined) return Promise.resolve(false);
			return enqueue(async () => {
				const g = await gen;
				if (g < 0) return false;
				const marks = snap.marks.filter((m) => !m.auto).length;
				const row: StoredIndex = { doc: snap.doc, bytes: snapshotBytes(snap), writtenAt: now(), marks, core: coreBytes(snap) };
				let plan: Eviction[] = [];
				let seen: StoredIndex[] = [];
				const ok = await backend
					.write(snap.doc, snap, row, g, since, (rows) => {
						seen = rows;
						plan = planEviction(rows, snap.doc, budget, (r) => r.core ?? r.bytes);
						return plan;
					})
					.catch(() => false);
				if (ok) for (const e of plan) if (e.action === 'drop') opts.onEvict?.(e.doc, seen.find((r) => r.doc === e.doc)?.marks ?? 0);
				return ok;
			});
		},
		remove: (doc) => enqueue(() => backend.remove(doc, now()).catch(() => {})),
		clear: () =>
			enqueue(() =>
				backend.clear().then(
					() => true,
					() => false,
				),
			),
		settled: () => queue.then(() => {}),
	};
}

// ── Backends ────────────────────────────────────────────────────────────────

type Rec = { doc: string; snap: Snapshot };

/** The same contract in memory: tests, and a page with no IndexedDB. */
export function memoryBackend(): Backend & { rows(): StoredIndex[] } {
	const recs = new Map<string, Snapshot>();
	const index = new Map<string, StoredIndex>();
	let generation = 0;
	const tombs = new Map<string, number>();
	const evict = (plan: Eviction[]) => {
		for (const e of plan) {
			const snap = recs.get(e.doc);
			if (!snap) continue;
			if (e.action === 'drop') {
				recs.delete(e.doc);
				index.delete(e.doc);
			} else {
				const c = compactSnapshot(snap);
				recs.set(e.doc, c);
				const row = index.get(e.doc);
				if (row) index.set(e.doc, { ...row, bytes: snapshotBytes(c), core: coreBytes(c) });
			}
		}
	};
	return {
		generation: async () => generation,
		read: async (doc) => recs.get(doc) ?? null,
		async write(doc, snap, row, gen, since, plan) {
			if (gen !== generation) return false;
			if ((tombs.get(doc) ?? -1) >= since) return false;
			tombs.delete(doc);
			recs.set(doc, structuredClone(snap));
			index.set(doc, row);
			evict(plan([...index.values()]));
			return true;
		},
		async remove(doc, at) {
			recs.delete(doc);
			index.delete(doc);
			tombs.set(doc, at);
		},
		async clear() {
			recs.clear();
			index.clear();
			tombs.clear();
			generation++;
		},
		rows: () => [...index.values()],
	};
}

const HISTORIES = 'histories';
const INDEX = 'index';
const META = 'meta';

/** IndexedDB, in database `name`: the histories, a small index row per document, and the generation. */
export function idbBackend(name: string, idb: IDBFactory = indexedDB): Backend {
	let dbp: Promise<IDBDatabase> | null = null;
	const db = () => {
		dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
			const req = idb.open(name, 1);
			req.onupgradeneeded = () => {
				const d = req.result;
				d.createObjectStore(HISTORIES, { keyPath: 'doc' });
				d.createObjectStore(INDEX, { keyPath: 'doc' });
				d.createObjectStore(META);
			};
			req.onsuccess = () => {
				const d = req.result;
				// Another tab deleting the database must not hang behind this connection.
				d.onversionchange = () => d.close();
				resolve(d);
			};
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error('filo: the history store is blocked by another tab'));
		});
		dbp.catch(() => {
			dbp = null;
		});
		return dbp;
	};
	const done = (tx: IDBTransaction) =>
		new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error ?? new Error('filo: transaction aborted'));
		});
	const req = <T>(r: IDBRequest<T>) =>
		new Promise<T>((resolve, reject) => {
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
	return {
		async generation() {
			const tx = (await db()).transaction(META, 'readonly');
			const g = await req(tx.objectStore(META).get('generation'));
			return typeof g === 'number' ? g : 0;
		},
		async read(doc) {
			const tx = (await db()).transaction(HISTORIES, 'readonly');
			const rec = (await req(tx.objectStore(HISTORIES).get(doc))) as Rec | undefined;
			return rec?.snap ?? null;
		},
		async write(doc, snap, row, gen, since, plan) {
			const tx = (await db()).transaction([HISTORIES, INDEX, META], 'readwrite');
			const finished = done(tx);
			// Anything that throws below aborts the whole transaction: a write is all or nothing.
			const refuse = async () => {
				try {
					tx.abort();
				} catch {
					/* already finished */
				}
				await finished.catch(() => {});
				return false;
			};
			try {
				const hs = tx.objectStore(HISTORIES);
				const ix = tx.objectStore(INDEX);
				const meta = tx.objectStore(META);
				const stored = await req(meta.get('generation'));
				if ((typeof stored === 'number' ? stored : 0) !== gen) return refuse();
				const tomb = await req(meta.get(`tomb:${doc}`));
				if (typeof tomb === 'number' && tomb >= since) return refuse();
				if (tomb !== undefined) meta.delete(`tomb:${doc}`);
				hs.put({ doc, snap } satisfies Rec);
				ix.put(row);
				const rows = ((await req(ix.getAll())) as StoredIndex[]).map((r) => (r.doc === doc ? row : r));
				for (const e of plan(rows)) {
					if (e.action === 'drop') {
						hs.delete(e.doc);
						ix.delete(e.doc);
					} else {
						const rec = (await req(hs.get(e.doc))) as Rec | undefined;
						if (!rec) continue;
						const c = compactSnapshot(rec.snap);
						hs.put({ doc: e.doc, snap: c } satisfies Rec);
						const old = rows.find((r) => r.doc === e.doc);
						if (old) ix.put({ ...old, bytes: snapshotBytes(c), core: coreBytes(c) });
					}
				}
			} catch {
				return refuse();
			}
			await finished;
			return true;
		},
		async remove(doc, at) {
			const tx = (await db()).transaction([HISTORIES, INDEX, META], 'readwrite');
			tx.objectStore(HISTORIES).delete(doc);
			tx.objectStore(INDEX).delete(doc);
			tx.objectStore(META).put(at, `tomb:${doc}`);
			await done(tx);
		},
		async clear() {
			const tx = (await db()).transaction([HISTORIES, INDEX, META], 'readwrite');
			const finished = done(tx);
			const meta = tx.objectStore(META);
			const g = await req(meta.get('generation'));
			tx.objectStore(HISTORIES).clear();
			tx.objectStore(INDEX).clear();
			// The tombstones go too; the raised generation refuses every older writer anyway.
			meta.clear();
			meta.put((typeof g === 'number' ? g : 0) + 1, 'generation');
			await finished;
		},
	};
}
