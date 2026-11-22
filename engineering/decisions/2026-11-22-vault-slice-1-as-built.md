---
status: shipped
summary: Slice 1 of local-first storage, as built. The vault interface (list, read, write, move, remove as a tombstone, watch) in docs/src/lib/vault/, with a browser backing (content-addressed blobs in OPFS written by a dedicated worker through createSyncAccessHandle, the index and journal in IndexedDB lattice-vault) and a memory backing; the desktop backing is a typed seam until #2354. Bytes are written before the journal and a startup scan hashes the blob of every path journaled since the last scan against its last journaled sha256, so a crash leaves only an orphan that the scan deletes. Chromium, Linux WebKit and Gecko all take the sync-access-handle path; WebKit refuses OPFS in an ephemeral session, so the vault refuses there with a typed unavailable. No caller moves yet.
---

# Vault, slice 1: as built

**Date:** 2026-11-22 · **Design:** `2026-11-22-local-first-drive-storage.md` §6.2, §6.4, §10 slice 1 (PR #3432)
· **Code:** `docs/src/lib/vault/` (its README is the reference) · **Status:** shipped, unused

This note records what slice 1 built and where it departs from the design's sketch, so the design note can
fold it in once both have merged. The design note is on its own branch; this file stands apart from it so the
two PRs do not stack (HARD RULE #17).

## What shipped

- **The interface** of §6.2, unchanged in shape: `list`, `read`, `write`, `move`, `remove` (a tombstone) and
  `watch`. Two additions the design implies: `write`'s `meta.baseRevision` refuses a write against a stale
  revision (code `conflict`), and an `Entry` carries `revision` next to the design's `{ path, kind, bytes,
  sha256, mtime, id }`.
- **The journal record** is `{ seq, path, id, op, baseRevision, sha256 }`, plus `from` on a move. `seq` is the
  store's own order; `sha256` is null for a remove. `baseRevision` is the revision of the live file the change
  replaced: at `path` for a write or remove (0 when none was live, even over a tombstone), at `from` for a move.
- **Paths** are refused unless every desktop file system can hold them (no `\<>:"|?*`, control characters,
  Windows reserved names, or segments ending in a dot or space). Case-only collisions are not refused yet; the
  desktop host owns that rule (slice 10).
- **Three backings.** Browser: OPFS bytes, written through the dedicated worker `opfs.worker.ts`, and IndexedDB
  `lattice-vault` (`entries`, `journal`, `meta`). Memory: for tests. Desktop: `desktop-seam.js`, a JSDoc-typed
  command list in the platform seam's style that returns null; it imports nothing from #2354.
- **Device id and seq** (§6.4). The device id lives in the index's `meta` store and never in a file, so a backup
  built from `list` and `read` cannot hold it. `nextSeq()` runs under the `lattice-vault:seq` Web Lock. The
  IndexedDB increment is atomic on its own; the lock is for a backing that reads, yields and writes (the
  desktop's JSON index), and the unit test proves it with such a backing.
- **Line endings.** Text crosses the vault boundary through `normalizeSourceText` (LF, no BOM). The vault calls
  the shared helper rather than carrying a fold, so `SANCTIONED_EOL_BOUNDARIES` did not need an entry.

## Where it departs from the sketch, and why

**OPFS holds content-addressed blobs, not the folder tree.** The design's table says "OPFS files" next to the
`Lattice/` layout. The browser vault keeps the folder shape in the index (every record is a path) and stores
bytes in OPFS as `blobs/<2 hex>/<sha256>`. A blob never changes after it is written, which is what makes the
crash rule hold:

1. A write stores its blob, then commits the record and its journal line in ONE IndexedDB transaction.
2. A crash before the commit leaves the old record naming its own untouched blob, plus an orphan.
3. A torn write can only tear a blob no committed record names, because a committed blob is never written over
   (a `put` skips a blob that already holds the right bytes and rewrites only one that does not).

Writing the tree in place would have put a window where the bytes at `Decks/Q3.md` are new or half-written
while the journal still names the old sha256, and no scan can recover the old bytes from that. The tree shape
is the desktop's truth (a person edits the folder), which is why the desktop seam implements the vault itself
rather than a blob store, and writes a temporary sibling and renames it.

**The startup scan** compares each path's blob hash with its last journaled sha256 for every path journaled
since the last scan (a `verifiedSeq` high-water mark in `meta`), so a normal start rereads only new writes. A
mismatch or missing blob marks the record `damaged`: reads refuse it rather than return wrong bytes, and the
next write heals it. Orphans are deleted. Previous versions are not kept: Filo owns versions (§6.1).

**Locks.** Writers hold `lattice-vault` shared from blob to commit; the scan and the blob sweep hold it
exclusive. Without that, a second tab opening mid-write would see the first tab's uncommitted blob as an
orphan and delete it. The cost is that a write that never settles would wedge every tab, so the worker client
fails every pending and later call once its worker errors, sends an unreadable message, or is closed (found by
the maker-checker review, fixed and tested before merge).

**A file-backed read.** `read()` returns OPFS's lazy Blob. Rewriting or removing the path frees the old blob,
and a Blob read after that fails with the engine's NotReadableError. The contract says so; a caller that keeps
bytes (a `<video>` source) copies them or holds the path steady. Slice 2 decides whether a grace window is
worth it once real callers exist.

**No OPFS.** Playwright's default (ephemeral) WebKit context throws UnknownError from
`navigator.storage.getDirectory()`, and the worker's does too, while IndexedDB works; a persistent profile has
OPFS (measured 2026-11-22). A Safari private window may behave the same. `openBrowserVault()` probes first and
throws `VaultError('unavailable')`; the e2e asserts it. Which fallback the Studio uses there is a decision for
slice 2, put to the storage desk.

## Proof

- **Unit** (`docs/src/lib/vault/vault.test.ts`, 55 tests): the contract over memory, memory + IndexedDB, and
  OPFS (each write path) + IndexedDB; the crash window (a commit that never happens; a torn and a missing blob;
  a torn OPFS write on both paths); the scan waiting for an uncommitted write; seq uniqueness over a yielding
  backing; the worker client (answers by id, fails pending and later calls after an error or a close, frees the
  lock); a seeded model test (seeds 1, 7, 42, 2026; 120 steps each, with restarts) against a plain map.
- **e2e** (`docs/e2e/vault.spec.ts` on `desktop`, `webkit-phone`, `gecko`, each test in its own persistent
  profile): write a deck, a 1 MB file and 100 small files, reload, read them back; every blob write took
  `sync-access-handle` on all three engines; move and remove survive a reload; a write in one tab reaches
  another; in an ephemeral session WebKit's vault refuses with `unavailable` and the other engines open.
- **UNVERIFIED:** iOS Safari. `webkit-phone` is Linux WebKit.
- **Speed:** not claimed. No bench row, because the slice makes no speed claim (HARD RULE #19); slice 2's
  storage bench measures the vault when assets move into it.

## Left for later slices

Journal compaction and trimming policy (slice 6 drains it; `trimJournal` past the last scan skips re-hashing,
so the engine calls `recover()` first); the per-deck Yjs update files themselves (slice 3); quota handling and
a full-disk notice (slice 3); the no-OPFS fallback and a read grace window, if wanted (slice 2); case-only path
collisions and the desktop host (slice 10).
