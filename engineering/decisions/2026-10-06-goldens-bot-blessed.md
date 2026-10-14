---
status: in-progress
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
- **What:** `tools/golden-bless.mjs` on current `main`. It checks every golden
  (`regression-gate.mjs --scope all --json`), then re-blesses ONLY the ones that drifted:
  a gallery by name, a deck by path. A blanket `--bless` would rewrite every golden
  blessed on another machine, burying the few real changes in byte churn. A gallery bless
  rewrites both moods, so the tool puts back the mood that did not drift, and the commit
  holds exactly the goldens that moved. Tested on the real `legal` (both moods drifted,
  2 re-blessed, both pass the gate after) and `comparison` (light only, 1 kept, 1 put
  back) galleries. Rendering committed deck markdown that has no PDF yet (a feature deck
  merged during the day) lands with step 3, the change that stops PRs committing them.
- **How it lands:** the `sync-backlog.yml` shape. Push `chore/golden-bless` with
  `AUTOMATION_PAT`, open or update one PR, and post `golden-diff`'s before/after montage
  on it. That montage is the regression gate's replacement: one page a day showing what
  moved on `main`, which a human can actually read.
- **Merge: a hybrid, decided by the owner on 2026-10-07.** The bot auto-merges a night's
  bless only when all four rules hold; otherwise it labels the PR `golden-review` and
  waits for a person, with the montage showing what moved.
  1. **No page count changed.** A deck that gains or loses a slide is never small. As
     built, this also catches a page that changed SIZE: the pixel measure cannot compare
     two pages of different sizes and scores them as 0% moved, so rule 2 alone would
     pass one.
  2. **No page moved more than the pixel threshold.** Starting value about 1% of a page.
  3. **At most a handful of goldens changed.** Starting value about 10. A base-style
     change that moves 150 galleries is worth a look even if each page moved little.
  4. **Every changed golden was already shown to a reviewer.** Each merged PR's CI posts
     the before/after for the goldens its diff could affect (§2.2). A golden that moved
     overnight with no merged PR's before/after covering it changed unseen, so that
     night needs a person.

  Rule 4 is the one that makes the hybrid safe. Size alone is a weak signal: the 2026-08-18
  note recorded a real, plainly visible drift that scored 0.26%, while some decks drift
  4–9%.

  `tools/lib/golden-bless-verdict.mjs` scores the four rules on what the bless actually
  WROTE, not on what the check reported, so a bless that failed is never counted as done.

  **How rule 4 knows what a person saw.** `golden-diff` ends every PR comment with a
  hidden `golden-diff-changed` marker listing each golden it showed as changed. The bot
  reads that marker on every PR merged since the last bless and counts a golden as seen
  only if a PR a person authored listed it. Bot PRs (Dependabot), the PAT-opened machine
  PRs (`release: v…`, `chore(backlog): …`, the bless itself) and reverts never count:
  each merges with nobody looking, or would undo a person's decision. The window starts
  at the commit the last MERGED bless rendered from, which its PR title names
  (`chore(goldens): nightly bless of <sha>`), not at the merge, so PRs merged while the
  bless PR waited are still counted. With no merged bless yet, nothing counts as seen,
  so the first night always needs a person.

  The first version replayed the per-PR path mapping instead, and the adversarial trio
  showed that was not the same thing: any PR touching a shared file (6 of the 7 days in
  the sample) marked the 20 highest-coverage galleries "seen", and so did a Dependabot
  bump that no person reviewed. "Could have rendered" is not "was shown".

  A golden the gate could not check, a bless that failed, and a PR whose comments could
  not be read all force a "no". A failed bless also turns the nightly run red.

  **The first run (2026-10-07, dispatched by hand) crashed** after 68 minutes of checking:
  the bot read the gate's `--json` report from a pipe, and the gate's `process.exit()` cut
  it off at 146,176 bytes. The bot now reads the gate's `report.json` file, and the gate
  drains stdout before exiting.

  **Files derived from goldens ride in the bless commit.** The docs landing page's showcase
  WebPs are cut from gallery PDFs, and docs-build fails when a source PDF changes without
  them: the first bless PR (#2598, 296 goldens) went red on it. The bot reruns
  `rasterize-showcase.mjs` and keeps only the WebPs whose gallery it re-blessed. On a night
  that large, golden-diff's PR job also runs out of time comparing every committed PDF;
  the verdict comment links the run whose artifact holds the check's own montages.

  **The first week is a dry run.** The bot opens its PR and comments "would auto-merge:
  yes/no, and why" for each rule, but merges nothing. After a week of real nights, the
  thresholds in rules 2 and 3 are set from that data, recorded here, and auto-merge is
  switched on. No bot has produced this data yet, so the starting values are guesses
  until then.

  This makes the bless bot the fourth machine PR class that can merge itself. CLAUDE.md
  rule 7 names the other three, and gets the fourth added in rollout step 3, with the
  hybrid rules stated.
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

**Except when the PR changes dependencies.** The base render shares the PR's
`node_modules` and Chromium, so a dependency bump renders the same on both sides and
attribution would call everything it moved "stale on main", with no picture. On a PR that
changes `package-lock.json`, or changes a `package.json` key outside a short inert list, a
golden that differs from `main`'s PDF is shown as changed, with a note saying why. The inert
list (`scripts`, `description`, `keywords` and the other metadata keys in
`tools/lib/golden-affected.mjs` `PACKAGE_JSON_INERT_KEYS`) exists because #2583 added one
npm script and its comment listed 46 changed slides the PR could not have moved. A
`scripts`-only edit is not a render input at all, so it neither widens the render scope nor
skips the base render. The list is an allowlist, so `version` (which `lattice-emulator.js`
reads) and any key nobody listed still count.

**Feature decks (HARD RULE #9).** CI renders a PR's new or changed decks and publishes the
PDFs to the existing `ci-drift-images` orphan branch, which already hosts the montages. The
PR comment links them. The reviewer still opens a PDF from the PR, and the nightly bless
commits it to `main` after the merge.

### 2.3 Enforcement

- **A PR may not change a tracked PDF.** One check: the PR's diff against its base
  contains no `*.pdf`, except on `chore/golden-bless`. **It runs inside the existing
  `lint` job** (owner, 2026-10-07): about a second, and no new job on the PR page.
- **Pre-commit `pdf-rebuild` stops staging PDFs.** It may still render to `.scratch/`
  for local preview. This is a hook change.
- **Text that changes meaning.** These pass for HARD RULE #9 itself and for the docs
  that repeat it:
  - **HARD RULE #9's new wording**, approved by the owner on 2026-10-07: "…ships a
    per-feature demo deck `examples/<slug>.md` (6–10 slides); CI renders its PDF and
    links it on the PR, and the nightly bless commits it to `main`."
  - CLAUDE.md's "The final PR commit includes all rebuilt PDFs" is removed.
  - `workflow.md` § Feature decks and the `bless` guidance in
    `engineering/development.md` change to match.

## 3. Cost, measured

**The full gallery scope, measured.** `node tools/regression-gate.mjs --scope galleries`
on `main` at 9b46f54, in the 4-core cloud sandbox, rendered and pixel-diffed 89
gallery decks × 2 moods = 178 goldens, 1,982 pages, in **1,614 s (27 min)**. 174 were
current and 4 had drifted (`layout` and `rows`, worst page 0.08–0.27%).

What that means per pull request:

- **A PR that touches one component** renders 2 to 4 goldens: its gallery and its
  bucket gallery, in both moods. That costs seconds, in line with `golden-diff`'s
  measured 272 ms per golden page.
- **A PR that touches anything shared** would have to render every gallery, which at 27
  minutes is too slow for one job. So the PR job renders at most 40 goldens (bucket
  galleries first, since each samples every component in its bucket), lists what it
  left out, and leaves the rest to the nightly bless. **Measured on GitHub's runners**
  (PR #2570, job 112604518207): the full 40-render cap, plus base renders for the ones
  that differed from `main`, took 4m34s, and the whole job 6 minutes. That is shorter
  than `integration` beside it, so it adds no wall-clock time to a PR. It reported the
  same 17 goldens stale on `main` as the sandbox run did, so attribution holds across
  machines.
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
2. `golden-bless.yml`, the nightly bot, in dry-run mode: it opens the PR and reports the
   four rules, but never merges.
3. The no-PDF-in-PR check (in `lint`), the pre-commit change, and the rule and doc text.
4. After a week of dry-run nights: set the rule 2 and 3 thresholds from the data and
   switch the hybrid auto-merge on.

Step 3 lands only after step 2 has blessed `main` once, so the first PR under the new rule
compares against a fresh baseline. That makes it a separate PR: the bot reads
`AUTOMATION_PAT` from an environment only `main` can use, so it cannot run before #2570
merges. Steps 1 and 2 ship in #2570; steps 3 and 4 are recorded in `followups.d/2570-*`.

**Step 3, as built** (branch `claude/goldens-step3-no-pdf-in-prs`, after the first bless,
#2598, merged on 2026-10-08). Taking PDFs out of pull requests needed more than the check
and the hook, because several things assumed every deck already had a committed PDF:

- **The check:** `tools/check-no-pdf-in-pr.mjs` in the `lint` job, `pull_request` runs
  only, the bless branch exempt when it is in this repository. Deleting a PDF is allowed,
  so a PR that removes a deck removes its PDF and `build:check` finds no orphan.
- **The hook:** pre-commit `pdf-rebuild` is gone. `tools/build-staged-pdfs.js` keeps
  `classify()` (which markdown should have a PDF) and gains `buildFor()`.
- **The bot renders what does not exist yet:** a deck or gallery merged without a PDF,
  found by `classify()` over the tracked markdown, and the generated showcase decks only
  the old hook ever rebuilt. It stages new files (`git status` / `git add -A`). Its
  verdict scores a first-time golden as new: no before for rules 1 and 2, but it counts
  toward rules 3 and 4.
- **A PR shows its new deck:** golden-diff renders a changed deck that has no PDF,
  publishes the PDF beside the montages, links it, and lists it as shown for rule 4.
- **Nightly tests:** three integration tests assert on committed PDFs. They now excuse a
  failure only while the PDF is waiting on a bless (its sources changed after the last
  merged bless; `test/helpers/golden-pending.js`), so a correct PDF is still asserted.
- **What the adversarial trio changed before merge** (#2614): the bless re-renders the
  generated showcase deck from history, because its builder only sees uncommitted inputs
  and would never render on a clean checkout; first-time renders run one source at a
  time, 40 a night, and a deck that will not render turns the night red after the bless PR
  opens rather than blocking it; the pending excuse dates the bless by the commit it
  rendered from and expires after 3 days, so a bless PR left unmerged turns the nightly
  red; the check exempts the three PDF families the bless never writes
  (`prCommitted` rows in `PDF_OWNERSHIP`) and matches `.pdf` in any case; `design/`
  demo decks render on their PR and can be committed by the bot; a new golden whose PDF
  was not published is not counted as shown.
- **Left as a documented edge:** a new component flagged for the docs landing-page
  showcase fails docs-build until its first bless, because the showcase image is cut from
  the gallery PDF. Set the flag in a follow-up PR (`design/skills/component.md`).

**Step 4, the dry-run week as measured (2026-10-14).** Step 4 is **not switched on**, and
the week cannot set the thresholds yet. The six nights since the first bless merged, rebuilt
from each run's `golden-bless` artifact by `node tools/golden-bless-nights.mjs --since 2026-10-09`:

| Night | Rendered from | Changed (new) | Worst page | Rules 1234 | Would merge | Delta (new to the night) | Delta worst | Delta rules 1234 | Delta would merge | Person: accept unseen? |
|---|---|---|---|---|---|---|---|---|---|---|
| [2026-10-09](https://github.com/Laticent/lattice/actions/runs/37898391359) | `b88174e7d094` | 6 (1) | 6.58% | ynyn | no | 6 | 6.58% | ynyn | no | |
| [2026-10-10](https://github.com/Laticent/lattice/actions/runs/38032839661) | `3bea7ebf6321` | 6 (1) | 6.58% | ynyn | no | 0 | 0.00% | yyyy | nothing new | |
| [2026-10-11](https://github.com/Laticent/lattice/actions/runs/38120190315) | `3bea7ebf6321` | 5 (1) | 1.06% | ynyn | no | 0 | 0.00% | yyyy | nothing new | |
| [2026-10-12](https://github.com/Laticent/lattice/actions/runs/38216907527) | `0daeed46d2b9` | 10 (4) | 1.06% | ynyn | no | 5 | 0.12% | yyyy | yes | |
| [2026-10-13](https://github.com/Laticent/lattice/actions/runs/38364025485) | `4b0eef099312` | 22 (12) | 1.06% | ynnn | no | 12 | 0.45% | yynn | no | |
| [2026-10-14](https://github.com/Laticent/lattice/actions/runs/38520115577) | `2cd68f6aef15` | 25 (13) | 88.11% | nnnn | no | 3 | 88.11% | nnyy | no | |

The DELTA columns score only the goldens a night added to the open bless PR. That is what
the night would have said had the previous bless been merged (`tools/lib/golden-bless-nights.mjs`).

What the week shows:

- **No night could have merged, and the cause is the unmerged PR, not the rules.** The bless
  PR #2624 opened on 10-09 and was still open on 10-14. Until a bless merges, rule 4's window
  stays at `6592eaa` (bless #2598) and each night re-blesses every earlier night's goldens.
  So the four goldens that went unseen on 10-09 failed every later night too. Scored alone,
  10-12 would have merged: 5 goldens, worst page 0.12%, all shown on #2625, #2628 and #2632.
  10-10 and 10-11 added nothing.
- **Goldens went unseen in three ways, each traced to its PR.**
  1. *A deck edit that golden-diff could not compare.* #2601 changed the text of
     `fluid-box`, `html-player`, `palette-cascade-flip` and `present-mode`. Its golden-diff
     rendered 47 goldens, failed 23 base renders, and reported "No visual changes" with an
     empty marker. That was before step 3, and golden-diff now posts the decks a PR moves:
     #2625, #2628, #2632, #2645, #2656 and #2674 each listed theirs.
  2. *A shared change that moves a deck the PR never touched.* `hub-spoke`, `hub-spoke-icons`,
     `hub-spoke-sketch` and `marp-export-fidelity` moved between `0daeed4` and `4b0eef0`.
     The window holds two shared changes whose golden-diff rendered galleries only and listed
     nothing: #2638 and #2651. That matches the design, because `golden-affected` never
     renders a deck whose only change is a shared input. Such a night always needs a person.
  3. *A first-time component gallery.* The collage gallery (#2635, #2658) was in neither
     PR's marker. Step 3 shows a PR's new DECK, but not its new gallery, so every new
     component makes one night wait for a person.
- **`themes/palette-audit.pdf` does not render the same way twice.** It flips between two
  states, unchanged or exactly 6.58% moved: one of the two runs that rendered `6592eaa` saw
  each, and so did 10-10 and 10-11, which rendered the same commit (`3bea7eb`). On a night with no other change, rule 2 would hold that night back
  for nothing. Recorded as `followups.d/2570-p2-palette-audit-nondeterministic.md`.
- **Nothing in the week moves the guesses**, so rule 2 stays at 1% and rule 3 at 10. No
  person has labeled a night (item (a) of the step 4 follow-up). Only two deltas carried a
  re-blessed golden a person had seen: the logo galleries at 0.11–0.12% (#2628), and the
  imagery gallery, which gained a page (88%, #2658) and fails rule 1 anyway. Rule 3 counts
  first-time goldens too. On 10-13 the delta was 12, and 10 of them were new decks a person
  had seen, so on a busy day rule 3 will say no to work that is new rather than changed.
- **Runner pinned (item (c)).** `golden-bless.yml` and ci.yml's `golden-diff` job now run on
  `ubuntu-24.04`, which is what `ubuntu-latest` resolved to on 10-14. So a new OS image has to
  land as a PR that moves both jobs. GitHub's weekly patch updates within 24.04 still apply.

**What step 4 needs before it can finish:** a person merges #2624 (or closes it, and the
next night opens a fresh one), so that the nights become independent. Then a week of nights,
each labeled in the table's last column. `golden-bless-nights.mjs` rebuilds the table at any
time while the artifacts last (90 days). Items (b), (d), (e), (f) and (g) of
`followups.d/2570-p2-goldens-step-4-switch-on-auto-merge.md` stay open for the PR that
switches auto-merge on.

## 6. Decisions (owner, 2026-10-07)

| Question | Decision |
|---|---|
| Does the bless PR merge itself? | **Hybrid:** auto-merge only when the four rules in §2.1 hold, after a one-week dry run sets the thresholds |
| Where does the no-PDF-in-PR check run? | **Inside the `lint` job** |
| HARD RULE #9 wording | **Approved** as quoted in §2.3 |
