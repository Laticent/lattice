// Version history for a saved Library asset — the undo behind an in-place edit.
//
// WHY THIS EXISTS. Editing a saved theme / component / finish OVERWRITES it: the
// record you opened is the record you save, so every deck already using it picks
// the change up immediately. That is the behavior people expect, and on its own it
// is unforgiving — there is no way back to the version you had, and the decks that
// changed under you did so without asking. History is what makes that overwrite
// safe to offer at all.
//
// WHERE IT LIVES, AND WHY NOT WHERE DECKS KEEP THEIRS. Deck checkpoints live in
// `localStorage` (studio-store.ts `SNAP_PREFIX`), and mirroring that here was the
// obvious move. It is the wrong one: a serialized theme runs 5–20KB against a
// ~5MB localStorage ceiling shared with every deck, every chat and every setting,
// so a few heavily-edited themes could crowd out the decks themselves. The assets
// are already in IndexedDB, which has no such ceiling and is already counted by
// `navigator.storage.estimate()`. Versions belong beside the thing they version.
//
// WHAT IT IS NOT. This is not the shareable asset contract. A `.zip` built by
// `asset-bundle.ts` carries the CURRENT asset and nothing else — nobody wants to
// receive a stranger's edit history. History is private workspace state.
//
// AND IT IS NOT IN THE WORKSPACE BACKUP. This docblock used to claim the backup
// "carries it separately from `library.zip`", and that was never true —
// `workspace-backup.ts` has never referenced this module. `listAllAssetVersions`
// and `putAssetVersions` below exist FOR that round trip and are tested for it;
// what is missing is not the plumbing but a way to land it correctly, and that is
// worth stating so the next attempt does not start by adding two lines and calling
// it done: a version is keyed on `assetId`, the bundle format carries no asset ids
// (`ThemeItem` is `{kind, name, label, essentials, css}`), and restore upserts by
// NAME — so versions restored as-is would point at ids the receiving browser never
// minted, and `pruneOrphanVersions` would correctly delete every one of them. Doing
// it properly means the backup carries a name→id map and restore rewrites `assetId`
// against the ids it actually resolved, which is a change to the workspace FORMAT.
// Logged in engineering/decisions/2026-08-25-hand-editing-generated-assets.md
// (precondition 3), not smuggled in here.
//
// The SHAPE is lifted deliberately from the deck checkpoints it does not share a
// store with (load / save-with-dedupe-and-cap / restore-that-checkpoints-first),
// because that shape is proven and a second idiom for the same job is a second
// thing to learn. `ts` is a parameter rather than a `Date.now()` call for the same
// reason it is there: it keeps the store testable without faking the clock.

// From `asset-db.js`, not `asset-store.js`: the store now calls INTO this module
// (every overwrite is snapshotted there), so importing back from it would be a cycle.
// The connection module exists to break exactly that — see its header.
import { HISTORY_STORE, openDB, reqAsPromise } from './asset-db.js';

/** Versions kept per asset. Beyond this the oldest is dropped. */
export const VERSION_CAP = 20;

function store(db, mode) {
  return db.transaction(HISTORY_STORE, mode).objectStore(HISTORY_STORE);
}

/**
 * Run one `readwrite` transaction over the history store, and resolve on COMMIT.
 *
 * ── WHY NOTHING IN HERE IS AWAITED ──────────────────────────────────────────
 *
 * Every writer below used to `await` between its requests — `await put`, then a loop
 * of `await delete`. An IndexedDB transaction deactivates when control returns to the
 * event loop, so that shape is only safe if the engine happens to keep the
 * transaction alive across a promise microtask. Chromium does. That is not a
 * guarantee, it is a behavior: measured in real Chromium 141, a request issued after
 * one or two microtasks is ALLOWED and one issued after a macrotask throws
 * `TransactionInactiveError`.
 *
 * `putAsset` was rewritten to chain its requests for exactly this reason — and the
 * first cut of that fix left these three siblings on the old pattern, in the same
 * file, with the diagnosis written above them. Two of them ship: `deleteAssetVersions`
 * runs on every asset delete and `pruneOrphanVersions` on every Library open. On an
 * engine less lenient than Chromium, a delete loop that dies halfway leaves an asset
 * gone with its history behind — the exact shape this module says it prevents.
 *
 * So: the caller gets the store, issues every request SYNCHRONOUSLY (or from inside a
 * previous request's `onsuccess`), and the promise settles on `oncomplete`. Resolving
 * on the last request's success would be the same mistake one level up — only
 * `oncomplete` means it committed.
 */
function inOneTransaction(db, run, what) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(HISTORY_STORE, 'readwrite');
    let result;
    t.oncomplete = () => resolve(result);
    t.onabort = () => reject(t.error || new Error(`${what}: rolled back`));
    t.onerror = () => reject(t.error || new Error(`${what}: failed`));
    run(t.objectStore(HISTORY_STORE), (value) => { result = value; });
  });
}

/**
 * @typedef {Object} AssetVersion
 * @property {string} id        this version's own key
 * @property {string} assetId   the asset it belongs to
 * @property {number} ts        when it was taken
 * @property {string} label     why it was taken ("Before edit", "Before restore")
 * @property {Object} snapshot  the WHOLE asset record as it was
 */

/**
 * DECIDE what a snapshot writes, without touching the database.
 *
 * Pure, so two different write shapes can still write the SAME THING: `putAsset`
 * (asset-store.js) queues its requests inside a transaction it owns across BOTH
 * stores, while `saveAssetVersion` below owns one over this store alone. The cap, the
 * consecutive-identical guard and the version id are decided here and nowhere else
 * (HARD RULE #15).
 *
 * BE HONEST ABOUT WHO CALLS WHAT. `saveAssetVersion` has no production caller any
 * more — `putAsset` took over the snapshot when it became atomic, and it reaches the
 * policy through this function instead. That is worth stating plainly rather than
 * leaving a docblock implying two live callers, because this module already shipped
 * once as dead code that a docblock described as load-bearing, and that is the whole
 * reason the commit before this one exists. It is kept, not deleted, because it is the
 * one way to snapshot a record OUTSIDE a save — which the workspace-backup round trip
 * (precondition 3 in the design note) will need — and because its 11 tests are the
 * kernel's own contract. If that need never materializes, delete it; do not let it sit
 * here being described as something it is not.
 *
 * `existingNewestFirst` is that asset's current versions, newest first. Returns
 * `null` for a no-op, else `{ version, doomed }` — the row to put and the rows the
 * cap pushes off the end.
 */
export function planSnapshot(existingNewestFirst, record, label, ts) {
  const existing = existingNewestFirst || [];
  const snapshot = JSON.stringify(record);
  if (existing[0] && JSON.stringify(existing[0].snapshot) === snapshot) return null;
  const version = {
    id: `av-${ts.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    assetId: record.id,
    ts,
    label,
    snapshot: JSON.parse(snapshot), // a deep copy — the caller keeps mutating `record`
  };
  return { version, doomed: [version, ...existing].slice(VERSION_CAP) };
}

/** Sort a raw `assetId` index read into the newest-first order everything here assumes. */
export function newestFirst(rows) {
  return (rows || []).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/** Every version of one asset, newest first. */
export async function listAssetVersions(assetId) {
  if (!assetId) return [];
  const db = await openDB();
  return newestFirst(await reqAsPromise(store(db, 'readonly').index('assetId').getAll(assetId)));
}

/**
 * Snapshot `record` as it is NOW, before something replaces it. Returns the
 * updated list, newest first.
 *
 * Skips a no-op when the newest version is already byte-identical — the same guard
 * the deck checkpoints use, for the same reason: a history full of identical entries
 * is a history nobody scrolls.
 *
 * IT IS NOT WHAT STOPS A NO-OP SAVE FROM MAKING A VERSION, though it was written
 * believing it was. Every faculty re-stamps `addedAt` with `Date.now()` on save, so
 * two saves of identical content are never byte-identical RECORDS and this comparison
 * could not fire in production — measured, three no-op saves produced three versions.
 * That question is answered one level up, by `sameExceptVolatile` in `asset-store.js`,
 * which compares on authored content. This guard remains as the kernel's own
 * belt-and-braces for a caller that snapshots the same bytes twice.
 */
export async function saveAssetVersion(record, label, ts) {
  if (!record?.id) return [];
  const db = await openDB();
  return inOneTransaction(db, (s, set) => {
    const read = s.index('assetId').getAll(record.id);
    read.onsuccess = () => {
      const existing = newestFirst(read.result);
      const plan = planSnapshot(existing, record, label, ts);
      if (!plan) {
        set(existing);
        return;
      }
      s.put(plan.version);
      // Cap AFTER the put, so a failure mid-prune leaves too many versions rather
      // than a lost one. Erring long is recoverable; erring short is not.
      for (const old of plan.doomed) s.delete(old.id);
      set([plan.version, ...existing].slice(0, VERSION_CAP));
    };
  }, 'saveAssetVersion');
}

/** Drop every version of one asset — called when the asset itself is deleted. */
export async function deleteAssetVersions(assetId) {
  if (!assetId) return;
  const db = await openDB();
  await inOneTransaction(db, (s) => {
    const read = s.index('assetId').getAll(assetId);
    read.onsuccess = () => { for (const row of read.result || []) s.delete(row.id); };
  }, 'deleteAssetVersions');
}

/**
 * Drop versions whose asset no longer exists.
 *
 * A safety net, not the main path: `deleteAssetVersions` runs on delete, but a
 * record removed by any route that skips it (a restore that replaces the shelf, a
 * future bulk op) would otherwise leave versions pinned to an id nothing points
 * at, invisible and un-deletable through the UI. `liveIds` is the set of asset ids
 * that currently exist; everything else goes.
 */
export async function pruneOrphanVersions(liveIds) {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds || []);
  const db = await openDB();
  return inOneTransaction(db, (s, set) => {
    const read = s.getAll();
    read.onsuccess = () => {
      let dropped = 0;
      for (const row of read.result || []) {
        if (live.has(row.assetId)) continue;
        s.delete(row.id);
        dropped += 1;
      }
      set(dropped);
    };
  }, 'pruneOrphanVersions');
}

/** Every version in the store, for the workspace backup. */
export async function listAllAssetVersions() {
  const db = await openDB();
  const rows = await reqAsPromise(store(db, 'readonly').getAll());
  return rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/**
 * Put versions back, as they came out of a backup. Idempotent on `id`, so
 * restoring the same backup twice does not double the history.
 */
export async function putAssetVersions(versions) {
  const rows = (versions || []).filter((v) => v?.id && v?.assetId);
  if (!rows.length) return 0;
  const db = await openDB();
  await inOneTransaction(db, (s) => { for (const row of rows) s.put(row); }, 'putAssetVersions');
  return rows.length;
}
