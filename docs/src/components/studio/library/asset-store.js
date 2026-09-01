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
// A SNAPSHOT FAILURE FAILS THE SAVE, and now it does so atomically. If the snapshot
// cannot be taken we have not earned the right to overwrite — that is the whole claim
// in the history module's docblock — and the caller's edit is still in its editor,
// where a rejected promise surfaces as a toast. The cost is real and worth naming: a
// browser at its storage quota refuses saves rather than degrading to unversioned ones.
// `VERSION_CAP` bounds the growth this can cause (20 per asset), and
// `pruneOrphanVersions` reclaims what deletes miss.

// ── `(kind, name)` UNIQUENESS IS AN INVARIANT, ENFORCED HERE ────────────────
//
// Two live records under one name is not untidiness. `StudioShell` resolves an asset by
// name and takes the newest, while `finishExtraCss` / `usedLocalCss` concatenate the CSS
// of EVERY match — so the Inspector shows one record and the slide renders another — and
// `restoreAssetVersion` then refuses for both, locking each out of its own history.
//
// Only the id path can produce it: a put with an id is blind, while a put without one
// resolves the name to whichever record already holds it and updates that. So the check
// sits on the id path, INSIDE the write transaction, and aborts rather than resolving —
// a refused save leaves the shelf byte-identical, with no version snapshot taken.
//
// It is here rather than in the three faculties for the same reason history is (above):
// their guards read a React snapshot refreshed on save, which a second tab or a workspace
// restore behind an open faculty invalidates. Two independent review rounds drove exactly
// that and measured the duplicate. The UI guards are still worth keeping — they disable
// Save with a reason instead of letting the author hit an error — but they are the second
// line, not the invariant. The whole state table is enumerated in
// `asset-save-states.test.ts`.

import { ASSET_STORE, HISTORY_STORE, openDB, reqAsPromise } from './asset-db.js';
import { deleteAssetVersions, newestFirst, planSnapshot } from './asset-history.js';

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
 * The opening words of a refusal WE raised, as opposed to a storage failure the browser
 * raised. Exported because the faculties branch on it: a `(kind, name)` clash is the
 * author's to fix and its message names the fix, while anything else is reported as
 * "your browser may block storage".
 *
 * It is a constant rather than a literal repeated in three files because the coupling is
 * invisible otherwise — reword the message and the faculties silently fall back to the
 * storage-failure text, which is the exact defect the branch that added this fixed, and
 * no test would have gone red. `refusal-prefix.test.ts` pins the message against it and
 * drives both branch arms in both faculties.
 */
export const REFUSAL_PREFIX = "Can't save —";

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
 *
 * ── ONE TRANSACTION, AND NOT AN `await` IN SIGHT ────────────────────────────
 *
 * The id lookup, the snapshot and the put all run inside a SINGLE `readwrite`
 * transaction spanning both object stores, so either the version and the overwrite
 * both land or neither does.
 *
 * The first cut used three separate transactions with `await` between them, and the
 * gap was reachable: two tabs on the same record read the same `previous`, each
 * snapshotted it, and each wrote — leaving the middle save in neither the store nor
 * history. Measured on the three-transaction version: live `V3`, history `[V1, V1]`,
 * and `V2` gone. One tab cannot reach it (Save is disabled while saving and the import
 * loop awaits sequentially), but "needs two tabs" is not the same as "cannot happen"
 * for the one guarantee this module exists to make.
 *
 * EVERY STEP IS CHAINED FROM THE PREVIOUS REQUEST'S `onsuccess`, deliberately. An
 * IndexedDB transaction deactivates when control returns to the event loop, so
 * `await`-ing mid-transaction is a bug that happens to work in Chromium and is not
 * guaranteed anywhere. Callback chaining is the only shape that is correct by
 * construction rather than by engine.
 *
 * The POLICY is still the history kernel's: `planSnapshot` decides the version id, the
 * consecutive-identical guard and the cap, and it is pure so this path and
 * `saveAssetVersion` cannot drift (HARD RULE #15).
 */
export async function putAsset(record, { historyLabel = 'Before save', ts = Date.now() } = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([ASSET_STORE, HISTORY_STORE], 'readwrite');
    const assets = t.objectStore(ASSET_STORE);
    const history = t.objectStore(HISTORY_STORE);
    let stored = null;
    // A refusal we raised ourselves, as distinct from a storage failure. Set before
    // `t.abort()` so `onabort` can reject with the real reason instead of the generic
    // rollback message.
    let refusal = null;
    // Resolve on COMPLETE, not on the last request's success: only `oncomplete` means
    // the whole unit — version and overwrite — actually committed.
    t.oncomplete = () => resolve(stored);
    t.onabort = () => reject(refusal || t.error || new Error('putAsset: the save was rolled back'));
    t.onerror = () => reject(t.error || new Error('putAsset: the save failed'));

    const write = (id) => {
      const toStore = { ...record, id };
      stored = toStore;
      if (!VERSIONED_KINDS.has(toStore.kind)) {
        assets.put(toStore);
        return;
      }
      const getPrev = assets.get(id);
      getPrev.onsuccess = () => {
        const previous = getPrev.result;
        if (!previous || sameExceptVolatile(previous, toStore)) {
          assets.put(toStore);
          return;
        }
        const read = history.index('assetId').getAll(id);
        read.onsuccess = () => {
          const plan = planSnapshot(newestFirst(read.result), previous, historyLabel, ts);
          if (plan) {
            history.put(plan.version);
            for (const old of plan.doomed) history.delete(old.id);
          }
          assets.put(toStore);
        };
      };
    };

    if (record.id) {
      // `(kind, name)` UNIQUENESS IS ENFORCED HERE, not by the callers.
      //
      // The id path is a blind put — it is the ONLY way two live records can end up
      // sharing a name, because the no-id path below resolves the name to whichever
      // record already holds it and updates that one. Three faculties each guard it in
      // the UI, and those guards read a React snapshot refreshed on save: two tabs, or a
      // workspace restore behind an open faculty, and the snapshot is stale. Both the
      // round-2 checker and the Munger inversion drove exactly that and measured two live
      // records under one name.
      //
      // The damage is not untidiness. `StudioShell` resolves an asset by name and takes
      // the newest, while `finishExtraCss`/`usedLocalCss` concatenate the CSS of EVERY
      // match — so the Inspector shows one record and the slide renders another — and
      // `restoreAssetVersion` (which already refuses this state, :256) then locks both
      // records out of their own history permanently.
      //
      // So the check goes where it cannot be bypassed or go stale: inside the same
      // transaction as the write, reading the store it is about to modify. Aborting
      // rather than resolving is what makes it an invariant — nothing is written and no
      // version is snapshotted, so a refused save leaves the shelf byte-identical.
      //
      // Deliberately scoped to a DIFFERENT record: pinning a record onto its own name is
      // the ordinary edit, and must stay free.
      //
      // Read through the `kind` index, not `getAll()`. The shelf holds `refdoc` records
      // that are whole PDFs, and a bare `getAll()` deserializes every one of them on a
      // path that previously read a single record by key. Measured in real Chromium by
      // the #1839 review, with three 8 MB reference docs on the shelf: ~50–100 ms and
      // ~24 MB of strings per save, against ~0.3–13 ms before and ~0.7–13 ms through the
      // index. (Those numbers are that review's artifact, not a bench in this tree —
      // there is no scenario covering the Studio's IndexedDB path.) The index is also
      // exactly the right question, since the invariant is per-kind.
      //
      // SAFE TO DEPEND ON: this is the first read of that index, and `asset-db.js` can
      // only create it alongside the store (`if (!objectStoreNames.contains(...))`), so a
      // database holding `assets` WITHOUT it could never gain one — every id-pinned save
      // would throw `NotFoundError` and reach the author as "your browser may block
      // storage". No such database exists: the store and the index have been created in
      // the same `onupgradeneeded` block since `2e5f2260` (2026-06-11,
      // `docs/src/playground/asset-store.js`, `DB_VERSION = 1`), which is the commit that
      // introduced this database, and through every move since — `6b3dd775` renamed it
      // here, `8f47a0e` split `asset-db.js` out.
      //
      // Verify it against GitHub, not this checkout: the sandbox clone is SHALLOW (66
      // commits, grafted at 80c0666), so `git log -S … --all` is bounded by the graft and
      // silently reports the graft boundary as the beginning of history. An earlier
      // version of this note did exactly that and named the wrong commit as the origin —
      // the database is ~2.5 months older than the one it cited.
      const dupes = assets.index('kind').getAll(record.kind);
      dupes.onsuccess = () => {
        const clash = (dupes.result || []).find((a) => a.name === record.name && a.id !== record.id);
        if (clash) {
          refusal = new Error(`${REFUSAL_PREFIX} “${record.name}” is already another saved ${record.kind}. Rename that one first.`);
          t.abort();
          return;
        }
        write(record.id);
      };
      return;
    }
    // The (kind, name) dedupe, done inside the transaction so the id it resolves
    // cannot be stale by the time we write to it. Sorted the same way `listAssets`
    // sorts, because with two records sharing a name the newest is the one the
    // out-of-transaction version used to pick.
    //
    // One deliberate difference from that version: it filtered by kind via
    // `listAssets(record.kind)`, and `listAssets(undefined)` returns EVERY asset — so
    // a record with no `kind` used to match by name alone and overwrite a live theme,
    // clobbering its kind on the way. Matching on kind here refuses that. No caller
    // omits `kind` (all six set it from a literal), so this is unreachable today; it
    // is the safer half of an unreachable pair either way.
    const all = assets.getAll();
    all.onsuccess = () => {
      const rows = (all.result || []).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      const existing = rows.find((a) => a.kind === record.kind && a.name === record.name);
      write(existing ? existing.id : newId({ theme: 't', component: 'c', finish: 'f', scene: 's', refdoc: 'd' }[record.kind] || 'a'));
    };
  });
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
