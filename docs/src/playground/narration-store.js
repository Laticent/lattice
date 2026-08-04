// Narration clip store — the PERSISTENT tier of the read-aloud audio cache.
//
// voice-model.js has always cached synthesized sentence audio in a plain `Map`
// (`audioCache`, 200 entries FIFO). That cache dies with the page: rehearse a deck,
// reload the tab, present it — and every sentence is re-synthesized and re-billed.
// This module is the tier under it: the same bytes, keyed by the same
// CONTENT-COMPLETE key (`rung | model·voice | speed | sentence`), written to
// IndexedDB so the second run of a deck is instant and free.
//
// TWO OBJECT STORES, deliberately:
//   · `clips` — {key, bytes: ArrayBuffer, type}   the payload, read only on a hit
//   · `meta`  — {key, size, at}                   the tiny index stats + eviction walk
// IndexedDB can't sum a column, so a single-store design would have to materialize
// every audio blob just to answer "how many bytes am I holding?" — which is exactly
// what the Data tab's stat line and the LRU budget both need on every put. The meta
// store makes both O(rows) over a few dozen bytes each instead of O(megabytes).
//
// Node-safe BY DESIGN (mirrors voice-model.js's own header): plain JS, no `@/` alias,
// no TypeScript import, and every entry point guards `typeof indexedDB` so the module
// imports inert under `node --test` and in SSR. Every operation is best-effort — a
// blocked/absent/full IndexedDB degrades to the in-memory cache we already had, never
// to a thrown error on the playback path.

const DB_NAME = 'lattice-narration';
const DB_VERSION = 1;
const CLIPS = 'clips';
const META = 'meta';

/** Default on-device budget for synthesized narration. ~100 MB holds several fully
 *  prepared decks (a spoken sentence is typically 10–40 KB of mp3) while staying well
 *  inside a normal origin quota. Exported so the Workspace surface and the tests read
 *  the same number. */
export const DEFAULT_BUDGET_BYTES = 100 * 1024 * 1024;

let budgetBytes = DEFAULT_BUDGET_BYTES;
/** Override the LRU budget (Workspace control / tests). Values ≤ 0 are ignored. */
export function setBudgetBytes(n) {
  if (Number.isFinite(n) && n > 0) budgetBytes = n;
}
export function getBudgetBytes() {
  return budgetBytes;
}

// The recency stamp: monotonic WITHIN THIS TAB, not a bare `Date.now()`.
//
// Warm-ahead writes several clips inside the same millisecond (concurrency 3), so raw
// clock stamps TIE. IndexedDB breaks a tie on an index by primary key, which means the
// LRU walk would evict in ALPHABETICAL key order — i.e. by sentence text — instead of
// oldest-first. Caught by the eviction test: three same-millisecond puts evicted the
// middle one. Clamping to `last + 1` keeps insertion order within a millisecond while
// still tracking wall-clock across sessions (a later session's `Date.now()` always wins).
//
// The counter is per tab, so two tabs writing in the same millisecond can still tie and
// fall back to primary-key order (Copilot review, #1352). That residual is accepted, not
// overlooked: it costs at most a slightly wrong eviction choice between two clips written
// the same millisecond in different tabs, and the fix — a shared counter in the database
// — would put a read-modify-write on the path of every clip write to reorder an LRU that
// is already only a hint. The single-tab case, which is the one warm-ahead actually
// produces, is ordered correctly.
let lastStamp = 0;
function nextStamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLIPS)) db.createObjectStore(CLIPS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(META)) {
        const os = db.createObjectStore(META, { keyPath: 'key' });
        // The LRU walk reads this index in ascending `at` order and stops as soon as it
        // is back under budget — it never scans the whole store.
        os.createIndex('at', 'at', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Another tab holding an older version open would otherwise hang this promise
    // forever, and every await on the playback path with it.
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  }).catch((e) => {
    // A rejected open must not be memoized as a permanently-poisoned promise that every
    // later call re-awaits (and re-rejects on). Clear it so a transient failure — a
    // blocked upgrade that later clears — can be retried, then rethrow for THIS caller.
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** One read against a single store — resolves with the request's result. Reads need no
 *  commit barrier, so this is the plain request promise. */
function read(db, store, fn) {
  return reqAsPromise(fn(db.transaction(store, 'readonly').objectStore(store)));
}

/** Run `fn` against a readwrite transaction over both stores, resolving when the
 *  transaction COMMITS — not merely when the last request succeeds — so a caller that
 *  awaits a write and immediately reads back sees its own data. */
function write(db, fn) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction([CLIPS, META], 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    try {
      fn(tx.objectStore(CLIPS), tx.objectStore(META));
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already dead */
      }
      reject(e);
    }
  });
}

/**
 * A stored clip, in the SAME duck-typed blob-like shape voice-model.js's rungs return
 * and Suono's `decode` consumes — `{size, type, arrayBuffer()}`.
 *
 * `arrayBuffer()` hands back a FRESH `slice(0)` on every call, never the stored buffer
 * itself. `decodeAudioData` DETACHES whatever ArrayBuffer it is given (a spec'd side
 * effect), and a cached clip is replayed — the same sentence spoken again, a deck
 * presented twice. Returning one shared reference would decode the first time and throw
 * "Cannot decode detached ArrayBuffer" on every replay. This mirrors, deliberately, the
 * same `.slice(0)` discipline `pcmBlobFromResponse` already applies in voice-model.js.
 */
function blobLike(bytes, type) {
  return { size: bytes.byteLength, type: type || 'audio/mpeg', arrayBuffer: async () => bytes.slice(0) };
}

/**
 * Read a clip by its content-complete cache key. Returns a blob-like, or `null` on a
 * miss / unavailable storage. Touches the entry's `at` so the LRU sees a hit as recent
 * use — fire-and-forget, because a read on the playback path must never wait on a write.
 */
export async function getClip(key) {
  if (!key || typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDB();
    const rec = await read(db, CLIPS, (clips) => clips.get(key));
    if (!rec?.bytes) return null;
    touch(key);
    return blobLike(rec.bytes, rec.type);
  } catch {
    return null;
  }
}

/** Bump an entry's recency. Best-effort and unawaited by `getClip` — a failed touch
 *  only makes the LRU slightly less accurate, which is never worth a stall. */
function touch(key) {
  openDB()
    .then((db) =>
      write(db, (_clips, meta) => {
        const r = meta.get(key);
        r.onsuccess = () => {
          const m = r.result;
          if (m) meta.put({ ...m, at: nextStamp() });
        };
      }),
    )
    .catch(() => {
      /* best-effort */
    });
}

/**
 * Write a clip. `blob` is any blob-like with `.arrayBuffer()` (a real Blob, or the
 * duck-typed shape the rungs return). Resolves `true` when it landed, `false` on any
 * failure — a full or unavailable store degrades to the in-memory cache, silently.
 *
 * Evicts oldest-first afterwards if the store is over budget.
 */
export async function putClip(key, blob) {
  if (!key || !blob || typeof indexedDB === 'undefined') return false;
  try {
    const bytes = await blob.arrayBuffer();
    if (!bytes?.byteLength) return false;
    const db = await openDB();
    const at = nextStamp();
    await write(db, (clips, meta) => {
      clips.put({ key, bytes, type: blob.type || 'audio/mpeg' });
      meta.put({ key, size: bytes.byteLength, at });
    });
    await evictToBudget();
    return true;
  } catch {
    return false;
  }
}

/** `{count, bytes}` across every stored clip — the Data tab's stat line. Reads only the
 *  meta store, so it never materializes a byte of audio. */
export async function clipStats() {
  if (typeof indexedDB === 'undefined') return { count: 0, bytes: 0 };
  try {
    const db = await openDB();
    const rows = (await read(db, META, (meta) => meta.getAll())) || [];
    let bytes = 0;
    for (const m of rows) bytes += m.size || 0;
    return { count: rows.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** Drop every stored clip (the Data tab's "clear" action). */
export async function clearClips() {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDB();
    await write(db, (clips, meta) => {
      clips.clear();
      meta.clear();
    });
  } catch {
    /* nothing to clear / no storage */
  }
}

/**
 * LRU trim: while the store is over budget, delete the least-recently-used entry.
 *
 * Walks the `at` index with a cursor in ascending order and stops the moment the running
 * total is back under budget — so a store that is barely over pays for one delete, not a
 * full scan. Best-effort; a failure here only means the store stays temporarily large.
 */
async function evictToBudget() {
  try {
    const { bytes } = await clipStats();
    if (bytes <= budgetBytes) return;
    let over = bytes - budgetBytes;
    const db = await openDB();
    await write(db, (clips, meta) => {
      const cursorReq = meta.index('at').openCursor();
      cursorReq.onsuccess = () => {
        const cur = cursorReq.result;
        if (!cur || over <= 0) return;
        const m = cur.value;
        clips.delete(m.key);
        meta.delete(m.key);
        over -= m.size || 0;
        cur.continue();
      };
    });
  } catch {
    /* best-effort */
  }
}

/** Test seam: drop the memoized connection so a fresh fake-indexedDB can be installed. */
export function __resetForTests() {
  dbPromise = null;
  budgetBytes = DEFAULT_BUDGET_BYTES;
}
