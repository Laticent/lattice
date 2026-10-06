---
status: proposed
summary: >
  Pull requests stop committing PDFs. A nightly bot PR is the only writer of committed
  goldens on main, and CI shows each PR's visual change by rendering the goldens its diff
  can affect and pixel-diffing them against main's committed PDFs. Why: PDFs were in 11 of
  19 real merge conflicts in the week to 2026-10-06, one base-style commit rewrote 478 of
  them, and the nightly freshness check has reported 196 of ~350 goldens stale because
  nothing re-blesses the deck half. The visual review diff stays; the committed-golden
  regression GATE, already report-only, becomes the bless bot's own before/after.
---

# Goldens: bot-blessed on main, rendered (not committed) on pull requests

**The owner asked:** every component already owns its markdown and its gallery PDF. Do we
still need golden diffs at all, now that speed matters? The owner picked option A of four
(A bot-blessed baselines, B render-don't-commit, C text snapshots, D no visual diff).

## 1. What the committed PDFs do today, separated

They carry three jobs, and only two of them still work.

| Job | Who uses it | State on 2026-10-06 |
|---|---|---|
| **Catch an unintended visual change** (the regression gate, `npm run regress`) | Nobody acts on it | **Dead in practice.** Report-only in `integration-nightly.yml`. It has reported 196 of ~350 goldens stale since it was turned on (`2026-08-24-golden-corpus-re-bless.md`). |
| **Show a reviewer what a PR changed** (`tools/golden-diff.mjs`) | Every reviewer | **Works**, but only when the PR re-rendered and committed the affected PDFs |
| **A PDF to open or link** (HARD RULE #9 demo decks, 61 component docs) | Reviewers, stakeholders, agents (HARD RULE #6) | **Works** |

What the committed-in-PR model costs:

- **Conflicts.** PDFs were in 11 of 19 real conflicts from 2026-09-30 to 10-06
  (`2026-10-06-conflict-reduction.md`).
- **Churn.** One base-style commit rewrote 478 PDFs. 31 of the last 90 commits on `main`
  touched a PDF, with a median of 5 files per commit.
- **Staleness.** A PR re-renders only what its author remembers to bless. The `--bless`
  default covers galleries, so the deck half rots (184 of 199 decks stale on 08-24).

**The pixel review diff is still worth keeping.** LLM-written changes break how a slide
looks in ways no hand-written invariant asserts. The invariant tier
(`test/integration/invariants/`, 16 files driving real Chromium) catches rule
violations, not "this got worse".

## 2. The design

**One writer.** Only a nightly bot commits golden PDFs. Pull requests never do.

### 2.1 The nightly bless bot (new workflow, `golden-bless.yml`)

- **When:** nightly, and on `workflow_dispatch`.
- **What:** on current `main`, run the bless over BOTH scopes
  (`regression-gate.mjs --bless` and `--scope decks --bless`). Also render any committed
  deck markdown that has no PDF yet (a feature deck merged during the day).
- **How it lands:** the `sync-backlog.yml` shape. Push `chore/golden-bless` with
  `AUTOMATION_PAT`, open or update one PR, and post `golden-diff`'s before/after montage
  on it. That montage is the regression gate's replacement: one page a day showing what
  moved on `main`, which a human can actually read.
- **Merge:** auto-merge through the queue, like the backlog mirror. **Open question for
  the owner** — CLAUDE.md rule 7 names three machine PR classes that auto-merge; this
  would be the fourth.
- **Conflicts:** none. Nothing else writes these files.

### 2.2 Pull requests: render, compare, do not commit

`golden-diff` changes its candidate set from "goldens this PR changed" to "goldens this
PR's diff can affect":

| The PR changes | Rendered |
|---|---|
| A deck's markdown | That deck |
| `lib/components/<bucket>/<name>/**` | That component's gallery, plus its bucket gallery |
| Anything shared (`lib/core`, `lib/base`, `lib/engine`, `themes/`, the CSS build) | Every gallery. Decks wait for the nightly bless. |
| Nothing render-relevant | Nothing |

For each rendered golden, CI pixel-diffs the fresh head render against the base branch's
committed PDF. **Attribution:** `main`'s PDF can be up to a day old, so it may lack
changes merged since the last bless. When a head render differs from `main`'s PDF, CI
renders that one golden at the base commit too, and reports the slide only if the head
render differs from the base render. That doubles the cost only for goldens that moved.

**Feature decks (HARD RULE #9).** CI renders a PR's new or changed decks and publishes the
PDFs to the existing `ci-drift-images` orphan branch, which already hosts the montages. The
PR comment links them. The reviewer still opens a PDF from the PR, and the nightly bless
commits it to `main` after the merge.

### 2.3 Enforcement

- **A PR may not change a tracked PDF.** One check: the PR's diff against its base
  contains no `*.pdf`, except on `chore/golden-bless`. Where it runs is a CI-contract
  change (CLAUDE.md row 2), so it is the owner's call.
- **Pre-commit `pdf-rebuild` stops staging PDFs.** It may still render to `.scratch/`
  for local preview. This is a hook change.
- **Text that changes meaning:** HARD RULE #9 ("+ committed `.pdf`"), CLAUDE.md's "The final
  PR commit includes all rebuilt PDFs", `workflow.md` § Feature decks, and the
  `bless` guidance in `engineering/development.md`.

## 3. Cost, measured

**The full gallery scope, measured.** `node tools/regression-gate.mjs --scope galleries`
on `main` at 9b46f54, in the 4-core cloud sandbox, rendered and pixel-diffed 89
gallery decks × 2 moods = 178 goldens, 1,982 pages, in **1,614 s (27 min)**. 174 were
current and 4 had drifted (`layout` and `rows`, worst page 0.08–0.27%).

What that means per pull request:

- **A PR that touches one component** renders 2 to 4 goldens: its gallery and its
  bucket gallery, in both moods. That costs seconds, in line with `golden-diff`'s
  measured 272 ms per golden page.
- **A PR that touches anything shared** must render every gallery. At 27 minutes that
  is too slow for one job. Split across 4 runners it is about 7 minutes plus setup,
  in parallel with `integration` (~10 min), so it adds little wall-clock time. That
  split is unmeasured on GitHub's runners, and the first step of the rollout is to
  measure it there.
- **Deck goldens** (~200) are left to the nightly bless. The 2026-08-18 note measured
  the full corpus at 78 minutes, a nightly budget rather than a per-PR one.

**What it saves.** No PR commits a PDF, so the 11-of-19 PDF conflicts go. The re-render
that every catch-up on a PDF-touching PR used to need goes with them. And no re-bless
lands inside a PR: the 478-file commit becomes the bot's job.

## 4. What this does not change

- PDFs stay committed on `main`. The component docs links, HARD RULE #6 reads, the
  `dist-kits` publication and `PDF_OWNERSHIP` all keep working.
- The invariant tier, the page-count assertions and the overflow nightly are untouched.
- Text snapshots (option C) stay a possible ADDITION, as `2026-08-18` §8 recommends.

## 5. Rollout, one commit each, in this order

1. `golden-diff` renders the affected goldens and diffs them against base, instead of
   reading the PR's committed PDFs. This works under today's rules too.
2. `golden-bless.yml`, the nightly bot.
3. The no-PDF-in-PR check, the pre-commit change, and the rule and doc text.

Step 3 lands only after step 2 has blessed `main` once, so the first PR under the new rule
compares against a fresh baseline.
