# `followups.d/` — pending work that has no issue

**Every item a continuation brief leaves pending gets a file here, unless it already has
an issue.** The brief on a PR comment and in chat still gets posted. This file is the copy
that lives in the repo, so the work survives the session that found it.

**Only off-path work comes here** (HARD RULE #18). A defect on the path of the change that
found it is fixed in that change, and "on the path" includes the surface the change teaches
or lints and anything the owner hits while testing the PR. When unsure, it is on the path.

## Why this exists

A continuation brief tagged an unticketed item `[no ticket]` and treated the brief itself
as the spec. That brief lived in a PR comment and in a chat transcript, and nowhere a
session reads by default. In the two months to 2026-09-22, 29 of 506 merged PRs left
**79** such items in their final brief. The handoff-issue rule (#2215) was meant to catch
them, and 4 handoff issues were filed after it landed. A script copied those items here
verbatim, **without re-checking them against `main`**. A triage pass on 2026-09-24
checked all 79: it deleted 28 that were done and 6 duplicates, and kept 45. Each kept
file says so in a `Triaged 2026-09-24` line under its title. The `backfill: true` flag
and its warning in `npm run followups` stay in place for any future bulk import.

The backfill is complete for the tag. `[no ticket]` was coined in #1775 on 2026-08-23,
and the harvest window starts 2026-07-22. 33 merged PRs ever used the tag: 29 gave items,
#1775 only defines it, and on #2229, #2269 and #2300 a later brief on the same PR replaced the untracked items.
Deferred work mentioned in free prose before the brief existed is not harvested.

`area`, `severity` and `swimlane` were added on 2026-10-07, and one pass filled them in on all
215 items. It found one duplicate, the Studio export's CSS counters on both #2321 and #2556,
which #2587 then fixed, so both files are gone. The pass read each item's title, `why now` and
`where`, and took the swimlane from the decision doc the origin PR changed. It did not
re-check any item against `main`. A severity from that pass is a starting point, so change it
when the work shows it is wrong.

## The contract

One file per item:

```
followups.d/<origin-pr>-p<n>-<slug>.md
```

- **`<origin-pr>`** — the PR whose brief left the item pending.
- **`p<n>`** — the item's priority in that brief.
- **`<slug>`** — lower-case `[a-z0-9-]`, a few words of the title.

One file per item, rather than one shared ledger, for the reason `changelog.d/` exists:
two PRs in flight never edit the same region, so neither gets ejected from the merge
queue on a conflict.

```markdown
---
origin: 2311
priority: P1
recorded: 2026-09-22
area: chart
severity: high
swimlane: engineering/decisions/2026-09-24-six-state-marks.md §3
deferred: large — needs the six-state model in every chart first
source: https://github.com/Laticent/lattice/pull/2311#issuecomment-…
---

# kanban accepts a status word it then cannot paint

why now   — …
where     — …
done when — …
evidence  — …
verify    — …
```

The five fields are the brief's own (`engineering/workflow.md` §The continuation brief),
so copy the item across as the brief states it.

The front matter says where an item sits and how much it matters, so a reader can pick it
without opening the PR that left it:

| Field | Required | What it holds |
|---|---|---|
| `origin` | yes | The PR whose brief left the item. Must match the file name. |
| `priority` | yes | `P<n>`, the item's position in that brief. Must match the file name. It ranks items within one brief, so a P1 from a two-item brief and a P1 from a ten-item brief are not comparable. `severity` is the field that compares across briefs. |
| `recorded` | yes | `YYYY-MM-DD`. |
| `area` | yes | One `area:*` label name from `.github/labels.json`, without the prefix (`engine`, `chart`, `website`, …). The same word the issue would carry. |
| `severity` | yes | `high`, `medium` or `low`: the `priority:*` words an issue uses, so promotion maps 1:1. `critical` is refused. "Drop everything" needs a board column and an owner, so file an issue instead. |
| `swimlane` | yes | The governing doc, as the repo path of a file that must exist, optionally followed by a section: `engineering/decisions/x.md §8.1`. Without it, "the runbook is note §8.1" leaves the reader nothing to find. Renaming or deleting a doc that an item names fails `build:check` until the item is updated, which is the point: the pointer must not go stale. |
| `deferred` | yes, for items recorded on or after 2026-10-29 or with an origin PR above #2952 | Why this was not done in the PR that found it: `large — <why>`, `blocked — <what it waits on>` or `off-path — <the surface>`. See §Why it was not done now. |
| `source` | no | A link to the brief. |

How to pick `severity`:

- **high** — a defect on a shipped surface a user reaches, something broken on `main`, a
  security exposure, or the one unverified claim a shipped feature rests on.
- **medium** — a real defect on a narrow path, a missing gate on code that has already
  regressed, or a verification gap on a secondary surface.
- **low** — polish, refactors with no user-visible change, decisions nobody is blocked on,
  and feature ideas.

The file also needs a `#` title outside any code fence and a line starting `done when —`.
A `backfill: true` file is exempt from the `done when` line, because one backfilled brief
predates that field and the copy is kept verbatim. `checkFollowups` in
`tools/check-ownership.js`, via `build:check`, fails on a missing or invalid field. The
format is defined once, in `tools/followups.js`.

## Why it was not done now

A follow-up is a deferral, and HARD RULE #18 allows exactly three:

- **`large`** — it does not fit this PR: a new subsystem, a migration, a redesign, or
  work that would double the diff. "Would take an hour" is not large.
- **`blocked`** — it waits on something outside this repo or outside the agent's reach: an
  upstream fix, an owner decision, a secret.
- **`off-path`** — the change that found it does not touch, teach or lint that surface. Name
  the surface. When unsure, it is on the path, and on-path work is fixed now.

Small or moderate work, jank the change made visible, and broken windows it touched do not
get a file: they get fixed in the PR. Before this field, 161 items were filed in the 14 days
to 2026-10-28, most of them small (`engineering/decisions/2026-10-28-raise-before-ask.md`).
`checkFollowups` refuses a new item without the field. It checks the shape only. Whether
`large` is true is for the checker that grades the pre-merge card, which reads the card's
`left behind` row.

Items recorded before the rule are exempt by date **and** origin PR, so the old ledger is not
rewritten.

## The lifecycle

- **Add** the file in the same PR whose brief leaves the item pending.
- **Delete** the file in the PR that finishes the item, or that finds it already done,
  with its evidence folder if it has one. If a handoff issue lists the item, tick its box
  in the same PR. The deletion is the record, as a closed issue would be.
- **Promote** an item to an issue when it needs a board column, an owner or a
  discussion. Delete the file and its evidence folder in the same PR, link the issue to the
  folder at the last commit that held it, and tag the brief `[#N]` from then on.

`npm run followups` lists every item, one line each, grouped by area and sorted by
severity. `npm run backlog` lists these together with the open issues in
[`backlog.d/`](../backlog.d/README.md), and filters by `--area` and `--min <severity>`.
Run it at the start of a session.

## Evidence folders

An item can carry the code and data behind its findings: the probe that measured a number,
the script that reproduced a bug, the fixture a fix will need. They go in a folder named
like the item without `.md`, beside it:

```
followups.d/2871-p1-fuzz-test-the-web-reference-scanners.md
followups.d/2871-p1-fuzz-test-the-web-reference-scanners/
  README.md        what this holds, the commit it ran against, how to run it
  probe.mjs
```

Before this, that code lived in the session's `.scratch/`, which disappears with the
container, so an item that said "measured 23 bypasses" left the next session nothing to
re-run.

- **It lives exactly as long as its item.** The gate refuses a folder whose item is gone, so
  the PR that deletes or promotes an item deletes its folder too.
- **A `README.md` is required.** It names the commit the evidence ran against and how to run
  it. The code is a snapshot, not maintained: it may stop running as `main` moves, and the
  commit says against what it was true.
- **Text only, 512 KB at most.** Scripts, fixtures, small data and notes, not screenshots,
  archives or the corpus a probe ran on. A file is text when its first 8 KB hold no NUL
  byte. No symbolic links: evidence is a copy, not a pointer.
- **Every gate reads it.** Its scripts pass Biome like any tracked JavaScript, and its prose
  passes the US-English audit. The lint-exclusion rule (`biome.jsonc`, #1223) admits only
  vendor, generated and unparseable code, and evidence is none of those.
- **Nothing for an unfixed vulnerability.** The repository is public. A working exploit goes
  in only once its fix has merged. Before that, describe the class of the problem and keep
  the payloads out of the tree.
- **Code that proves generally useful graduates.** Move it to `tools/` with a row in
  `dist/engineering/capabilities.md` (HARD RULE #15), and delete it here.
- **It is never imported.** Nothing in `lib/`, `tools/`, `test/` or CI may require a file from
  an evidence folder: when the item closes, the folder goes, and anything leaning on it
  breaks.

`checkFollowups` (via `build:check`) enforces the name, the item, the README, text only, no
links and the cap. It reads a folder as git does: a file `.gitignore` excludes (a `.DS_Store`) is
not evidence, so it neither fails a folder nor keeps an orphaned one alive. The rest is
discipline.

## What the gate cannot do

It checks the shape of the files that exist, and that `area` and `swimlane` name real
things. It cannot tell whether a severity is right. It cannot read a chat, so it cannot tell
that a brief left an item out. That half is still discipline, on the author of the brief.
