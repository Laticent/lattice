// Filo in the Studio, across reloads: slice 5 of engineering/decisions/2026-10-27-filo-undo-history.md (§5, §6).
//
// The Studio writes the deck source to localStorage (synchronously on `pagehide`, debounced
// otherwise); Filo writes the history to IndexedDB on idle and when the page hides. The two land on
// different clocks, so beside the source the Studio stores a SIDECAR, the hash of the source it
// just wrote (`saveSourceSum`). On open, three hashes decide what the stored history means:
//
//   in step   the source is the stored history's text     the stack is live: ⌘Z undoes the edit before the reload
//   ahead     the source is the sidecar, not the stored   the Studio wrote after Filo's last write (a tab killed
//             text                                        between the two): one step, "Unsaved changes"
//   outside   the source is not the sidecar               changed outside the Studio (a restored backup, an
//                                                         import, the Library's rename): one gap step, and the
//                                                         stack is never applied to text it was not recorded against
//
// Another Studio tab's save writes the sidecar too, so its text comes back as "Unsaved changes": a
// step that undoes it, as the Studio's own writes do. In every case the stored stack replays to its
// own text first and the step bridges from there, so the case picks the label, never correctness.
//
// One tab writes a deck's history (a Web Lock, held for the session for every deck the tab opened);
// a second tab keeps its own in memory and says so, and does not claim the deck later.
// Broad steps are narrowed to the lines that changed in a worker before they are stored.

// The source modules, not the package entry: the Studio's eager bundle imports `@/lib/filo` (the
// built package, one module), and a lazy chunk importing the same module would keep the store and
// the diff in the eager chunk with it (route budget, 2.1 KB over the ceiling on the first cut).
import type { History } from '@/lib/filo';
import { NARROW_MIN } from '@/lib/filo/narrow';
import { hashText, type Patch } from '@/lib/filo/patch';
import { replaySnapshot, restoreSnapshot, type Snapshot, toSnapshot } from '@/lib/filo/snapshot';

// The Studio's histories come from the package entry; `snapshot.ts` is typed against the source
// class. The two are the same code, and the functions reach the same fields, so this is the one cast.
type SourceHistory = Parameters<typeof toSnapshot>[0];
const src = (h: History): SourceHistory => h as unknown as SourceHistory;

import { createFiloStore, type FiloStore, idbBackend, memoryBackend } from '@/lib/filo/store';

export const FILO_DB = 'lattice-filo';
/** The label of the step a reload adds when the Studio saved text Filo had not stored yet. */
export const UNSAVED_LABEL = 'Unsaved changes';

export type ReloadCase = 'in-step' | 'ahead' | 'outside';

/** What a stored history means for the source the Studio opened (the table above). Pure. */
export function reloadCase(source: string, sidecar: number | null, stored: Pick<Snapshot, 'text' | 'hash'>): ReloadCase {
	const h = hashText(source);
	if (h === stored.hash && source === stored.text) return 'in-step';
	if (sidecar !== null && sidecar === h) return 'ahead';
	return 'outside';
}

/** The label of the step that holds what the author changed before the stored history arrived. */
export const EARLY_LABEL = 'Edits before the history loaded';

/**
 * Put a stored history under a just-opened one. `source` is the text the history opened with.
 * Returns the case applied, or null when the stored one does not replay (then the session keeps
 * the history it has, as before slice 5). `verified`: the host already replayed `stored` with
 * `replaySnapshot` (in its worker), so the restore skips it.
 *
 * Reading storage takes a moment after the Studio paints. An author who changed the deck in that
 * moment keeps the change as one step on top of the stored past, rather than losing the past: the
 * history before it is only replaced when it opened on `source` and recorded nothing from outside.
 */
export function adoptStored(h: History, source: string, sidecar: number | null, stored: Snapshot, verified = false): ReloadCase | null {
	if (h.state().stale) return null;
	const now = h.text;
	// The early changes must have started from `source`, or the bridge below would mislabel them.
	if (now !== source && h.state().steps === 0 && !h.state().canRedo) return null;
	if (!restoreSnapshot(src(h), stored, { verified })) return null;
	const c = reloadCase(source, sidecar, stored);
	if (c === 'ahead') h.commit({ base: h.head, next: source, label: UNSAVED_LABEL, origin: 'reload' });
	else if (c === 'outside') h.sync(source);
	h.closeGroup();
	if (now !== source) {
		h.commit({ base: h.head, next: now, label: EARLY_LABEL, origin: 'markdown' });
		h.closeGroup();
	}
	return c;
}

/** True when a step of `snap` holds a change wide enough to narrow that has not been tried yet. */
function hasBroad(snap: Snapshot, tried: WeakSet<Patch>): boolean {
	const broad = (p: Patch) => !tried.has(p) && p.some((c) => c.deleted.length + c.insert.length >= NARROW_MIN);
	return snap.done.some((s) => broad(s.net)) || snap.undone.some((s) => broad(s.net));
}

export interface PersistOptions {
	readonly store: FiloStore;
	/** The sidecar hash the Studio stored with the deck's source, or null. */
	readonly sidecar: (doc: string) => number | null;
	/** Narrow broad steps off the main thread; null when there is no worker (they are stored as they are). */
	readonly narrow?: ((snap: Snapshot) => Promise<Snapshot | null>) | null;
	/** Replay a stored history off the main thread (`replaySnapshot`); null when there is no worker
	 *  (the restore then replays it in place, which a long history pays for in one frame). */
	readonly verify?: ((snap: Snapshot) => Promise<boolean | null>) | null;
	/** Tell the author something once (the second-tab notice). */
	readonly notify?: (message: string) => void;
	/** Quiet time after a change before the idle write. Longer than the Studio's 400 ms source
	 *  debounce, so Filo is rarely ahead of the stored source. */
	readonly delayMs?: number;
	/** Hear the case each open applied (tests, diagnostics). */
	readonly onOpen?: (doc: string, applied: ReloadCase | 'fresh' | 'memory-only' | 'refused') => void;
}

export interface FiloPersistence {
	/** A history the Studio just loaded with `source`: claim it, put its stored past under it, and
	 *  store it from now on. Resolves when that is done. */
	open(h: History, source: string): Promise<void>;
	/** Store every owned history now (the page is hiding). */
	flush(): void;
	/** A deck deleted: its stored history goes too. */
	drop(doc: string): void;
}

type Watched = { h: History; owned: boolean; timer: ReturnType<typeof setTimeout> | null; written: number; queued: number; unsub: (() => void) | null };

const idle = (fn: () => void) => {
	const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
	if (ric) ric(fn, { timeout: 2000 });
	else setTimeout(fn, 0);
};

export function createFiloPersistence(opts: PersistOptions): FiloPersistence {
	const { store } = opts;
	const delay = opts.delayMs ?? 800;
	const watched = new Map<string, Watched>();
	// A broad net patch the worker already narrowed, by identity: a step's net patch only changes
	// when the step does, so each one crosses to the worker once. `tried` remembers every net the
	// worker has seen, narrowed or not (two unrelated decks have nothing to narrow), so a write
	// with no new broad step never crosses at all.
	const narrowed = new WeakMap<Patch, Patch>();
	const tried = new WeakSet<Patch>();
	let warned = false;

	const withCached = (snap: Snapshot): Snapshot => {
		const sub = (list: Snapshot['done']) => list.map((s) => (narrowed.has(s.net) ? { ...s, net: narrowed.get(s.net) as Patch } : s));
		return { ...snap, done: sub(snap.done), undone: sub(snap.undone) };
	};

	const write = async (w: Watched, narrow: boolean) => {
		const rev = w.h.state().revision;
		if (!w.owned || rev === w.written || rev <= w.queued) return;
		const raw = toSnapshot(src(w.h));
		// Nothing to undo, redo or restore: storing it would only spend quota (every deck opened, at every boot).
		if (raw.done.length + raw.undone.length + raw.marks.length === 0) return;
		let snap = withCached(raw);
		if (narrow && opts.narrow && hasBroad(raw, tried)) {
			const n = await opts.narrow(snap).catch(() => null);
			if (n) {
				const all = [...raw.done, ...raw.undone];
				const out = [...n.done, ...n.undone];
				for (let i = 0; i < all.length && i < out.length; i++) {
					tried.add(all[i].net);
					// The clone always comes back as a new array: keep it only when it is really narrower.
					if (out[i].net.length !== all[i].net.length) narrowed.set(all[i].net, out[i].net);
				}
				snap = withCached(raw);
			}
		}
		// A newer write was queued while the worker ran (the page hid): this older one must not land after it.
		if (rev <= w.queued) return;
		w.queued = rev;
		if (await store.write(snap)) w.written = Math.max(w.written, rev);
		// A failed write (quota, an aborted transaction) is retried by the next write or the flush.
		else if (w.queued === rev) w.queued = w.written;
	};

	const schedule = (w: Watched) => {
		if (w.timer) clearTimeout(w.timer);
		w.timer = setTimeout(() => {
			w.timer = null;
			idle(() => void write(w, true));
		}, delay);
	};

	return {
		async open(h, source) {
			if (watched.has(h.doc)) return;
			const w: Watched = { h, owned: false, timer: null, written: -1, queued: -1, unsub: null };
			watched.set(h.doc, w);
			if (!(await store.claim(h.doc))) {
				if (!warned) opts.notify?.('This deck is open in another tab, so its undo history here will not survive a reload.');
				warned = true;
				opts.onOpen?.(h.doc, 'memory-only');
				return;
			}
			if (watched.get(h.doc) !== w) {
				store.release(h.doc);
				return;
			}
			const stored = await store.read(h.doc);
			// The replay runs in the worker; `null` means there is none, and the restore replays in place.
			const ok = stored && opts.verify ? await opts.verify(stored).catch(() => null) : null;
			// Dropped (the deck deleted) while storage answered: give the lock back and stop.
			if (watched.get(h.doc) !== w) {
				store.release(h.doc);
				return;
			}
			let applied: ReloadCase | 'fresh' | 'refused' = 'fresh';
			if (stored && ok === false) applied = 'refused';
			else if (stored) applied = adoptStored(h, source, opts.sidecar(h.doc), stored, ok === true) ?? 'refused';
			w.owned = true;
			w.written = applied === 'in-step' ? h.state().revision : -1;
			w.unsub = h.subscribe(
				(s) => s.revision,
				() => schedule(w),
			);
			if (w.written !== h.state().revision) schedule(w);
			opts.onOpen?.(h.doc, applied);
		},
		flush() {
			for (const w of watched.values()) {
				if (w.timer) {
					clearTimeout(w.timer);
					w.timer = null;
				}
				void write(w, false);
			}
		},
		drop(doc) {
			const w = watched.get(doc);
			watched.delete(doc);
			if (w) {
				w.unsub?.();
				if (w.timer) clearTimeout(w.timer);
				if (w.owned) store.release(doc);
			}
			void store.remove(doc);
		},
	};
}

// ── The Studio's instances ──────────────────────────────────────────────────

let shared: FiloStore | null = null;
/** The Studio's one history store (IndexedDB, or memory where there is none). */
export function filoStore(): FiloStore {
	shared ??= createFiloStore(typeof indexedDB === 'undefined' ? memoryBackend() : idbBackend(FILO_DB));
	return shared;
}

/** How long a worker request may take before the caller falls back (no narrowing; replay in place). */
const ASK_TIMEOUT_MS = 15_000;
let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (reply: { snap?: Snapshot | null; ok?: boolean } | null) => void>();
/** Ask the worker (`filo-narrow.worker.ts`). Null where there is no worker (Node, a strict CSP). */
function ask(kind: 'narrow' | 'verify', snap: Snapshot): Promise<{ snap?: Snapshot | null; ok?: boolean } | null> {
	if (worker === undefined) {
		try {
			worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./filo-narrow.worker.ts', import.meta.url), { type: 'module' });
			if (worker) {
				worker.onmessage = (e: MessageEvent<{ id: number; snap?: Snapshot | null; ok?: boolean }>) => {
					waiting.get(e.data.id)?.(e.data);
					waiting.delete(e.data.id);
				};
				worker.onerror = () => {
					for (const r of waiting.values()) r(null);
					waiting.clear();
					worker?.terminate();
					worker = null;
				};
			}
		} catch {
			worker = null;
		}
	}
	const w = worker;
	if (!w) return Promise.resolve(null);
	const id = nextId++;
	return new Promise((resolve) => {
		// A worker that never answers (a chunk that failed to load without an error event) must not
		// hold a deck's history open forever: past the timeout the caller takes its no-worker path.
		const timer = setTimeout(() => {
			waiting.delete(id);
			resolve(null);
		}, ASK_TIMEOUT_MS);
		waiting.set(id, (reply) => {
			clearTimeout(timer);
			resolve(reply);
		});
		w.postMessage({ id, kind, snap });
	});
}

/** Narrow a snapshot in the worker. Null without one: the broad steps are then stored as they
 *  are, and the byte cap counts them at that size. */
export const narrowInWorker = (snap: Snapshot): Promise<Snapshot | null> => ask('narrow', snap).then((r) => r?.snap ?? null);

/** Replay a stored history in the worker. Null without one: the restore replays in place. */
export const verifyInWorker = (snap: Snapshot): Promise<boolean | null> => ask('verify', snap).then((r) => (r && typeof r.ok === 'boolean' ? r.ok : null));

/** The same check on this thread, for a test or a host with no worker. */
export const verifyHere = (snap: Snapshot): Promise<boolean> => Promise.resolve(replaySnapshot(snap) !== null);
