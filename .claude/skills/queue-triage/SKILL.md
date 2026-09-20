---
name: queue-triage
description: >
  Triage the whole open issue queue by COST OF DELAY, not by swimlane — then write the
  pass up as a dated note and put every label change to the owner in one batched round.
  Use when the backlog has grown past the point where `priority:` means anything, when
  asked to "go through the issues", categorize/prioritize them, or produce a cross-cutting
  view of one theme (jank, a11y, security) whose cards sit under many different `area:`
  labels. NOT for filing or grooming a single card, and not for the Definition-of-Ready
  sweep — that is issue #2213 and `npm run audit:queue`.
---

# Queue triage — reading 300+ cards by what they cost

**The problem this solves.** The board's four axes (`area:` · `type:` · `priority:` ·
`status:`) answer *which column a card sits in*. None answers **what this card costs
while it stays open**, which is the only question a triage pass is for. Measured
2026-09-20: `priority:medium` held 157 of 317 open cards — half the board, therefore
no signal — and 30 cards in the three most expensive classes were labeled to sort to
the bottom of a queue their class puts near the top.

The first pass is `engineering/decisions/2026-09-20-issue-queue-triage.md`. **Read it
for shape, not for its answers** — see *Do not inherit the classes* below.

---

## Run order

**1 · Fetch the queue to disk.** Everything downstream reads one file.

```
# with gh (not available in the cloud sandbox):
gh issue list --state open --limit 1000 \
  --json number,title,body,labels,createdAt,comments > /tmp/q.json

# in the cloud sandbox: paginate the GitHub MCP's list_issues with
# fields [number,title,body,labels,created_at,comments], orderBy CREATED_AT ASC,
# perPage 100, following pageInfo.endCursor; merge the pages by number.
```

**Two traps here, both of which cost the first pass real accuracy:**

- **A page small enough to fit comes back INLINE, not saved to a file.** The big pages
  overflow and get written to disk, which is convenient; the last, short page does not.
  The first pass lost 17 of 317 bodies to exactly this and could not run
  `audit:queue` as a result. Capture every page, including the short one.
- **Confirm the count against `BACKLOG.md`'s own header and the API's `totalCount`**
  before analysing anything. Three sources agreeing is cheap; discovering a truncated
  fetch after you have classified 300 cards is not.

**2 · Run the machine half first.** It is seconds, and it hands you findings you would
otherwise spend an hour re-deriving:

```
npm run audit:hygiene -- --input /tmp/q.json    # strays, gaps, dupe leads, alarm saturation
npm run audit:queue   -- --input /tmp/q.json    # the Definition-of-Ready tally
```

`audit:hygiene`'s dupe arm is a **lead generator with ~14% precision** — on the queue
it was built against, 2 of 14 pairs were real, and the top-scoring row was a false
positive. **Read all of it; rank order carries no information about truth.** Its own
docblock explains why that cannot be tuned away. Open both cards on every pair.

**3 · Read every card's title and body, and assign each to exactly one class.** This is
the part no tool does and the part that is worth the session. Classes below.

**4 · Prove coverage before you trust a count.** Write a throwaway checker that asserts
every open number lands in exactly one class, that no class double-assigns, and that no
class cites a closed or non-existent issue. The first pass caught its own gaps this way
(13 unassigned, 5 stale references) before publishing a single number. Keep it in
`.scratch/`; it verifies arithmetic over a hand-written list, and the list is the
artifact.

**5 · Write the dated note**, `engineering/decisions/YYYY-MM-DD-issue-queue-triage.md`,
`status: proposed`. Structure that worked: the answer first · how the numbers were
derived · the class table ordered by cost · where label priority disagrees with the
class · the cross-cutting view · defects in the queue itself · what needs the owner ·
the full one-row-per-card table.

**6 · Put every label change to the owner in ONE round, then apply and verify.** See
*The gate* below.

---

## The classes

Eight defect classes ordered by cost of delay, then feature tracks for the tail. The
ordering argument, one line each:

| | class | why it sits here |
|---|---|---|
| **A** | red on `main` | Every branch that runs the gate inherits the failure. A broken window that already shipped (#18). |
| **B** | security + privacy | Unbounded blast radius; an exported file cannot be recalled. |
| **C** | silent wrong output | The artifact is wrong and nothing tells anyone — the only failure mode with no feedback loop. |
| **D** | accessibility + contrast | A reader who cannot read the slide is a reader lost; several are measured sub-AA today. |
| **E** | a named cross-cut (jank, …) | Whatever theme the owner asked about. See below. |
| **F** | blind instruments | A gate that reports green without looking manufactures the confidence that lets A, C and D accumulate. |
| **G** | verification debt (#23) | Claims honestly marked UNVERIFIED. Often clears in batches — 58 of the first pass's 91 needed one phone. |
| **H** | flaky tests | Each one trains someone to re-run instead of read, which is the road to `--no-verify` (#14). |
| **I–N** | feature / docs / process tracks | The tail, grouped by line of work rather than ranked. |

**Do not inherit the classes.** These were fitted to one queue on one day. A month on,
"red on `main`" may be empty and something else may deserve its own class. A pass that
starts from this table will confirm the old shape instead of seeing the new one — so
re-derive the classes from what the cards actually say, and treat the table as a prior
worth arguing with. If a class comes out empty, say so; that is a result.

**The most valuable output is the disagreement**, not the classification: the cards
whose `priority:` label routes them opposite to where their class puts them. Lead with
that list.

---

## The cross-cutting view

When the owner names a theme, give it its own section — and make it **a lens, not a
partition.** § 6 gives each card one class; a view has no reason to obey that, and
forcing it to hides the cards that are two things at once. The first pass's jank view
carried 17 primary cards plus one whose primary class was elsewhere, and said so.

A theme earns its own view when its cards sit under several `area:` labels (so no board
filter collects them) or when its **instrument is younger than its defects** — jank's
tooling shipped in September 2026 and its oldest card was filed in June, so most of it
was found by eye before there was a way to measure it.

**For jank specifically**, `engineering/jank.md` is canonical and the modes are its own:
rig · drift · collision · crowding · re-solve. Two things from it that a reader will
otherwise get wrong:

- **Rank the census from BOTH ends.** It sorts by travel, which buries the collision
  archetype: a mark that holds *perfectly* still while content grows into it reads as
  `0px` and looks like the cleanest row on the page.
- **Fix the instrument's false positives before sweeping with it.** 20 verdicts measured
  through a known false positive are 20 results nobody trusts, and `jank.md`'s own line
  is that crying wolf is the more corrosive failure mode.

---

## The gate — label writes are never yours

**CLAUDE.md's second filter, row 1.** Issue labels, milestones and board columns are
shared state other sessions read, so every write goes to the owner first, batched into
**one** `AskUserQuestion` round with a recommendation per item. This rule exists because
a session once labeled 60 issues `status:ready` when the brief said ~12.

Then, once approved:

- **`issue_write`'s `labels` field REPLACES the whole set.** It is not a delta. Compute
  each card's full target label set and send that, or you will silently strip `status:`
  and `area:` from every card you touch. Derive the sets programmatically from the
  fetched JSON and print the plan before sending it.
- **Verify after the fact.** Re-read the queue and assert the writes landed and nothing
  was lost. The first pass re-read all four pages and checked that no card had lost an
  `area:`, `type:` or `status:`.
- **Record the writes in the note**, because **a label change leaves no diff anywhere in
  the tree.** The note's "what was applied" section is the only audit trail that will
  ever exist. List each card, so the writes can be undone one at a time.
- **Keep the note's per-card table at its PRE-write values.** It is the evidence the
  changes were argued from; refreshing it erases the argument. State which of its own
  rows the writes made stale.
- **Some approved things may not be doable from here.** This environment cannot delete a
  GitHub label — no MCP operation for it, no `gh`. When that happens, say plainly which
  approved action is outstanding and what command finishes it. Do not let it read as done.

---

## Gotchas that cost the first pass time

- **A hook's ✔️ is NOT proof the job ran — read the duration.** `lefthook` prints a
  green tick for a job that *skipped* and for one that passed, identically. The first
  pass shipped an evidence line claiming the pre-push integration tier ran green, from
  this output:

  ```
  ✔️ unit-tests (129.13 seconds)
  ✔️ integration-tests (0.01 seconds)
  ```

  Nothing runs a ~4.5-minute render tier in 10ms. That job is **opt-in behind
  `LATTICE_FULL_PUSH=1`** and skipped; `lefthook.yml`'s own comment says so. The claim
  reached a merged PR body and a pre-merge card before anyone caught it, in a PR whose
  subject was claims nobody re-derives. **Before citing any gate as evidence, name where
  it ran and check that its duration is physically possible for the work it claims to
  have done** (#23). `export LATTICE_FULL_PUSH=1` if you want it locally; otherwise cite
  CI's `integration (node 22)`, which is the required gate and really does run it.
- **Never wrap `git push` in a short `timeout`.** `lefthook`'s pre-push runs lint ·
  `lint:deck:all` · `build:check` · docs-typecheck · unit (~130s) — and integration only
  when `LATTICE_FULL_PUSH=1`, per the entry above. A 115-second cap killed the first push
  mid-hook and looked like a failure.
- **`npm run audit:queue` needs issue BODIES**, because the Definition of Ready lives in
  the body's headings. A label-only fetch cannot feed it.
- **Regenerate `engineering/decisions/README.md`** (`npm run decisions:index`) and add a
  `changelog.d/<slug>.added.md` fragment (#10) in the same change.
- **The note is a dated snapshot, not a second mirror.** `BACKLOG.md` is the living
  view, regenerated nightly by `sync-backlog.yml`. Say so in the note, or the next
  reader will treat a month-old table as current.

## Related

- `tools/audit-queue-hygiene.js` — the machine half; its docblock holds the dupe arm's
  measured precision and why it cannot be tuned further.
- `tools/audit-queue-dor.js` · `npm run audit:queue` — the Definition-of-Ready half.
- `engineering/workflow.md` § Work queue — labels, the intake bar, the card lifecycle.
- `engineering/decisions/2026-06-14-github-project-management.md` — the kanban model.
- Issue **#2213** — the standing sweep of the grandfathered cards. Check it before
  proposing anything about the Definition of Ready; it probably already owns it.
