---
status: shipped
summary: Slice 2 of local-first storage, as built. Where OPFS is refused the browser vault keeps its bytes in IndexedDB lattice-vault-blobs (decision D1, option B), and records which blob store it chose so a passing OPFS refusal never opens a vault on empty blobs. Library photos and videos are the vault's first caller - new saves write their bytes to Library/Images or Library/Videos as <id>.<ext> and keep only metadata in the Workbench row - and photos saved before slice 2 move once at the first idle moment after boot, behind one automatic workspace backup that Privacy & Data shows with a download and a delete. The adversarial trio removed a startup sweep that would have deleted synced files, made the move check the bytes it reads back, and added a crash-loop guard and a size cap. 50 photos (48.7 MB) move in 4.6 s off the boot path; boot is unchanged, opening the Library and Download backup cost 30 to 80 ms more. Reference PDFs, themes and narration audio stay where they are (followups.d/3148-p2).
---

# Vault, slice 2: as built

**Date:** 2026-11-27 · **Design:** `2026-11-22-local-first-drive-storage.md` §6.2, §8, §10 slice 2 · **Slice 1:**
`2026-11-22-vault-slice-1-as-built.md` (#3442) · **Code:** `docs/src/lib/vault/` (its README is the reference),
`docs/src/components/studio/media-vault.ts`, `media-vault-move.ts` · **Status:** shipped

This note records what slice 2 built, where it departs from the design, and what it left for later.

## What shipped

1. **The IndexedDB blob store** (`idb-blobs.ts`), the owner's D1 answer (option B on #3442). Where OPFS is
   refused, the vault keeps the same interface and stores each blob as one row of its own database,
   `lattice-vault-blobs`, keyed by its SHA-256. The index stays in `lattice-vault` at schema version 1. The
   crash rule is the same as OPFS's: blob first, then the index, and the startup scan sweeps an orphan row.
2. **The first caller: Library photos and videos.** `saveMedia` writes the bytes to the vault, then writes the
   Workbench row with `vault` (the file's path), `vaultId` (the vault entry's stable id) and no `blob` or
   `data`. Every reader gets a `blob` back
   through `hydrate`, so no caller outside `media-store.ts`, `media-edit.ts` and `asset-store.js`
   `deleteAsset` changed.
3. **The one move** (`media-vault-move.ts`, design §8, owner ruling 4). At the first idle moment after
   boot, the Studio looks for photo rows that still hold their own bytes. If there are any, it writes one
   workspace backup, then moves each photo.
4. **The backup is reachable.** Privacy & Data shows a "Backup from the storage move" row with its size, a
   download and a delete, only while the backup exists. Clear everything deletes it too.

## Where it departs from the design, and why

**The blob store is chosen once and kept.** `openBrowserVault()` records `blobBacking` (`opfs` or
`indexeddb`) in the index's `meta` on its first open, and every later open uses that store. Falling back on
each open would lose data. Suppose OPFS is refused once on a normal profile, by a storage hiccup or a private
window over the same index. The vault would then open an empty blob store, and the startup scan would mark
every file `damaged`. So a vault that chose OPFS and finds it refused throws `unavailable`, and one that
chose IndexedDB stays there even once OPFS works. A slice-1 vault recorded nothing; one with a journal
counts as `opfs`.

**A Blob first, an ArrayBuffer where the engine refuses one.** Safari in a private window refuses to store
a Blob in IndexedDB and stores an ArrayBuffer fine. `media-store.ts` reproduced that on real WebKit, and
Playwright's ephemeral WebKit context does the same, as the Studio e2e found while seeding a pre-slice-2 row.
The blob store tries a Blob, falls back once, and then stores buffers only.

**Media paths are the record's id, not its name.** §6.1 gives files human names. A photo's name changes,
because a rename keeps the old name as an alias, and its scope flips. Neither of those should move bytes. So
the file is `Library/Images/<id>.<ext>` (or `Library/Videos/`). A vault move rewrites only the index, because
blobs are content-addressed, so slice 6 can give the files human names when sync makes the folder visible
without moving a byte. Deck-scoped photos stay under `Library/` until decks are in the vault (slice 3).

**The backup lives in the vault, and the Studio shows it.** §8 says the move writes "one automatic workspace
backup zip (the same zip Download backup makes)" and that "Restore puts it back", but not where the zip goes.
A download on boot would surprise people and prompt on a phone. A zip kept where nobody can reach it is not a
safety net, and it would use storage the Privacy & Data panel does not show. So the zip is
`.lattice/backups/before-vault.zip` in the vault, and the panel lists it with its size, a download and a
delete.

**No "done" flag.** Every step of the move can be rerun, so it keeps no flag that could be lost. Each start
looks for rows that still hold their bytes. Once there are none, the move costs one read of the media rows.
Two small localStorage marks are guards, never state: a count of attempts that never finished (three in a row
and this device stops trying, so an out-of-memory kill cannot loop on every start) and a once-per-device mark
for the backup (deleting the backup never makes a later run pack the whole workspace again).

**Rows keep the vault entry's id beside its path.** The inversion review showed that a path-only pointer turns
every later rename (human names in slice 6, deck folders in slice 3, a rename from Drive) into a rewrite of
every media row across two databases with no shared transaction. `vaultId` lets those slices resolve a row by
id; today's readers still use the path.

**`.lattice/backups/` is local-only.** The backup holds a copy of every deck and photo. Sync (slice 6) must
not carry it to Drive or to other devices; the vault README records that as a contract.

**No read grace window** (slice 1 left it open). A media file is never rewritten in place, because replacing
a photo makes a new record. So the only way to invalidate a file-backed read is to delete the photo, and a
deleted photo is not on the shelf.

## Undo: the move-back

A code revert alone would strand every moved photo: its row names a vault path the old code cannot read. So this slice
also ships the way back (owner's answer on #3582, 2026-11-27, chosen over keeping each row's bytes until slice 3, which
would have doubled photo storage and reversed design §8).

- **`MEDIA_DIRECTION`** in `media-vault.ts`, `'vault'` as shipped. Set to `'rows'`, the Studio saves new photos in
  their rows as before this slice, and at boot `settleMediaStorage()` runs `moveMediaOutOfVault()` instead of the move.
- **The move-back**, per photo: read the vault file, check its size against the row's `bytes` and its SHA-256 against
  the vault's record, write the bytes back into the row (a Blob, or an ArrayBuffer where the engine refuses one, the
  two shapes the old save wrote), then remove the file. The row is written before the file goes, so a tab that dies in
  between leaves a file no row names, never a row without bytes. A file that does not check out stays, and its row
  keeps naming it. Rerunning is safe.
- **Undoing the slice** is two releases: one with `MEDIA_DIRECTION = 'rows'`, then the code revert, **keeping the
  vault reader** (`media-vault.ts` `studioVault` and `vaultBlob`, media-store `hydrate`'s vault branch) for one more
  release. No count of finished devices reaches us, and a device that never opened the Studio during the `'rows'`
  release still has vault rows. On the pre-slice-2 code one such row breaks every deck's `asset:` photos, because
  `refreshAssetUrls` throws on a row with no blob (the move-back checker's finding). Each device records what it left
  behind in `lattice-media-move-back-left` and logs a warning while the count is not 0. A file that cannot come back
  (damaged, or no room for its row) stays readable through the kept reader. `lattice-media-storage: rows` in localStorage turns the way back on for one browser, for
  support and for the e2e that proves it.

## The move, step by step

| Step | What it does | If the tab dies here |
|---|---|---|
| Backup | `packWorkspace` → `vault.write(BACKUP_PATH)`, once | Nothing has moved; the next start backs up again |
| Each photo | Write the bytes, check the vault's size and SHA-256 against the row's bytes, then swap the row to `vault` in a transaction that rereads it first | A file no row names: the sweep deletes it |

If the backup cannot be built or stored (no room, no memory), or the photos come to more than
`MAX_MOVE_BYTES` (512 MB, below the 1 GB a restore takes back), the move stops and every photo stays where it
is and still reads. If a row was deleted or replaced while the move ran, the move leaves it alone and removes
the file it wrote; if another tab already moved it to the same file (possible only without Web Locks), the
file is left in place.

**The check reads back.** After each write the move reads the file from the vault and hashes what is stored.
The entry's own `sha256` is computed from the input before it is stored, so comparing against it proved
nothing (the red team demonstrated a torn store that passed).

**No sweep.** An earlier draft deleted, on every start, any media file whose id had no row. The inversion
review killed it: once sync pulls another device's photos (slice 6) and the desktop shows the folder to a
person (slice 10), files with no local row are normal. A save that dies between its file and its row now
leaks that file, and Clear Library and Delete everything empty the media folders whole. `deleteAsset` reads
and deletes a row in one transaction, so it cannot miss a swap that lands between the two.

**Locks.** `lattice-media-move` is held exclusive by the move and by deleting the backup, so a Delete
everything during a move waits for it and then deletes the backup it wrote. Without Web Locks the vault's
in-tab lock stands in.

## Proof

- **Unit:** `docs/src/lib/vault/vault.test.ts` (71) runs the vault contract over the IndexedDB blob store too.
  It also covers the Blob refusal, falling back to buffers after one refusal; the recorded choice; the
  refusal of a vault that chose OPFS; and the slice-1 rule. `media-vault.test.ts`
  (14, next to `media-store.ts`) covers a new photo's row shape and `vaultId`, edits that never touch the file,
  a refused save and a delete leaving no file, a vault file that cannot be read being named unreadable in a
  backup, and the move: Blob and buffer rows, one backup per device, a second run that changes nothing, a
  failed backup that moves nothing, a torn store caught by reading back, the attempt guard and the size cap, a
  backup delete waiting for a move, Clear Library emptying the folders, a file no row names left alone, and a
  row deleted mid-move.
  `media-store.test.ts` keeps the no-vault path, with the vault pinned off.
- **Failing arms**, each red, then restored byte for byte: dropping the vault removal in `deleteAsset`; the
  slice-1 rule; the unreadable check in `packMedia`; the read-back check; the lock on deleting the backup; the
  attempt guard's threshold; the once-per-device mark; `clearMediaFolders`; and, in the browser, dropping the
  boot-time move and the IndexedDB fallback.
- **e2e** on `desktop`, `mobile`, `webkit-phone`, `webkit-tablet` and `gecko`:
  - `vault.spec.ts`: in an ephemeral session WebKit's vault now opens on IndexedDB blobs and round-trips a
    deck and a 1 MB file through a reload; the other engines keep OPFS.
  - `library-images-durability.spec.ts`: a new photo's row names its vault file and holds no bytes, and the
    card decodes after a reload. A row seeded the pre-slice-2 way (a Blob, or a buffer on WebKit) moves after
    a reload, its card decodes, and Privacy & Data downloads the backup as a workspace zip that carries the
    photo. The existing backup, restore, storage-line and delete-deck tests pass on the new shape.
  - Repeat-green: 30/30 (`webkit-tablet` and `webkit-phone`, `--repeat-each=10`, one worker).
  - Load-green: 15/15 (`desktop`, `--workers=4 --repeat-each=5`).
- **Bench:** the 2026-11-11 `storage-bench.cjs` gained a `photos50` scenario and `MEASURE=open,export`.
  Chromium, unthrottled, 5 reloads per run, 3 runs per build, same machine:

  | 50 photos, 48.7 MB | before (main) | after |
  |---|---|---|
  | Boot to first slide, median | 1124–1137 ms | 1104–1109 ms |
  | Open the Library until 12 cards decode | 186–246 ms | 219–274 ms |
  | Download backup | 617–660 ms | 653–739 ms |
  | The one move, from the first reload | — | 4.58–4.64 s, off the boot path; long tasks unchanged |

  The move adds one workspace backup (about the size of the photos) until the person deletes it.
- **Move-back:** unit (5 in `media-vault.test.ts`: Blob and buffer rows back with the same bytes, files removed,
  idempotent; an engine that refuses a Blob; a file that does not check out stays and is counted; a video, a deck-scoped
  photo and a row without `bytes`; the way back at boot and in a new save), each with a failing arm. A maker-checker
  review of the move-back code found the reader rule above, the uncounted failures and the `bytes` check; all fixed. e2e `library-images-durability.spec.ts` "the move-back puts a vault photo back in
  its row": 4/4 on desktop, mobile, webkit-tablet and gecko; 10/10 alone and 5/5 under four workers on desktop, gecko
  and webkit-tablet; red when boot ignores the direction.
- **Review:** the adversarial trio (red team, Munger inversion, independent checker) ran on the diff; every
  finding that changed code is named where it landed. Not changed: a tab left open from before the deploy
  reads a moved photo as having no bytes (deploy skew, which ends at its next reload); AVIF and HEIC are
  missing from the backup's extension table, which predates this slice.
- **iOS Simulator** (warm harness on #3582, the owner's two dispatches):
  - `PROBE=vault` passed on iPhone and iPad at `6b1f8b6` and again at `a6dad85`: 22/22 blob writes through the sync
    handle, a reload, and a startup scan that verified 22/22 with nothing damaged.
  - `PROBE=media-vault` (`docs/scripts/ios-safari/media-vault-probe.js`) drives the Studio's own move and move-back.
    It passed every step on an iPhone (402 px) and an iPad (1032 px), Safari 26.5, at `a6dad85` (harness run
    46087018694, PR comment 7231485707, artifact `harness-macos-26`). Steps:
    - two photos are planted as Blobs the pre-slice-2 way;
    - after a reload, both are in the vault (OPFS) with the recorded SHA-256, both decode at their size, and the
      backup is written first;
    - after a second reload on the way back, both rows hold the same bytes as Blobs and decode, the vault files are
      gone, and the device records 0 left behind.
    - The Playwright self-test passes the same probe on WebKit's IndexedDB-blob path, and fails it when the build
      ignores the direction.
- **iOS eviction** with photos in the vault on a real, full device: UNVERIFIED. No runner here can reach it; it is the
  devices desk's (`followups.d/3148-p2`).
- **Reference PDFs, themes and other asset kinds, and narration audio** into the vault: `followups.d/3148-p2`,
  `deferred: large`. Each has its own store, its own writers and its own move. Together they would have taken
  this PR past the 1.5k lines the command center set.
- **Human file names** for media, when sync makes the folder visible (slice 6). Deck-scoped photos move
  under `Decks/` once decks are in the vault (slice 3).
- **iOS eviction** on a real iPhone, with a vault holding photos: the devices desk.
