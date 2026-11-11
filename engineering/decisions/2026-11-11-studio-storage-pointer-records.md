---
status: proposed
summary: >
  Why a Studio reload slows down as a profile fills up, measured, and the storage design that fixes it. The cause is
  version history: opening any deck reads every saved version of every deck from IndexedDB (`hydrateCheckpoints`
  `getAll()`), and each version is a full copy of the deck, so a phone-speed boot with 40 decks went from 2.5 s to
  3.5 s to the first slide and +80 MB of memory. Photos (Blobs) and deck text in localStorage cost nothing measurable.
  The design: every stored deck and version becomes a small METADATA record that holds a POINTER to its text; texts
  live in a separate store, keyed by their SHA-256, so identical texts are stored once; decks, versions and texts share
  one IndexedDB database so one transaction can keep a record and its text in step. Boot reads metadata plus one text.
  localStorage keeps only what must be synchronous: the open deck's latest text (the `pagehide` save) and the small
  mirror the pre-paint shell reads. Bulk scans run in a worker; the boot read and the `pagehide` save stay on the main
  thread. No IndexedDB library (`idb` is 1.4 KB gzip and changes no speed); no diff format for versions (Filo slice 6
  turns versions into marks). Ships in two PRs: versions first, then decks. Also records a live defect: `saveSource`
  swallows a full-quota error, so deck edits can be lost without a word.
---

# Studio storage: metadata records with a pointer to their text

**Date:** 2026-11-11 · **Status:** PROPOSED (design; nothing built)
**Trigger:** the owner: "when there is lots of stuff in IndexedDB and the cache, load time slows down; with private
browsing it's snappy. Audit and measure. Are we storing things efficiently?" Then, over the same conversation: should
we use `idb`; should versions be diffs; should decks move out of localStorage as metadata plus content; and what should
leave the main thread. The owner proposed the pattern this note adopts: "metadata plus a pointer to a location in the
same record."

Builds on `2026-07-21-storage-accumulation-diagnostic.md` (the localStorage half of the same symptom, fixed in #1930)
and `2026-10-27-filo-undo-history.md` (slice 0 moved versions into IndexedDB; slice 6 turns them into marks).

## 1. The answer

Accumulated storage does slow a reload, and one store is responsible: **version history**. Opening any deck calls
`readCheckpoints`, which starts `hydrateCheckpoints()` (`docs/src/components/studio/checkpoint-store.ts:476`). That
runs `getAll()` on the whole versions database, so every saved version of every deck is deserialized into memory before
the first slide. Each version is a full copy of its deck, up to 25 per deck (`SNAP_CAP`). The cost grows with
decks x versions, which is the "slower over time" the owner saw. A private window starts with an empty database and
never pays it.

## 2. Measurements

Chromium (Playwright's bundled build) against the built Studio (`npm run build:e2e`, served by `npm run preview:e2e`),
1440x900. Each scenario gets a fresh browser context: visit once so the app creates its databases, seed, reload once
to warm the service worker and HTTP cache, then time N reloads from navigation to the first slide root painted with
content inside the live preview. "Blocked" is the sum of main-thread long tasks (over 50 ms) up to that paint. Decks
are `test/integration/baseline-decks/gallery.md` (60 KB). Photos are 1600x1200 noisy JPEGs (about 1 MB each), stored
the way `media-store.ts` stores them. The script is `2026-11-11-studio-storage-pointer-records/storage-bench.cjs`.

**4x CPU throttle (phone-like), 5 reloads, medians:**

| Stored | Origin usage | First slide | Blocked | JS heap |
|---|---|---|---|---|
| Nothing (as private browsing) | ~4 MB | 2,538 ms | 960 ms | 97 MB |
| 40 decks in localStorage | 4.8 MB in localStorage | 2,267 ms | 883 ms | 97 MB |
| **40 decks + 25 versions each** | 41 MB | **3,548 ms** | **1,225 ms** | **177 MB** |
| 60 photos | 67 MB | 2,470 ms | 896 ms | 64 MB |
| All of the above + 60 chat messages per deck | 109 MB | 2,892 ms | 1,378 ms | 212 MB |

**No throttle, 7 reloads, medians:** first slide 1,020 / 989 / 1,045 / 975 / 1,078 ms in the same order; blocked
65 / 73 / 255 / 74 / 212 ms. On a fast desktop the paint barely moves but the page stays busy longer.

Reading the table:

- **Versions are the cost.** Rows 2 and 3 differ only in the versions. The +80 MB of heap matches the 60 MB of version
  text seeded (40 x 25 x 60 KB), held in memory as the cache.
- **Photos are free at boot.** A Blob read from IndexedDB is a handle; its bytes are read only when something uses
  them. 58 MB of photos changed nothing.
- **Deck text in localStorage is free at this size,** up to 7.8 MB with chats. Its problem is space (§3), not speed.
- **Run-to-run spread is wide under throttle** (row 3: 2,820 to 5,018 ms). The medians are the claim; the direction
  held in both the throttled and the unthrottled run.

**Not measured:** Filo's undo history (seeding a realistic history synthetically is awkward; it reads only the open
deck, by design); the service worker cache (held warm and equal across scenarios, not varied; #1930 already made its
`put()` cheaper); WebKit and Firefox; a real phone. The PRs below re-run this script before and after (HARD RULE #19)
and add WebKit.

## 3. What is stored where today

| Data | Where | Shape | Read at boot |
|---|---|---|---|
| Deck list | localStorage `lattice-studio-deck-index` | `[{id, title, derived?, builtin?}]` | Yes, and by the pre-paint shell |
| Deck text | localStorage `lattice-studio-src-<id>` | Whole text, JSON string | Open deck, and by the pre-paint shell |
| Versions | IndexedDB `lattice-studio-versions` / `checkpoints` | `{deckId, id, ts, label, source}`, full text each | **Every deck's, every version** |
| Undo history | IndexedDB `lattice-filo` | Snapshot of patches per deck, 50 MB budget | Open deck only |
| Photos, videos, themes, reference PDFs | IndexedDB `lattice-workbench` / `assets` | Record with a Blob | Only by kind, when needed |
| Chats, drafts, comments, settings | localStorage | JSON per deck / per setting | Settings yes |
| Narration audio | IndexedDB (`narration-store.js`) | Blob + metadata store | No |

**localStorage is full sooner than it looks.** Chromium and Firefox allow about 5.2 M characters per origin; WebKit
holds half that once a string has any non-Latin-1 character (`2026-10-27-filo-undo-history.md` §1 #6, measured).
Every deck, chat and setting shares it. In Safari and in the Tauri app's WebKit webview, a few dozen gallery-size decks
fill it.

**A live defect follows from that.** `saveSource` (`studio-store.ts:350`) calls `write()`, which catches the
`QuotaExceededError` and returns `false`; `saveSource` ignores the result. When localStorage is full, a deck edit is
not saved and nothing tells the author. Versions had the same silent-loss bug until slice 0 moved them to IndexedDB
and reported the failure (`StudioShell.tsx:5584`). §8 handles it.

## 4. The design: a metadata record that points at its text

```
database lattice-studio (one IndexedDB database, one upgrade handler)

  decks     { id, title, derived, size, slides, bytes, updatedAt,
              body: { where: 'idb', key: 'sha256:9f2c...' } }
  versions  { deckId, id, ts, label, slides, bytes,
              body: { where: 'idb', key: 'sha256:41ab...' } }        keyPath [deckId, id]
  bodies    { key: 'sha256:9f2c...', text: '---\ntheme: ...' }        keyPath key
```

What each part buys:

- **Listing reads metadata only.** The deck switcher and the version list read small records. A text is read when a
  deck opens or a version is restored or previewed. The version list today shows each version's slide count by
  parsing its full text (`metaFor(cp.source)`, `StudioShell.tsx:8613`); `slides` is computed once at save and stored.
- **`where` makes the location swappable.** `'idb'` now. The Tauri app can implement the same interface with real
  `.md` files on disk (`where: 'file'`), and OPFS stays available if a case for it appears. The Studio follows the
  pointer and does not care where it leads.
- **A content hash as the key stores identical texts once.** An unchanged version, a restored version, a duplicated
  deck and a deck at the same text as its latest version all point at one body. Restoring a version moves a pointer.
  SHA-256 through `crypto.subtle`, not Filo's existing 32-bit sum (`saveSourceSum`), because two texts sharing a key
  would silently swap one deck's content for another's.
- **One database, so one transaction.** A record and its body are written in the same `readwrite` transaction over
  `decks`/`versions` + `bodies`; neither can exist without the other. The body `put` is unconditional (same key, same
  text: idempotent), so a writer never skips it on the belief that it is already there.
- **Text stays a string, not a Blob.** A Blob pays off when a listing should not read the bytes, as with photos. Here
  the listing already avoids the bodies store, and a deck is always read whole when opened.

**Why not OPFS for the text.** OPFS (the Origin Private File System) suits large binary data and SQLite. Its files
cannot share a transaction with an IndexedDB record, so a crash between the two writes leaves them out of step, and
its synchronous API exists only in workers. For 60 KB texts, IndexedDB gives the same capacity with transactions.

### 4.1 Cleanup of unreferenced bodies

With shared bodies, deleting a deck or a version cannot delete its body; another record may point at it. An idle-time
sweep removes bodies no record references. It runs as **one `readwrite` transaction over `decks`, `versions` and
`bodies`**, so it cannot interleave with a save in another tab: IndexedDB runs read-write transactions with
overlapping scope one at a time, in creation order. A save that commits first is seen by the sweep; a save that starts
after re-writes its body (the unconditional `put`). The sweep never runs at boot.

### 4.2 What stays in localStorage, and why

Two readers need deck data **synchronously**, and only localStorage is synchronous on the main thread:

1. **The `pagehide` save.** The Studio writes the open deck in one synchronous call when the tab hides, so the last
   keystrokes survive an iOS tab kill (`StudioShell.tsx` flush, and Filo's sidecar in
   `2026-10-27-filo-undo-history.md` §5). An IndexedDB write started on `pagehide` may never finish.
2. **The pre-paint shell.** An inline script in `docs/src/pages/studio.astro:603-630` reads the active deck id, its
   title from the deck list, and its text (for `size:`) before the app loads, to paint the frame at the right size
   with the right name.

So localStorage keeps a **boot record**: `{ deckId, title, size, text }` for the open deck only, written by the
`pagehide` save and on the debounced save as now. IndexedDB is the source of truth; on open, the Studio compares the
boot record's text against the deck's body and adopts the boot record when they differ and it is newer (the same
three-way reasoning Filo's sidecar already does). localStorage then holds one deck's text instead of every deck's.

### 4.3 Library: none

Six modules hand-roll IndexedDB today (Filo, versions, the asset library, narration, `secret-box`,
`openrouter-key`). Measured bundle cost of the candidates (esbuild, minified, gzip -9, main entry):

| Library | What it is | gzip |
|---|---|---|
| `idb-keyval` | get/set on one key-value store | 0.36 KB |
| `idb` | Promise wrapper with typed schemas | 1.4 KB |
| `localforage` | localStorage-style API with old-browser fallbacks; last release 2022 | 9.9 KB |
| `Dexie` | Query layer, bulk operations, live queries | 32.7 KB |

No library changes IndexedDB's speed: the cost is deserialization and transaction count. `idb` would remove a few lines
of promise plumbing per module, but the stores it would replace carry tested, subtle logic (Filo's generation check
after Clear all, cross-tab ordering, the version migration). The new database uses the same small hand-written helpers
as `checkpoint-store.ts`. `localforage` is in `docs/package-lock.json` only as a dependency of `@sentry/integrations`.

### 4.4 Versions are not diffs here

Diffs would shrink storage (25 versions of a 60 KB deck: 1.50 MB as copies, 0.52 MB gzipped one by one, a few KB as
diffs, estimated). They do not fix the load time, which comes from reading every version, and they cost a replay on
restore, a broken chain if one link is damaged, and harder cross-tab writes. Filo is already the diff-based history,
and its slice 6 turns versions into marks. Content addressing (§4) gets the cheapest part of the saving now, by sharing
identical texts. Compression with the built-in `CompressionStream` stays an option for bodies later; it is not part of
these PRs.

## 5. Which thread does the work

IndexedDB reads from disk off the main thread already. What lands on the calling thread is deserializing the result.
A worker can take that over, but posting its result back copies it again on the main thread, so **a worker helps only
when it sends back much less than it reads.**

| Work | Thread | Why |
|---|---|---|
| `pagehide` save of the boot record | Main | Synchronous localStorage; workers have none |
| Boot: open deck's metadata + body | Main | One small read; a worker would add its start-up before the first slide |
| Deck list, version list | Main | Small records |
| SHA-256 of a body | Main, async (`crypto.subtle`) | Measured in the PR, not assumed |
| Body sweep (§4.1) | Worker | Scans everything, returns what was deleted |
| Privacy & Data stats | Worker | Scans everything, returns a few numbers |
| Migration from localStorage | Main reads, idle-time batches | Only the main thread can read localStorage |

The worker follows the existing pattern in `studio-filo-persist.ts:295` (`filo-narrow.worker.ts`). There is no
single "storage worker" for all access: each small read would pay a message round trip, and the cross-tab handling
would have to move into it.

## 6. API shape

Today's reads are synchronous (`loadSource` has 17 callers, `loadDeckList` 14, `loadCheckpoints` 10). The versions
store already solved this with an in-memory cache filled at hydration. The new store keeps that model for
**metadata** (all decks' and the open deck's versions' records, small) and makes **bodies** async:

- `listDecks()` / `listVersions(deckId)`: synchronous, from the metadata cache.
- `readBody(pointer): Promise<string>`: async. The open deck's body is available synchronously at boot from the boot
  record.
- **Switching decks becomes async.** Today the switch reads localStorage synchronously; afterwards it awaits one body
  read. The switcher needs a pending state for the rare slow case. This is the largest behavioral change in PR B.

## 7. Delivery

**PR A: versions.** New database `lattice-studio` with `versions` and `bodies`. Migrate `lattice-studio-versions`
and any remaining legacy `lattice-studio-snap-*` keys into it, deleting the old data only after the new transaction
commits (the slice 0 rule). Read the open deck's version metadata at boot, not every deck's; bodies on restore and
preview. Store `slides` per version. Backup and the Privacy & Data tab read everything, off the boot path. Done when
the §2 benchmark's row 3 is back to row 2's numbers within run-to-run spread, in Chromium and WebKit, with
`checkpoint-storage.spec.ts` green in all three engines.

**PR B: decks.** Add `decks` to the same database, the boot record (§4.2), the async switch (§6), the localStorage
migration, and updates to backup/restore (`exportStudioState`, `importStudioState`), Clear all (`clearAllDecks`),
`deckContentStats` and the storage overlay's categories. An e2e test kills the page between the boot-record write and
the IndexedDB write and checks that nothing is lost. Behind a design re-check before it starts: this PR changes the
pre-paint shell's contract and every `loadSource` caller.

## 8. Risks and open questions

- **The silent deck-save loss (§3) exists now.** PR B removes most of the pressure (one deck's text in localStorage),
  but a small change can report the failure today the way versions do. Recommended as its own small fix ahead of PR B.
- **`crypto.subtle` needs a secure context.** Fine on https and localhost; the Tauri webview's origin must be checked
  before PR B.
- **Two tabs, one deck.** Versions already broadcast changes on a `BroadcastChannel`; decks have no cross-tab sync today
  (only `FinishStudio.tsx` listens for `storage`). PR B must not make this worse: last writer wins, as now.
- **Filo's stored history duplicates the text** (its `text` and `floor`). Out of scope; slice 6 is where the two meet.

## 9. Follow-ups outside these PRs

- **Workspace backup zips on the main thread** (JSZip across every deck and photo). JSZip runs in a worker; a large
  workspace freezes the page while it zips.
- **Filo's eviction compaction** (`compactSnapshot`) runs inside its write path on the main thread when the 50 MB
  budget is exceeded.

## 10. Adversarial trio (HARD RULE #25)

Pending: red team, Munger inversion and an independent checker on this design, before any code.
