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
 * @typedef {Object} AssetVersion
 * @property {string} id        this version's own key
 * @property {string} assetId   the asset it belongs to
 * @property {number} ts        when it was taken
 * @property {string} label     why it was taken ("Before edit", "Before restore")
 * @property {Object} snapshot  the WHOLE asset record as it was
 */

/** Every version of one asset, newest first. */
export async function listAssetVersions(assetId) {
  if (!assetId) return [];
  const db = await openDB();
  const rows = await reqAsPromise(store(db, 'readonly').index('assetId').getAll(assetId));
  return rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
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
  const existing = await listAssetVersions(record.id);
  const snapshot = JSON.stringify(record);
  if (existing[0] && JSON.stringify(existing[0].snapshot) === snapshot) return existing;
  const version = {
    id: `av-${ts.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    assetId: record.id,
    ts,
    label,
    snapshot: JSON.parse(snapshot), // a deep copy — the caller keeps mutating `record`
  };
  const db = await openDB();
  const s = store(db, 'readwrite');
  await reqAsPromise(s.put(version));
  // Cap AFTER the write, so a failure mid-prune leaves too many versions rather
  // than a lost one. Erring long is recoverable; erring short is not.
  const doomed = [version, ...existing].slice(VERSION_CAP);
  for (const old of doomed) await reqAsPromise(s.delete(old.id));
  return [version, ...existing].slice(0, VERSION_CAP);
}

/** Drop every version of one asset — called when the asset itself is deleted. */
export async function deleteAssetVersions(assetId) {
  if (!assetId) return;
  const db = await openDB();
  const s = store(db, 'readwrite');
  const rows = await reqAsPromise(s.index('assetId').getAll(assetId));
  for (const row of rows) await reqAsPromise(s.delete(row.id));
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
  const s = store(db, 'readwrite');
  const rows = await reqAsPromise(s.getAll());
  let dropped = 0;
  for (const row of rows) {
    if (live.has(row.assetId)) continue;
    await reqAsPromise(s.delete(row.id));
    dropped += 1;
  }
  return dropped;
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
  const s = store(db, 'readwrite');
  for (const row of rows) await reqAsPromise(s.put(row));
  return rows.length;
}
