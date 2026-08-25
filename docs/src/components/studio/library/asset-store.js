// The Workbench library — a small IndexedDB asset store (the persistence rail
// the two studios save into). The first concrete slice of the asset model from
// 2026-06-09-drawing-board-asset-import.md: library-scoped records of
// kind:'theme' | 'component', so a crafted theme or component survives a reload
// and can be loaded back for editing.
//
// DELIBERATELY its own database (`lattice-workbench`), separate from the Drawing
// Board's `lattice-db`: the Drawing Board store owns its own schema/version, and
// a first asset slice shouldn't risk a cross-page migration. Unifying the two
// (so the Drawing Board's palette picker reads library themes, and deck export
// materializes assets across all three render paths) is the next slice — the
// export bridge — and gets its own design pass. Record SHAPES are the pure,
// unit-tested repo core (themeAsset in lib/theme/serialize, componentAsset in
// lib/layout/scaffold); this module only persists them.
//
// The connection and schema live in `asset-db.js`; see its header for why.
//
// ── EVERY OVERWRITE IS VERSIONED, AND IT HAPPENS HERE ───────────────────────
//
// `asset-history.js` was written alongside the in-place edit #1873 shipped, and says in its own
// docblock that history "is what makes that overwrite safe to offer at all". It then
// shipped with ZERO production callers, so the Studio offered the overwrite without
// the thing that made it safe. This is that wiring.
//
// IT IS IN THE STORE RATHER THAN IN THE FACULTIES, and that is not tidiness. Two
// facts decide it:
//
//  1. **Only this function knows which record is about to be replaced.** A caller
//     that passes an id knows it; a caller that passes NONE does not, because the
//     `(kind, name)` dedupe below is what resolves it. That second path is not
//     hypothetical or rare — it is the `.zip` import (`Library.tsx` `importFiles`)
//     and the workspace restore (`workspace-backup.ts`), and importing a bundle whose
//     theme happens to share a name with one of yours silently replaced your CSS.
//     Wiring history in the faculties cannot cover that path at all; a caller would
//     have to re-implement the dedupe to find out what it was about to destroy.
//  2. **There are eight writers and five deleters**, two of the deleters reached from
//     the Inspector rather than the Library, and one (`governance.ts`
//     `clearLibraryAssets`) a sweep over every asset of every kind. A per-faculty
//     wiring is nine call sites that each have to remember, and the tenth writer added
//     later silently opts out. Here, opting out is not reachable.
//
// A SNAPSHOT FAILURE FAILS THE SAVE. `putAsset` does not swallow an error from
// `saveAssetVersion`. If the snapshot cannot be taken, we have not earned the right to
// overwrite — that is the whole claim in the history module's docblock — and the
// caller's edit is still in its editor, where a rejected promise surfaces as a toast.
// Catching would silently recreate the exact hazard this wiring exists to close. The
// cost is real and worth naming: a browser at its storage quota refuses saves rather
// than degrading to unversioned ones. `VERSION_CAP` bounds the growth this can cause
// (20 per asset), and `pruneOrphanVersions` reclaims what deletes miss.

import { ASSET_STORE, openDB, reqAsPromise } from './asset-db.js';
import { deleteAssetVersions, saveAssetVersion } from './asset-history.js';

export { HISTORY_STORE, openDB, reqAsPromise } from './asset-db.js';

/**
 * The kinds whose overwrites are versioned.
 *
 * The three the Library shows a card for, which is the same three a person can EDIT
 * in place and therefore the same three that can lose work to a save. Both omissions
 * are deliberate:
 *
 *   `refdoc` — an ingested FILE (a PDF and its extracted text), not an authored
 *              artifact. You replace one by attaching the file again, so there is no
 *              edit to lose, and versioning it would put up to 20 copies of a
 *              multi-megabyte binary into a quota the decks share.
 *   `scene`  — authored, and it would belong here, but scenes have no Library shelf
 *              yet (#1678), so there is nowhere to see or restore a version from.
 *              Storing them would be cost with no reachable benefit. Add `'scene'`
 *              to this set in the same change that gives scenes a card.
 */
const VERSIONED_KINDS = new Set(['theme', 'component', 'finish']);

/**
 * Fields that move on every save whether or not anything was authored.
 *
 * `addedAt` is the Library's sort key and every faculty re-stamps it with
 * `Date.now()` on each save, so two saves of identical content are never
 * byte-identical records. That matters because `saveAssetVersion`'s
 * consecutive-identical guard compares whole records: it exists so that "open an
 * asset and save without touching anything" does not manufacture a version, and
 * `addedAt` defeated it every time. Measured before this: three no-op saves produced
 * three versions — and with `VERSION_CAP` at 20, a handful of reflexive saves evicts
 * real history off the end of the list.
 *
 * So the comparison below is "did anything a person authored change", which is the
 * question the guard was always asking.
 */
const VOLATILE_FIELDS = ['addedAt'];

function sameExceptVolatile(a, b) {
  if (!a || !b) return false;
  const strip = (r) => {
    const out = { ...r };
    for (const k of VOLATILE_FIELDS) delete out[k];
    // Key order is not guaranteed equal across a structured clone and a freshly built
    // record, so compare on SORTED keys rather than on raw JSON.stringify output.
    return JSON.stringify(Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]])));
  };
  return strip(a) === strip(b);
}

function tx(db, mode) {
  return db.transaction(ASSET_STORE, mode).objectStore(ASSET_STORE);
}

/** A stable-ish id when a record doesn't carry one. */
function newId(prefix = 'a') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Insert or update an asset record. A record without an `id` gets one; a record
 * whose (kind, name) already exists is UPDATED in place (re-saving a theme you
 * tweaked replaces it rather than piling up duplicates). Returns the stored
 * record.
 *
 * When the put REPLACES an existing versioned record, the record as it stands is
 * snapshotted into history first — see the module header for why that lives here.
 * `historyLabel` is what the version list will show ("Before edit", "Before restore",
 * "Before import") — named apart from the record's OWN `label` field, which is the
 * asset's display name; `ts` is a parameter for the same reason it is one in
 * `asset-history.js`: it keeps the store testable without faking the clock.
 */
export async function putAsset(record, { historyLabel = 'Before save', ts = Date.now() } = {}) {
  const db = await openDB();
  let toStore = record;
  if (!toStore.id) {
    const existing = (await listAssets(record.kind)).find(a => a.name === record.name);
    toStore = { ...record, id: existing ? existing.id : newId({ theme: 't', component: 'c', finish: 'f', scene: 's', refdoc: 'd' }[record.kind] || 'a') };
  }
  if (VERSIONED_KINDS.has(toStore.kind)) {
    // NOT ATOMIC WITH THE PUT, and that is a real limit rather than a design choice.
    // Sharing one `readwrite` transaction across both stores would be the atomic
    // answer, but `saveAssetVersion` awaits between its requests, and in a real
    // browser an IndexedDB transaction auto-closes when the microtask queue drains
    // with no request pending — so the shared-transaction version would have to
    // reshape the history kernel, not just widen a scope.
    //
    // What that costs: two tabs saving the SAME asset can interleave (read-previous,
    // read-previous, snapshot, snapshot, put, put), and the middle save then exists
    // in neither the store nor history. One tab cannot reach it — Fabricate disables
    // Save while saving and the import loop awaits sequentially — so it needs genuine
    // concurrency on one record. Named here rather than left for someone to find.
    const previous = await getAsset(toStore.id);
    if (previous && !sameExceptVolatile(previous, toStore)) {
      await saveAssetVersion(previous, historyLabel, ts);
    }
  }
  await reqAsPromise(tx(db, 'readwrite').put(toStore));
  return toStore;
}

/** All assets, newest first; optionally filtered to one kind. */
export async function listAssets(kind) {
  const db = await openDB();
  const all = await reqAsPromise(tx(db, 'readonly').getAll());
  const rows = kind ? all.filter(a => a.kind === kind) : all;
  return rows.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/** One asset by id (or undefined). */
export async function getAsset(id) {
  const db = await openDB();
  return reqAsPromise(tx(db, 'readonly').get(id));
}

/**
 * Put a stored version back as the live record.
 *
 * It goes through `putAsset`, which is the whole point: restoring is itself an
 * overwrite, so the record you are about to replace is snapshotted first. That is
 * the "restore checkpoints current state before restoring" contract the history
 * kernel was shaped around (`asset-history.js` header) — satisfied by construction
 * here rather than by every caller remembering to do it in the right order.
 *
 * `addedAt` is re-stamped rather than restored. Everything a person can SEE or edit
 * — the CSS, the name, the essentials, the recipe — comes back exactly as it was;
 * `addedAt` is not part of the asset, it is the Library's sort key, and restoring
 * the old one would file a record you just touched at the bottom of the shelf.
 *
 * IT REFUSES WHEN THE OLD NAME IS NOW SOMEONE ELSE'S. A snapshot carries the name the
 * asset had, and restoring is id-pinned, so it writes that name back WITHOUT passing
 * the `(kind, name)` dedupe below. Rename `alpha` to `beta`, save a new `alpha`, then
 * restore: two live records are called `alpha`, and the next save that passes no id —
 * the `.zip` import — resolves the name to whichever sorts newest and overwrites the
 * record that was just restored. Uniqueness on `(kind, name)` is what the whole
 * no-id path resolves against, so a restore is not allowed to break it.
 *
 * Refusing rather than auto-renaming is deliberate. The name is the DECK-FACING
 * identity (a deck says `theme: alpha`), and it must also match the `@theme` inside
 * the stylesheet or the engine registers the theme under one name while the deck
 * renders by the other — a blank, unthemed slide. So both halves have to move
 * together, which is a rename, which is a decision only the person can make.
 */
export async function restoreAssetVersion(version) {
  const snapshot = version?.snapshot;
  if (!snapshot?.id) throw new Error('restoreAssetVersion: version has no snapshot');
  const clash = (await listAssets(snapshot.kind)).find((a) => a.name === snapshot.name && a.id !== snapshot.id);
  if (clash) {
    throw new Error(`Can't restore — “${snapshot.name}” is now another saved ${snapshot.kind}. Rename that one first.`);
  }
  return putAsset({ ...snapshot, addedAt: Date.now() }, { historyLabel: 'Before restore' });
}

/**
 * Delete an asset by id, and its version history with it.
 *
 * ORDER IS LOAD-BEARING: the asset goes first. If the second step then fails we are
 * left with versions pinned to an id nothing points at, which `pruneOrphanVersions`
 * reclaims. Deleting the versions first and failing on the asset would leave a LIVE
 * record with its history gone, which nothing can undo. Same "erring long is
 * recoverable, erring short is not" reasoning as the cap in `saveAssetVersion`.
 */
export async function deleteAsset(id) {
  const db = await openDB();
  await reqAsPromise(tx(db, 'readwrite').delete(id));
  await deleteAssetVersions(id);
}
