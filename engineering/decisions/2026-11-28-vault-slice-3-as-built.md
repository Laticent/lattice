---
status: shipped
summary: Slice 3 of local-first storage, as built. Deck text moves from localStorage into the storage vault in its final form, Decks/<id>.md plus per-deck Yjs files (a base, per-device update files at most one a minute, a per-tab pending file and a head stamp), so sync needs no second migration. Every deck read stays synchronous through an in-memory shelf; a vault deck the tab has not read yet reads as null and its save is refused, so a save before hydration never shrinks a deck. The move reuses slice 2's lock and rewrites its one backup in place through a checked temp file. DECK_DIRECTION local is the move-back. Saves merge three-way, so a stale tab keeps newer text, and a full disk shows the deck-save notice.
---

# Vault slice 3, as built: decks in the storage vault

**Date:** 2026-11-28 · **Design:** `2026-11-22-local-first-drive-storage.md` §6.4, §8, §10 (slice 3) · **Before it:**
`2026-11-27-vault-slice-2-as-built.md` · **Tracking:** #3581

Deck text leaves localStorage for the storage vault, in its final form: the readable Markdown copy plus the Yjs files
§6.4 describes, so sync (slice 6) needs no second migration. localStorage keeps only caches that the vault rebuilds.
The move also ends the silent quota failure: localStorage holds about 5 MB per origin, so decks used to stop saving
long before the disk was full. The vault uses the origin's real quota, and a refused vault write shows the deck-save
notice.

## What shipped

1. **The deck doc** (`docs/src/lib/vault/deck-doc.ts`). This is pure Yjs code with no storage of its own. Each rule
   rests on a spike #3443 finding, and the tests reproduce that finding with a printed seed:
   - **Three-way saves (finding 3).** A tab's save merges against the text that tab last had, never against the doc's
     current text.
   - **Updates that cannot apply (2b-ii).** An update made against history the doc lacks would sit silently in
     `pendingStructs`. The loader checks `pendingStructs` and `pendingDs` after every apply, sets such an update
     aside, and rebuilds the doc without it.
   - **Outside edits (2c-iii).** An edit made outside Lattice is adopted on a fork at the chained base, as a synthetic
     client named by the edit. The test also runs the live-doc version as a control, and the control diverges.
   - **Client ids (2d).** Each device and Web Lock slot gets one stable 30-bit client id.
2. **The deck engine** (`docs/src/components/studio/deck-vault.ts`). It writes each deck's files:

   | Path | What it holds |
   |---|---|
   | `Decks/<id>.md` | The readable copy: the merged doc's text, LF, no BOM |
   | `.lattice/decks/<id>/base-<sha256>.yjs` | The doc the move started from |
   | `.lattice/decks/<id>/updates/<device>-<seq>.yjsu` | One device's edits, at most one file a minute; `seq` comes from the vault's locked counter |
   | `.lattice/decks/<id>/pending/<device>-<slot>.yjsu` | This tab's edits since its last update file, rewritten on every save. Local only |
   | `.lattice/decks/<id>/head.json` | The stamp: deck.md's SHA-256 and the doc snapshot it was written from |

   A save takes the deck's Web Lock. It applies every file another tab wrote, merges, then writes the pending file,
   then deck.md, then the stamp. A tab that takes a slot first turns the slot's leftover pending files into update
   files, so a closed tab loses nothing.
3. **The shelf.** Its synchronous half and the guard are in `studio-store.ts`. The vault side is in
   `deck-shelf-io.ts` (hydration, each deck's ordered write queue, the move's hand-overs), and the shell's side is in
   `deck-shelf-shell.ts`. Both of those load on first use, to keep the Studio's eager bundle small. Every deck read
   stays synchronous, and vault decks live in memory:
   - **The boot deck** comes from `lattice-studio-boot-src` before the first paint (at most 512 KB, storage desk D3).
   - **Every other deck** loads when `decksReady()` reads the vault, just after the first paint.
   - **The index** carries a `vault` mark per deck, and the vault rebuilds the marks, the list titles and the boot cache
     (design §8).
4. **The move** (`deck-vault-move.ts`). At the first idle moment after slice 2's photo move, and under the same lock,
   each deck still in its key moves into the vault. The move reads the deck back, compares it with the key's text,
   then drops the key in one synchronous step if nothing saved to the key in between. A key always wins a read until
   that step, so a dead move leaves the deck where it was.
5. **Another tab's edit to the open deck** arrives as one undo step ("Changes from another tab") when the editor still
   shows the text it was merged from. If the person typed since, the shell saves at once, and the merge comes back
   with their typing folded in.

## The guard: a save before the shelf has the deck (storage desk must-fix)

Before `decksReady()` has read the vault, a vault deck the boot cache does not cover reads as null. **`saveSource`
refuses that deck.** The refusal happens before anything is queued, so it never reaches the vault and cannot write a
canonical or empty text over the real deck. The failing arm: drop the guard and
`deck-vault.test.ts` "is refused and never shrinks the stored deck" goes red.

These callers wait for the shelf: the shell's deck switch (`loadDeck`), `packWorkspace`, the restore, and the boot
deck itself when it was too big to cache. These callers read synchronously and may see null for the moment before
hydration, which is harmless because a save from them is refused:
- `Library.tsx`: the other decks' sources, and the asset-rename rewrite. It is slice 4's file and was left untouched.
- `GeminiVoicePanel.tsx`: the active deck, which is always loaded.
- `StudioShell.tsx`: `deckSourceFor` on a deck delete, and the share import. Both run on a person's action, after
  hydration in practice.

## Storage desk D1: the one backup, refreshed

Slice 2 wrote ONE backup, `.lattice/backups/before-vault.zip`, and it holds the decks as they were when the photos
moved. Before the first deck moves, the deck move rewrites that same file with today's workspace. `packWorkspace`
reads photos from the vault, so the new zip holds everything the old one did. Each of the desk's three conditions has
a test:
- **Temp file first.** The zip is written to `before-vault.zip.tmp`, read back and checked by SHA-256, copied over the
  backup, read back and checked again, and the temp file is removed. A vault write replaces a file only once its new
  bytes are stored, so the device is never left with no backup or a half-written one.
- **A failed rewrite stops the move.** Whether the pack fails or the vault stores a torn copy, the old zip stays and
  every deck stays in its key.
- **A deleted backup stays deleted.** If the person deleted slice 2's backup, no new one is written.

`lattice-deck-move-backed-up` marks the device once the rewrite has happened. The test "the rewritten zip still holds
a photo slice 2 moved into the vault" runs the real `packWorkspace`.

### A closed page is not a dead move (found by the bench, 2026-11-28)

The move counts each start it has not finished (`lattice-deck-move-attempt`) and stops for good after three
(`MAX_DEAD_ATTEMPTS`), so a pack that runs out of memory does not pack the whole workspace on every start (C5). The
refresh packs every photo too, so with a big library it takes seconds. On the real build, `storage-bench`
`everything` (40 decks, 58 MB of photos, CPU ×4) reloaded inside that window, counted three deaths and kept all 40
decks in localStorage for good.

Now a page that closes while a move runs (`pagehide`: a reload, a closed tab) puts the count back, in both moves
(`forgiveAttemptOnLeave`, `media-vault-move.ts`). A crash or an out-of-memory kill fires no `pagehide`, so it still
counts. Measured on the same run: after 8 short visits the count is 1, and the decks move the first time the page
stays up for about 20 s. The price: until the move lands, every start packs the backup again. In the bench's loop
(a reload every 7 s at CPU ×4) that adds about 0.4 s to `everything`'s median first slide. A device where slice 2's
photo move already gave up under the old rule is cleared once (`lattice-media-move-attempt-reset`): it gets one fresh
set of attempts, and a move that really crashes stops after three more, as before. The deck move is new in this
release, so no device has an old deck count to clear.

What the cap no longer catches: a pack that is slow but never crashes, on a device where the person always leaves
before it ends, now packs again on every start with no cap (the deck move has no size gate like the media move's
`MAX_MOVE_BYTES`). And some leaves still count as deaths: an OS that kills a background tab (iOS Safari, an Android
discard) fires no `pagehide`. A page restored from the back-forward cache keeps the handed-back count for the rest of
that attempt.

## Where it departs from the design, and why

- **Paths are ids** (`Decks/<id>.md`), as slice 2's media are (storage desk D2). The design's human names arrive with
  sync, as an index-only move.
- **A pending file per tab.** §6.4 allows at most one update file a minute, but a tab can close between two of them.
  The pending file holds those edits under the tab's real client id, so there is no re-adoption and no duplicated
  text.
- **No base for a new deck.** Its first update holds the whole text. Compaction, and the lease that elects who
  compacts, stay in slice 6. Until then a deck's update files grow by at most one a minute of editing.
- **A boot cache newer than the vault** means a save the tab could not finish. The cache records which vault text it
  came from: when the vault still holds that text, the cached text is saved again; otherwise another tab saved later,
  and the vault wins.
- **Outside-edit adoption runs only on open** (a deck.md that differs from the doc and from its stamp). Walking Drive
  revisions is slice 6's work.

## Undo: the move-back

The design is the same as slice 2's (§8, "Undo is a move-back"):
- **The setting.** `DECK_DIRECTION` in `studio-store.ts` ships as `'vault'`. Set to `'local'`, the Studio saves decks
  in localStorage again, and `moveDecksOutOfVault()` moves each vault deck back at boot.
- **Per deck.** It writes the key, reads it back, then removes the deck's vault files. A deck whose key cannot be
  written (a full localStorage) stays in the vault and stays readable. The count of such decks is kept in
  `lattice-deck-move-back-left`.
- **Per browser.** `lattice-deck-storage: local` in localStorage turns the way back on for one browser, for support
  and for the e2e.
- **Undoing the slice is two releases:** the `'local'` release, then the code revert. The revert keeps the shelf's
  vault reader (`decksReady`, `deck-vault.ts` `readAll` and `readDeck`) for one more release, for devices that never
  opened the Studio during the `'local'` release.

**Two known edges, each no worse than main.** main keeps a deck in one localStorage key, and no tab hears another
tab's deck save, so the last save wins.
- **A tab still running pre-slice-3 code** writes a deck's old key after the move. That key wins the next read, and
  the next move takes it in as a replacing save. This is main's last-save-wins. Driven: `deck-vault.spec.ts` "a
  pre-slice-3 tab that writes the old key" on Chromium, Linux WebKit and Gecko, and its unit twin, which goes red
  if the vault's text wins the read or the move skips the key.
- **One boot cache per origin (2b).** A save that a reload cut off survives in the boot cache. But if another tab
  saves the same deck before this tab reopens, the cache's base no longer matches and the other tab's text wins
  ("lets the vault win when another tab saved after the cache's base"). On main, tab B's save replaces tab A's
  edit even when A's save was NOT cut off ("on main's storage, tab B's later save replaces tab A's edit"), and in
  the vault the same two saves merge. So the vault loses that edit only when the save was cut off and another tab
  saves first; main lost it whenever another tab saved later.

## Proof

- **Unit tests.** `deck-doc.test.ts` has 11 tests, seed 20261128 (`DECK_DOC_SEED` reruns one):
  - stale-tab saves: 300 trials, 0 newer edits lost, 0 of the stale tab's own edits lost; the naive control lost more
    than half;
  - outside-edit adoption: 200 trials, 0 divergence on the fork; the live-doc control diverges;
  - a seeded many-tab convergence run.

  `deck-vault.test.ts` has 35 tests: the move, the guard, D1, a closed page during the move, saving, the pending
  file, outside edits, a full disk, the cut-off save, and the move-back. The full docs unit suite is green.
- **e2e.** `docs/e2e/deck-vault.spec.ts` has 5 tests × `desktop` (Chromium), `webkit-phone` (persistent profile) and
  `gecko` = 15 of 15 green. Each test uses a persistent profile, and each wait is on a signal; the vault holding the
  text is read from the index record's SHA-256.
- **The full disk** is REAL on Chromium (`Storage.overrideQuotaForOrigin`) and **INJECTED** on WebKit and Firefox.
  Firefox keeps a 10 GiB quota whatever `dom.quotaManager.temporaryStorage.fixedLimit` says (measured on three
  profiles), and Playwright offers WebKit no quota control.
- **iOS Safari: UNVERIFIED.** `webkit-phone` is Linux WebKit, not iOS. No macOS dispatch was made.
