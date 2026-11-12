---
status: proposed
summary: Chat threads should merge across tabs with a CRDT, and the recommendation is Yjs (already a dependency, the live sessions' model) over a library of our own. Each tab's author and AI are separate writers, so a save today is last-writer-wins and can drop another tab's messages. A bake-off (§10) against Accordo, a zero-dependency list CRDT written for it, passed both on a 4,500-session property gate after three audit rounds. Accordo opens a fresh thread about 2x faster, uses half the heap and never split a reply from its question; Yjs stores an aged thread 8.6x smaller, a gap of encoding that Accordo has not closed. Yjs costs about 23 KB gz in lazily loaded chat code and nothing at boot. It retires #3138's fingerprint and merge apparatus. Decks are out of scope.
---

# Chat threads across tabs: merge them with a CRDT

**Date:** 2026-11-12 · **Status:** PROPOSED: the owner picks an option (§7) · **Scope:** Studio chat threads only.
Deck text is out of scope (§6).
**Trigger:** the owner, reviewing #3138: "chat is two people in a sense, the author and the AI", and "once we introduce
multiple tabs we are essentially talking about multiple people". Data loss is the serious concern.

Builds on `2026-11-11-studio-storage-pointer-records.md` §11 (added by #3138, still open), which moves chats to IndexedDB, and on
`2026-10-06-studio-live-collaboration.md`, which brought Yjs into the repo for live sessions.

## 1. The answer

A chat thread has several writers: in each open tab, the author (send, Apply, Discard, regenerate, compaction) and
the AI (a reply arriving). Today a save writes the tab's whole thread over the stored one, so the last tab to save
wins and another tab's messages can be lost (§2). The fix is a data type that merges every writer's changes into the
same result in any order: a CRDT (conflict-free replicated data type).

**Recommendation: Yjs (option B).** It is already a dependency (`yjs` 13.6.33) and the model live sessions use
(`docs/src/components/studio/live/live-controller.ts`). It costs about 23 KB gz in the chat's lazily loaded code and
nothing at boot. It retires the merge rules #3138 had to write by hand: `mergeThreads`, the fallback fingerprints,
`ownMarks` and `fromDb`. Those rules took five review rounds, and every round found a defect in the previous round's
fix. A merge we write ourselves is the part most likely to be wrong; Yjs's merge is proven and used widely.

## 2. What goes wrong today

#3138 made two things safe: a tab still on an older build, and a save that falls back to localStorage. The ordinary
case is not safe:

1. Tab A and tab B both show deck D's chat.
2. In tab A you send a message; the reply arrives and is saved.
3. Tab B's panel still shows the thread without tab A's turn.
4. In tab B you send a message. Tab B saves what it shows plus its new turn.
5. Tab A's turn is gone from storage.

This is last-writer-wins, as it was when chats lived in localStorage. #3138 does not make it worse; it does not fix
it either. Within one tab, #3138 fixed the same shape between the author and a streaming reply (Apply during a reply
was undone when the reply landed).

## 3. What a fix must guarantee

1. **No writer's message is lost**, whichever tab or order the saves come in.
2. **Deliberate removals hold.** A regenerate (a reply replaced), a compaction (early turns replaced by a briefing), a
   discarded edit and the 60-message cap must not be undone by a tab that still holds the old messages.
3. **Changed fields converge.** An edit applied in one tab and a different card answered in another both stand.
4. **A reply stays next to its question**, even when another tab adds turns while it streams.
5. **The open panel shows other tabs' turns live**, so the author does not build on a stale view.
6. **Backups, restores and the localStorage fallback keep working**, and an older build's legacy key still merges in.
7. **Bounded cost**: nothing added to the boot path (the Studio route is over its soft budget), storage near today's.

## 4. Options, measured

Measured on this machine against `yjs` 13.6.33 (esbuild minify, gzip; a 60-message thread of about 600 characters
each, every fourth reply carrying a proposal; reproduce with `node ../engineering/decisions/2026-11-12-chat-threads-crdt/measure.mjs` from `docs/`):

| | A. Purpose-built CRDT | B. Yjs | C. Yjs for chats and decks |
|---|---|---|---|
| What it is | Messages keyed by a permanent id, ordered by a hybrid clock, each changeable field last-writer-wins, removals kept as tombstones | One `Y.Doc` per deck's chat: a `Y.Array` of `Y.Map`, one map per message | B, plus deck text as `Y.Text` (the live sessions' model) |
| Code we own | The merge itself, about 200–300 lines, and its proof | The data mapping and persistence; the merge is Yjs's | B, plus moving deck storage |
| Added bytes | 0 | about 23 KB gz, loaded with the chat, 0 at boot if `chat-store.ts` imports Yjs dynamically (§5.3) | B, plus Yjs on the boot path (decks load at boot) |
| 60-message thread (ids included) | 45,360 B (+7.8% over JSON's 42,096) | 44,844 B (+6.5%) | as B |
| After 30 flag edits and a compaction | grows with tombstones until collected | 16,545 B (JSON: 14,987) | as B |
| Open a 60-message thread | a JSON parse | about 0.45 ms (0.43–0.48 across three runs) | as B |
| Removals | our tombstones, and a rule for collecting them | built in, collected by Yjs | built in |
| Stored form | readable JSON | binary updates (base64 in a backup) | binary |
| Cloud sync later | possible: a state merge | ready: ship Yjs updates | ready, and decks too |
| Risk | the merge is ours; our track record on #3138 is five defective rounds | a dependency's semantics (§5.6); a one-way format change | B, plus the largest migration in the Studio (decks), on the boot path |

**Why B over A.** A is smaller and keeps JSON readable, but its correctness rests on us, and #3138 is the evidence
of what that costs. B's merge is proven, its removals are native, it is already in the repo and in the live sessions,
and its bytes stay out of boot. **Why not C now.** Decks load at boot (Yjs would cost the boot path 23 KB gz on a route
already over budget), the migration is far larger, and deck text across devices is the cloud-workspace problem; it
belongs in that design, starting from the live sessions' `Y.Text` model.

## 5. The design (option B)

### 5.1 Data model

- One `Y.Doc` per deck's chat, a `Y.Array('messages')` of `Y.Map`s.
- Each map holds one message: `id` (a random 128-bit id), `role`, `content` and the existing optional fields
  (`proposed`, `applied`, `autoApplied`, `autoHeld`, `appliedCount`, `refused`, `action`, `activity`, `usage`, `compacted`, `trace`, `photos`, `videos`; `ChatMessage` in `studio-store.ts`). Fields that never change after
  creation (`content`, `role`) are written once; fields that change (`applied`, `proposed`, `action.state`) are keys
  set in place, so concurrent changes to different keys both stand.

### 5.2 Every author and AI action, as an operation

| Action | Operation |
|---|---|
| Send | push a message map |
| A reply lands | insert after its question's item (a Yjs relative position), not at the end, so a turn another tab added meanwhile cannot split question and answer |
| Apply, Discard, answer a card | set a key on that message's map |
| Regenerate | delete the reply item, insert the new reply after the question |
| Compaction | delete the summarized range and set `compacted` (the briefing) on the first kept message, as `applyCompaction` (`chat-compact.ts`) does today |
| Undo compaction | re-insert the saved messages before the first kept one and delete its `compacted` key |
| 60-message cap, old traces | delete the oldest items, carrying a deleted message's `compacted` onto the new first one (as `saveChat` does today); delete the `trace` key of older replies |

Two tabs capping or trimming the same items converge, because a Yjs delete of an item already deleted does nothing.

### 5.3 Storage and saving

- **Yjs stays off the boot path.** `chat-store.ts` is imported at boot (through `studio-store.ts`), so it loads `yjs` with `import()` when a chat is first read, never statically. The synchronous reads that exist today (`readChat`, used by the backup, the stats and the panel's first render) read a plain JSON view the store keeps of each loaded document, so they stay synchronous; `hydrateChat` / `hydrateAllChats`, already asynchronous, are where Yjs loads.
- The `chats` store keeps `{ deckId, v: 2, update }`, where `update` is the document's encoded state.
- **A save never replaces.** It reads the stored update, merges it with the tab's changes (`Y.mergeUpdates`), and
  writes the result, in one IndexedDB transaction. Merging is commutative and idempotent, so the save order between
  tabs does not matter and a repeated save changes nothing.
- **Fallback**: when IndexedDB refuses, the tab's update goes to localStorage (base64), and the next load merges it
  in like any other update. The fingerprint machinery is not needed: merging an update twice is harmless.

### 5.4 Across tabs

The tab broadcasts each change (`BroadcastChannel`, the update bytes). Another tab applies it to its document, and
the open panel re-renders from the document, so it never shows a stale thread (requirement 5). A reply streaming in a
tab is unaffected: it lands as an insertion after its question.

### 5.5 Migration from today's records

- A v1 record (`{ deckId, messages: [...] }`, #3138) converts to a v2 document **inside the readwrite transaction that
  reads it**, so two tabs cannot each convert it into two documents with duplicated messages (Yjs would keep both).
  The first transaction to see v1 converts it; the other sees v2.
- A legacy localStorage key from an older build converts to messages and merges by content once, the rule #3138
  already has (`mergeThreads`), kept only for this one-way door, then the key is deleted after commit.
- Backups keep chats as readable JSON (`toJSON()`), and a restore builds a document from them and merges it into the
  stored one: the "only where this browser has none" rule goes away, because merging cannot lose either side.

### 5.6 What to watch in Yjs's semantics

- **Concurrent inserts at the same place** are ordered by Yjs's client id, not by time. Two tabs' turns may interleave
  in either order; each turn stays together, because a question and its reply are tied by relative position (§5.2).
- **Concurrent writes to the same key** resolve deterministically, not by time. Only one key per action changes, and
  the same author rarely sets the same flag two ways in two tabs at once; either result is a valid state.
- **Document growth**: deletions leave small tombstones; measured, a thread after 30 edits and a compaction is 16.5 KB
  against 15 KB of JSON. Garbage collection is on by default and must stay on.
- **Upgrades**: Yjs's update format is stable across 13.x; a major upgrade needs its own check.

## 6. Out of scope: deck text

Two tabs editing the same deck is also last-writer-wins today, and the cloud workspace ("synced, coming soon" in
Workspace → Data) will need decks to merge across devices. That is option C, and it is a larger decision: decks load
at boot, so Yjs would reach the boot path, and the migration touches every deck. It belongs to the cloud-workspace
design, which should start from the live sessions' `Y.Text` model. §6 of the 2026-11-11 note lists what moving deck
text out of localStorage requires either way.

## 7. Decision needed

1. **B (recommended; §10 measures it against A, a library of our own), A (needs round 4, §10.4), or neither.**
2. On B: Yjs's roughly 23 KB gz in the chat's lazy code is acceptable (it never reaches boot).

## 8. Plan, once chosen

One PR, on top of #3138 once it merges (HARD RULE #17: not stacked while #3138 is open):

1. `chat-store.ts` on Yjs (§5.1–5.4), with `import('yjs')` so nothing reaches boot (checked by the route budget); the v1 migration in its transaction (§5.5).
2. `ArchitectChat.tsx` reads from and writes operations to the document; the panel observes it.
3. Tests that wait on signals, not time (HARD RULE #32):
   - a `fast-check` property test (a dependency already): random interleavings of sends, replies, applies, regenerates,
     compactions and caps across 2–4 simulated tabs, delivered in random orders, must converge to one thread that
     keeps every surviving message and every deliberate removal, seed printed;
   - real-browser two-tab and three-tab tests on Chromium, Firefox and WebKit: concurrent sends, a reply streaming in
     one tab while another sends, a regenerate in one tab while another applies;
   - the two-build test (`2026-11-11-studio-storage-pointer-records/old-new-tab.cjs`) against the v1 store;
   - the iOS suite `ios-safari-chat-storage` extended to a v2 document.
4. Verification at the trio tier (HARD RULE #25): it migrates user data a second time and replaces the merge rules.

## 9. What it retires from #3138

`mergeThreads` (kept only for the one-way legacy-key door), the fallback fingerprints and `ownMarks`, `fromDb`, the
"write the whole thread" save, and the restore's "only where empty" rule. What stays: the IndexedDB store, the idle
migration, the localStorage-fill warning, the error notices, and the panel's wait-for-load gate.

## 10. Bake-off: Yjs against a library of our own

The owner asked for metrics before choosing, and would rather write a dependency-free library for general use than
fit Yjs where it does not belong. So we wrote one, **Accordo** (`2026-11-12-chat-threads-crdt/bakeoff/accordo.ts`,
about 300 lines, no dependencies, no DOM), and ran both through one interface (`contender.ts`), one correctness gate
and one set of workloads. Everything below reproduces from `docs/` or the bakeoff folder (commands in each file's
header).

### 10.1 The two contenders, and three rounds of audit

- **Accordo.** An ordered list of records. Order is a tree (the RGA scheme: each record names the record it went in
  after). Each change carries a per-replica sequence number with no gaps, so a lost broadcast is asked for again;
  fields are last-writer-wins on a Lamport clock; a delete is final. An append yields to a concurrent insert after
  the same record, so a reply stays next to its question. JSON on disk.
- **Yjs 13.6.33**, used as a careful integration would: a `Y.Array` of `Y.Map`, an id index kept current by an
  observer, a fast path for appends, each turn in one transaction, the V2 update encoding.

Each round of Accordo went to an independent auditor, and each audit found real defects:

| Round | Design | The audit found |
|---|---|---|
| 1 | fractional position keys | concurrent turns interleaved; every delta carried the whole deleted set; one lost broadcast diverged a tab for good; the harness was unfair to Yjs (V1 encoding, a scan per write, no transactions) |
| 2 | RGA tree, gap-free sequences | a change overwritten or wiped by a delete was never resent, so a receiver's version vector stalled below it and every later pull resent everything above (903,876 B to an up-to-date peer); reopening under the same replica id reused an id and crashed; `NaN` and shared references leaked through `encode`; the gate could catch none of these; the aged-sync timing was noise |
| 3 | round 2, fixed | (this round: below) |

Round 3 fixes all of round 2's findings. A delta now names the sequences the sender holds but no longer stores
(superseded), so a receiver holds them too; a stored state carries the sender's version vector; a replica reopened
under its own id resumes its sequence; values are copied as JSON. Round 3 has not been audited.

### 10.2 Correctness gate (`property.ts`, `mutants.mjs`)

fast-check, 1,500 random sessions per seed on seeds 42, 7 and 1234: 2–4 tabs send, reply, apply, discard,
regenerate, answer cards, compact, sync partially, resend stale deltas, broadcast with random drops and **reload from
storage**; then they fully sync. Afterwards every tab must hold the same thread, nothing may be lost, nothing deleted
may come back, and **a pull between two synced tabs must be as small as a tab's pull from itself** (no stalled
version vector). Replica ids are seeded, so every count below reproduces exactly.

| | Accordo | Yjs |
|---|---|---|
| All tabs agree, nothing lost, nothing deleted comes back, nobody owes anybody | pass, 4,500 sessions | pass, 4,500 sessions |
| Two tabs answer one card differently, any sync order | pass | pass |
| Reopened under its own replica id, then edited (Accordo only) | pass | not applicable |
| A reply split from its question by a concurrent turn (measured, not a failure) | **0 in 4,500** | 9 in 4,500 (0.2%) |

`mutants.mjs` proves the gate can fail. It removes one safeguard at a time and runs the gate:

| Mutant | Result |
|---|---|
| no gap detection (the vector jumps over a missing change) | caught |
| no superseded ranges (round 2's stall) | caught |
| no sequence resume (round 2's crash) | caught |
| no append yield | measured: 2 of 1,500 replies misplaced (0 with it) |

### 10.3 Performance (`bench.ts`, `browser-bench.mjs`; `results/`)

Medians. A "turn" is a 200-character question and a 600-character reply; every fourth reply carries a proposed edit.
"Aged" is a thread after 10,000 random actions under the 60-message cap (60 messages live). Browser figures are
Chromium / Firefox / WebKit; Firefox and WebKit clamp the clock, so their smallest figures are coarse.

| Workload | Accordo | Yjs | Better |
|---|---|---|---|
| Store a 60-message thread, raw / gzip | 35.4 KB / 8.5 KB | 30.7 KB / 7.3 KB | Yjs, by 13% / 14% |
| **Store an aged thread, raw / gzip** | **904 KB / 181 KB** | **105 KB / 16.3 KB** | **Yjs, 8.6x / 11x** |
| Open a 60-message thread | 0.16 / 0.23 / 0.17 ms | 0.28 / 0.38 / 0.38 ms | Accordo, 1.6–2.2x |
| Open a 600-message thread | 1.4 / 2.8 / 1.6 ms | 2.9 / 4.4 / 4.5 ms | Accordo, 1.6–2.8x |
| Open an aged thread | 12 / 28 / 42 ms | 10 / 24 / 14 ms | Yjs; 3x in WebKit |
| One turn | 0.02 / 0.04 / 0.02 ms | 0.03 / 0.04 / 0.05 ms | even (all far under a frame) |
| Apply, regenerate, compaction | 0.03–0.17 ms | 0.03–0.18 ms | even |
| Broadcast after one turn (fresh / aged) | 1,115 B / 1,171 B | 977 B / 997 B | Yjs, by 12–15% |
| A pull with nothing new, aged | 15 B | 41 B | both negligible |
| A tab one turn behind pulls and applies it, aged | 1.2 / 2.1 / 2.0 ms | 0.7 / 1.9 / 1.3 ms | Yjs, 1.1–1.7x |
| Four tabs, 50 offline actions each, full merge | 4.4 / 5 / 7 ms, 340 KB sent | 8.5 / 13 / 11 ms, 286 KB sent | Accordo on time; Yjs on bytes, by 19% |
| Heap per open 60-message thread (Node) | 82 KB | 163 KB | Accordo, 2x |

Round 2's "Yjs syncs an aged thread 6x to 200x faster" was the stall bug and a noisy measurement (a difference of two
timings); the sync row is now timed directly. Round 2's four-tab bytes (621 KB) were the stall bug too.

### 10.4 What the numbers say

With its bugs fixed, Accordo is as fast as Yjs or faster everywhere but on an aged thread, uses half the heap, and
keeps every reply next to its question. Yjs wins one thing by a wide margin: **an aged thread's stored size, 8.6x
smaller.** That gap is encoding, not algorithm. Both libraries keep a small marker for every deleted list entry (Yjs
replaces a deleted item's content but keeps the item); Yjs writes those markers in a binary, run-length form, while
Accordo writes each as a JSON row of about 83 bytes. The aged thread holds 10,477 such markers in about 3,400 runs, so
a run-length binary encoding should bring Accordo near Yjs's size. That is an estimate; nobody has built it.

So the choice is not "a proven merge against a weaker one". It is:

- **B, Yjs:** ready now, smaller on disk today, and maintained by others. It costs about 23 KB gz in the chat's lazy
  code, and splits a reply from its question in about 0.2% of concurrent sessions unless the design stores a turn (a
  question and its replies) as one `Y.Map` (unmeasured).
- **A, Accordo:** zero dependencies and general-purpose, faster on fresh threads and lighter in memory, with perfect
  reply placement in this gate. Before it could ship it needs a compact encoding (round 4), and an audit of rounds 3
  and 4. Each of the first two rounds passed this gate as it stood and still had defects an auditor found, so the
  maintenance and review cost is the real price of A.

**Recommendation: still B (Yjs)**, now for the honest reason: the storage gap is real today, closing it is unbuilt
work, and two audits in a row found defects in our own merge after it passed every test we had. If the owner prefers
to own the library (the rule for this repo's other in-house libraries), round 4 is the compact encoding plus an
audit; the gate, the mutants and the benchmarks here are ready to judge it.
