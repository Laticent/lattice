---
status: in-progress
summary: >
  Why a Studio reload slows down as a profile fills up, measured and profiled, and what to change. Two costs grow with
  use. (1) Version history: opening any deck reads every saved version of every deck from IndexedDB
  (`hydrateCheckpoints` `getAll()`), each a full copy of its deck; with 40 decks x 25 versions a phone-speed boot goes
  from 2.7 s to 3.8 s to the first slide. (2) The deck list: every boot reads and JSON-parses every deck's whole text
  from localStorage and scans it for a title; 40 decks add about 250 ms. Photos (Blobs in IndexedDB) cost nothing. A first draft proposed content-addressed metadata-plus-pointer
  records for decks and versions; the adversarial trio showed the measured costs are fixed by reading less, that content
  addressing saves almost nothing here (`saveCheckpoint` already skips an unchanged version) while adding the only
  path that can silently delete text, and that versions move again in Filo slice 6. Recommended now: report a failed
  deck save (a live silent-loss defect), read only the open deck's versions, and name decks from a small title record `saveSource` keeps. The owner chose
  this plan; items shipped with first slide 3.4 s → 2.6 s and heap 177 → 97 MB on the full profile.
  Moving deck text out of localStorage waits for evidence that users reach its quota; the pointer design and the
  trio's constraints on it are kept for that day. No IndexedDB library; no diff format for versions.
---

# Studio storage: what slows a full profile down, and the smallest fix

**Date:** 2026-11-11 · **Status:** IN PROGRESS: §4 items 1–3 shipped with this note, item 4 and the version slide counts are follow-ups · **Scope:** decided by the owner, §9
**Trigger:** the owner: "when there is lots of stuff in IndexedDB and the cache, load time slows down; with private
browsing it's snappy. Audit and measure. Are we storing things efficiently?" Then, in the same conversation: should we
use `idb`; should versions be diffs; should decks move out of localStorage as metadata plus content (the owner proposed
"metadata plus a pointer to a location in the same record"); what should leave the main thread.

Builds on `2026-07-21-storage-accumulation-diagnostic.md` (the first round of the same symptom, fixed in #1930) and
`2026-10-27-filo-undo-history.md` (slice 0 moved versions into IndexedDB; slice 6 turns them into marks).

## 1. The answer

Accumulated storage does slow a reload, through two pieces of code, not through IndexedDB or the cache as such:

1. **Version history reads everything.** Opening any deck calls `readCheckpoints`, which starts
   `hydrateCheckpoints()` (`docs/src/components/studio/checkpoint-store.ts:476`). It runs `getAll()` with no range
   (`:489`), so every saved version of every deck is copied into memory before the first slide. Each version is a full
   copy of its deck, up to 25 per deck (`SNAP_CAP`).
2. **The deck list reads every deck's text.** `loadDeckList()` (`studio-store.ts:385`) calls `loadSource` for every
   deck, which reads and `JSON.parse`s the whole text from localStorage, then `titleFromSource` scans it for a heading.
   The deck list row already carries the resolved title (`IndexEntry.derived`, `:295`), and the boot calls
   `loadDeckList` more than once (`StudioShell.tsx:488` and others).

Both grow with decks x size, which is the "slower over time" the owner saw. A private window starts empty and pays
neither.

## 2. Measurements

**Method.** Chromium (Playwright's bundled build) against the built Studio (`npm run build:e2e`, then
`npm run preview:e2e` in `docs/`), 1440x900, 4x CPU throttle through the DevTools protocol (phone-like). Each scenario
gets a fresh browser context: visit once so the app creates its databases, seed, reload once to warm the service worker
and HTTP cache, then time each reload from navigation to the first slide root painted with content in the live
preview. "Blocked" is the sum of main-thread long tasks (over 50 ms) up to that paint. "Heap" is
`performance.memory.usedJSHeapSize` 3 s after paint, a single noisy sample per reload. Decks are
`test/integration/baseline-decks/gallery.md` (60 KB), stored JSON-encoded the way `write()` stores them. Photos are
1600x1200 noisy JPEGs, about 1 MB each, stored as `media-store.ts` stores them. Script:
`2026-11-11-studio-storage-pointer-records/storage-bench.cjs` (`node storage-bench.cjs <reloads> <throttle>
[scenarios]`).

**Results, 5 reloads, medians:**

| Stored | Origin usage | First slide | Blocked | Heap |
|---|---|---|---|---|
| Nothing (as private browsing) | 3.8 MB | 2,487 ms | 812 ms | 68 MB |
| 40 decks | 5 MB in localStorage | 2,702 ms | 1,106 ms | 116 MB |
| **40 decks + 25 versions each** | 41 MB | **3,759 ms** | **1,628 ms** | **199 MB** |
| 60 photos | 68 MB | 2,405 ms | 801 ms | 64 MB |
| All of the above + 60 chat messages per deck | 106 MB | 3,120 ms | 1,463 ms | 212 MB |

Two further runs of the first two rows, 9 reloads each: 2,373 vs 2,589 ms and 2,327 vs 2,619 ms first slide; 815 vs
1,156 ms and 817 vs 1,136 ms blocked.

Reading it:

- **Versions cost about 1 s at phone speed** (rows 2 to 3), +500 ms blocked and +80 MB heap: the version cache holds
  1,000 full deck texts.
- **40 decks cost about 250 ms** (rows 1 to 2, three runs agree), +330 ms blocked. A CPU profile of one reload
  (unthrottled) puts the new self time in `studio-store`'s `read` (`getItem` + `JSON.parse`, 30 ms) and `headingText`
  (16 ms), plus 40 ms more garbage collection: the §1 #2 path.
- **Photos are free at boot.** A Blob read from IndexedDB is a handle; its bytes are read only when used.
- **Spread is wide under throttle** (row 3: 2,812 to 5,365 ms). Medians are the claim; rows 1 and 2 were repeated
  because their gap is near the noise.

**Correction.** The first run of this benchmark stored deck text as raw markdown. `read()` failed to `JSON.parse` it and
returned null, so the app never read those decks, and the draft concluded "deck text in localStorage costs nothing".
The checker caught it; the table above is the corrected run.

**Not measured:** Filo's undo history (reads only the open deck by design); the service worker cache (warm and equal
across scenarios, not varied); WebKit and Firefox (the script's throttle, `performance.memory` and long-task observer
are Chromium-only); a real phone.

## 3. What is stored where today

| Data | Where | Shape | Read at boot |
|---|---|---|---|
| Deck list | localStorage `lattice-studio-deck-index` | `[{id, title, builtin, derived?, restored?}]` | Yes, and by the pre-paint shell |
| Deck text | localStorage `lattice-studio-src-<id>`, JSON string; absent means "unedited" | Whole text | **Every deck's** (§1 #2); the open deck's also by the pre-paint shell |
| Versions | IndexedDB `lattice-studio-versions` / `checkpoints` | `{deckId, id, ts, label, source}`, full text each | **Every deck's, every version** (§1 #1) |
| Undo history | IndexedDB `lattice-filo` | Patches per deck, 50 MB budget | Open deck only |
| Photos, videos, themes, reference PDFs | IndexedDB `lattice-workbench` / `assets` | Record with a Blob | By kind, when needed |
| Chats, drafts, comments, settings | localStorage | JSON per deck or setting | Settings |
| Narration audio | IndexedDB (`narration-store.js`) | Blob + metadata | No |

**localStorage space.** Chromium and Firefox allow about 5.2 M characters per origin; WebKit holds half that once a
string has any non-Latin-1 character (`2026-10-27-filo-undo-history.md` §1 #6, measured). Every deck, chat and setting
shares it. This is a calculation for heavy users, not an observed report.

**A live defect.** `saveSource` (`studio-store.ts:350`) calls `write()`, which catches `QuotaExceededError` and returns
`false` (`:41-48`); `saveSource` ignores it. When localStorage is full, a deck edit is not saved and nothing tells the
author. Version saves report the same failure (`StudioShell.tsx:5584`).

## 4. Recommended changes

Ordered by what each protects or unblocks.

1. **Report a failed deck save.** `saveSource` returns the failure and the Studio shows the same sticky notice
   versions use. Small, and it closes a silent-loss path that exists today.
2. **Read only the open deck's versions (PR A).** `hydrateCheckpoints` reads `getAll(deckRange(deckId))` for the open
   deck (the range query already exists, `checkpoint-store.ts:201`, used at `:211` and `:285`); other decks load when
   opened. `checkpointBytes`, backup and Clear all read everything on demand, off the boot path; the legacy
   localStorage migration runs at idle, in batches. Store `slides` on each version so the version list stops parsing
   every version's text (`metaFor(cp.source)`, `StudioShell.tsx:8613`); that runs only when the list opens, so it
   is a follow-up, not part of the boot fix. No new database and no schema change. Done when, with this script, rows 2 and 3 of §2 agree within the spread of repeated row-1/row-2 runs
   on first slide, blocked time and heap.
3. **Name decks without reading them.** `IndexEntry.derived` is not the right source: its own contract says nothing
   in the app reads it (it serves the pre-paint shell), and it holds the unformatted title, not the list's. Instead
   `saveSource`, the one writer of deck text, records each deck's list title with the length of the stored text in
   `lattice-studio-list-titles`. `loadDeckList` trusts an entry only while that length still matches (one `getItem`,
   no parse) and reads, names and records any deck written around `saveSource` (an older build, a hand edit). Clear all
   removes the key; deleting a deck removes its entry. Done when row 2 of §2 matches row 1 within the same spread.
4. **Warn before the quota, then decide on moving decks.** The Privacy & Data tab already measures local storage; it
   warns past 80% of the origin's localStorage allowance. Moving deck text to IndexedDB (§6) waits for evidence that
   users get near it. Moving chats first is the cheaper relief: nothing reads them before paint or on `pagehide`.

Filo slice 6 then turns versions into marks, which retires the version store. Item 2 deliberately keeps the existing
store so that user data migrates once, in slice 6, not twice.

## 5. Questions the owner asked, answered

**A library?** No. Six modules use IndexedDB directly (Filo, versions, the asset library, narration, `secret-box`,
`openrouter-key`). Measured bundle cost (esbuild, minified, gzip -9, main entry):

| Library | What it is | gzip |
|---|---|---|
| `idb-keyval` | get/set on one key-value store | 0.36 KB |
| `idb` | Promise wrapper with typed schemas | 1.4 KB |
| `localforage` | localStorage-style API with old-browser fallbacks; last release 2022 | 9.9 KB |
| `Dexie` | Query layer, bulk operations, live queries | 32.7 KB |

None changes IndexedDB's speed: the cost is how much is deserialized and how many transactions run. `idb` would remove
a few lines of promise plumbing per module and nothing else, while the stores it would replace carry tested logic
(Filo's generation check, cross-tab ordering, the version migration). `localforage` appears in
`docs/package-lock.json` only as a dev dependency of `@sentry/integrations`.

**Versions as diffs?** Not here. 25 versions of a 60 KB deck: 1.50 MB as copies, 0.52 MB gzipped one by one, a few KB
as diffs (estimated). Diffs do not fix load time, which comes from reading every version, and they cost a replay on
restore and a broken chain if one link is damaged. Filo is already the diff-based history, and slice 6 brings versions
into it.

**What leaves the main thread?** IndexedDB reads from disk off the main thread already; what lands on the calling thread
is deserializing the result. A worker that posts its result back copies it again, so it helps only when it returns much
less than it reads. After items 2 and 3 the boot reads one deck's versions and one deck's text, which stays on the main
thread, as does the synchronous `pagehide` save (workers have no localStorage). Whole-workspace scans (Privacy & Data
stats, backup) are worker candidates on the pattern of `studio-filo-persist.ts:295` (`filo-narrow.worker.ts`).

## 6. Deferred: metadata records that point at their text

The owner proposed, and the first draft adopted, one IndexedDB database in which every deck and version is a small
metadata record holding a pointer to its text, with texts keyed by SHA-256 so identical texts are stored once:

```
decks     { id, title, derived, size, slides, bytes, updatedAt, body: { where: 'idb', key } | null }
versions  { deckId, id, ts, label, slides, bytes, body: { where: 'idb', key } }
bodies    { key, text }
```

The trio's case for not building it now:

- **The measured costs do not need it.** Both are fixed by reading less (§4 items 2 and 3).
- **Content addressing saves little.** `saveCheckpoint` already skips a version identical to the latest one
  (`studio-store.ts:704`, `:717`), so shared texts arise only from restore-then-save, a duplicated deck, or a deck equal
  to its own latest version. Per-version gzip saves 65% and was not proposed.
- **It adds the only path that silently deletes text.** Shared bodies need a sweep that deletes "unreferenced" text by
  inference; any future store that points at a body and is not taught to the sweep loses data at idle, with no error.
- **Versions migrate again in slice 6.** Building a new version database now means two migrations of the same data.

If deck text does leave localStorage (§4 item 4), use **one body per record, keyed by the owner's id** (a sibling
`bodies` store keyed `[deckId, id]` or by deck id), not by hash: ownership stays one-to-one and there is nothing to
sweep. The Tauri app addresses files by path, which fits this and not a hash. The trio's constraints for that design:

- **One pending key per deck, not one shared boot record.** localStorage is shared by every tab; a single record lets
  tab B's save overwrite tab A's unsaved text, and a deck switch leaves the old deck's last edit without a synchronous
  copy. Keep `lattice-studio-src-<id>` as a per-deck pending write and delete it only after IndexedDB commits that
  exact text (red team #1, checker #2).
- **Ordered writes with a stored generation.** Queue each deck's writes with a sequence number and check a generation
  stored in the database inside every write transaction, as Filo does (`lib/filo/store.ts:385-390`); a per-tab counter
  misses a frozen tab's late write after Clear all (red team #2).
- **Reconciliation needs a field to compare.** "Newer wins" needs a sequence number and the base text's hash on the
  pending record (red team #6, checker #3).
- **"Unedited" must stay representable.** A missing source row drives built-in updates, the backup nudge, restore in
  place and the pre-paint caption (`StudioShell.tsx:2316-2321`, `studio-store.ts:1301-1310`, `studio.astro:586`);
  `body: null` for an unedited deck, and migrate only rows that exist (red team #4).
- **The pre-paint shell keeps its localStorage inputs:** `lattice-studio-active`, a deck-list mirror with `derived`
  and an edited flag, and the open deck's text for `size:` (`studio.astro:579-645`) (red team #5).
- **Async reads need request tokens and an awaited restore.** A slow read for deck B must not land in deck C after a
  second switch; `Library.tsx:709-712` reads a save back immediately; `importStudioState`, `exportStudioState`,
  `resolvedSources` and the backup walk every deck synchronously (red team #7, checker #6).
- **Migration drains on every open,** because a tab on the old build keeps writing the old keys, and it keeps the old
  keys until the new data is verified, so a revert still finds them (red team #8).
- **A fallback when IndexedDB will not open,** as `checkpoint-store.ts:490-503` has (red team #9).
- **If a hash is ever used,** normalize the text with `toWellFormed()` first: two different strings with lone
  surrogates hash the same through `TextEncoder` (red team #10, demonstrated), and hash before opening the transaction,
  since awaiting `crypto.subtle` inside it lets it commit early (checker #8).

## 7. Follow-ups outside this work

- **Workspace backup zips on the main thread** (`workspace-backup.ts:70`, JSZip across every deck and photo). JSZip can
  run in a worker; today a large workspace freezes the page while it zips.
- **Filo's eviction compaction** (`compactSnapshot`) runs inside its write path on the main thread when the 50 MB budget
  is exceeded.

## 8. Adversarial trio (HARD RULE #25), on the first draft

Three independent agents read the first draft (metadata-plus-pointer records, content-addressed bodies, a sweep, a
single boot record, two PRs) and the code.

**Red team.** Eleven attacks; three could lose text, all fixable inside the design: the single shared boot record
loses another tab's or the previous deck's unsaved edit; SHA-256 calls resolve out of order, so two saves of one deck
can commit in the wrong order, and a per-tab Clear-all counter misses a frozen tab; restoring a version by moving a
pointer can commit a deck whose body another tab's sweep removed. Also: "unedited" disappears; the shell needs more
than the boot record; reconciliation is undefined; async reads break synchronous callers; migration must drain old
builds; lone surrogates collide under `TextEncoder`. Held: the sweep's transaction ordering; SHA-256 between
well-formed texts; Blobs need no change. **Disposition:** each attack is recorded as a constraint in §6; the design that
needed them is deferred.

**Inversion.** Verdict: keep the diagnosis, cut content addressing and the sweep, hold the deck move. The dedup saving
is near zero because of the existing unchanged-version skip; the sweep is a permanent silent-deletion hazard; the
version store migrates again in slice 6; the deck move rests on a quota calculation, not an observation. Proposed the
order in §4. **Disposition:** adopted as the recommendation, pending the owner (§9), because it reverses a pattern the
owner endorsed.

**Checker.** Found that the benchmark stored deck text unencoded, so the app never read it: the "decks cost nothing"
row was false. Also: the single boot record fails with two tabs on two decks; "newer" had no field; the done criterion
could not be measured in WebKit with this script and left out heap; the heap explanation miscounted (the deck has
characters above U+00FF, which V8 stores at two bytes each); caller counts were off (`loadSource` 14, `loadDeckList`
13, `loadCheckpoints` 10 non-test calls). Confirmed: the `getAll()` diagnosis, the `saveSource` defect, every other
citation, and the transaction-ordering argument. **Disposition:** benchmark fixed and re-run (§2); the deck-list cost it
uncovered is §4 item 3; counts and heap wording corrected; done criteria now name heap and stay in Chromium, with
WebKit listed as unmeasured.

## 9. Decision

The owner endorsed metadata-plus-pointer records before the trio ran. Shown the trio's case, the owner chose the
smaller plan on 2026-11-11 and asked for items 1–3 in one PR with before/after numbers.

## 10. Results (items 1–3)

Same script, same machine, same build pipeline (`npm run build:e2e`), 4x throttle, 7 reloads, medians. "Before" is
the build of `main` at this note's first commit; "after" is the build with items 1–3.

| Stored | First slide before → after | Blocked before → after | Heap before → after |
|---|---|---|---|
| Nothing | 2,472 → 2,556 ms | 1,013 → 1,007 ms | 81 → 86 MB |
| 40 decks | 2,828 → 2,835 ms | 1,255 → 1,119 ms | 116 → 86 MB |
| 40 decks + 25 versions each | **3,442 → 2,564 ms** | **1,710 → 1,033 ms** | **177 → 97 MB** |

The 40-decks row's first paint did not move in that run while its blocked time and heap did, so the pair was repeated
(9 reloads, twice): nothing vs 40 decks, 2,509 vs 2,680 ms and 2,590 vs 2,646 ms first slide; 1,048 vs 1,025 ms and
983 vs 1,078 ms blocked; heap equal (92 / 92, 97 / 92 MB). Before the change the same pairs differed by 216–292 ms of
paint and 320–340 ms of blocking. A CPU profile of the after build no longer shows `studio-store` among the top self
times. Reading it:

- **Versions:** the full-profile boot now paints with the empty one, and the version cache no longer holds every deck.
- **Deck list:** blocked time and heap are back to the empty profile's; the remaining first-paint gap (56–171 ms) is
  inside the run-to-run spread of these rows. Not claimed as zero.
- **Not measured:** WebKit and Firefox (the script's throttle and heap readings are Chromium-only); a real phone.

**Code checker (maker-checker, on the diff).** No outright data loss. Three windows the per-deck reads opened, all
fixed in this change with a test each that fails without its fix: one deck's failed read moved the whole session to
localStorage and copied every cached version list into the deck sources' quota (now only a database that never opened
does; a failed read retries once, then on the next read); a read finishing after that fallback could still migrate a
deck's legacy list into IndexedDB and hide it (both reads now stop when the session fell back); a version saved
before its deck's read landed left the view showing only the new version, and could hide the deck's legacy list (a
commit now folds in the legacy list and tells the view). Also fixed: the idle migration timer is cancelled between
tests (HARD RULE #32), and the failed-save notice is worded for every caller of `saveSource`, not only the editor.
Accepted: the title mirror trusts a length match, so a deck rewritten to the same length by an older build in another
tab, during a rollout, lists under its old title until its next save (display only); two tabs saving at once can
overwrite each other's mirror entry, which only shows when the lost entry's length still matches.
Logged (off-path): `importStudioState` counts a deck whose save was refused as added.

**Verified on the real Studio** (Playwright, built site): `checkpoint-storage.spec.ts`, `decks.spec.ts` and
`filo-undo.spec.ts` in Chromium, Firefox and WebKit (33 passed; 2 skipped by design: the real-quota case is
Chromium-only); the new `deck-save-failure.spec.ts` in all three, where a refused deck write shows the notice. Re-run after the
checker's fixes: 36 passed, the same 2 skipped; the full profile painted at 2,427 ms against the empty profile's
2,607 ms, heap 92 / 92 MB.
