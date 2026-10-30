---
status: proposed
summary: >
  CI is slow because of runner contention, not test speed: about 200 CI runs a day, each asking for ~10 jobs at once,
  against the Free plan's 20 concurrent jobs. Proposal: five named stages (local, PR, queue, nightly, weekly) with one
  job each; a thin PR stage (static checks, unit, site build when the site changes) and the merge queue as the only
  full gate; a test taxonomy defined by what a test may touch; one naming scheme; and a rule that a nightly that is
  red for a week is fixed or deleted. Decisions for the owner at the end.
---

# CI pipeline stages: what runs where, and why (2026-10-30)

**Answer.** The pipeline does not have a test-speed problem. It has a capacity problem and a staging problem.

- **Capacity.** On 2026-10-29 the repository started 149 PR runs and 53 merge-queue runs of `ci.yml` for 21 merged
  PRs. That is about 10 CI runs per merged change, each asking for about 10 jobs at once and using about 90
  runner-minutes. The Free plan runs 20 jobs at a time. At the morning peak, jobs waited a median 11–22 minutes for a
  runner, so a queue run that needs about 20 minutes took about 65, and the queue's 60-minute timer ejected PRs that
  had only been waiting.
- **Staging.** The PR run and the queue run do nearly the same work. The PR run is meant to give the author fast
  feedback; the queue run is meant to prove the combined change before it lands. Today both run the full render
  tier, so every change pays for its slowest tests about ten times.

The proposal: five stages, each with one job to do, a PR stage cut to about half its current cost (about 40% once the Studio nightly is green), and the
merge queue as the only place the full suite has to pass. Four decisions are the owner's (§9).

## 1. What is wrong today (measured)

| Measure | Value | Source |
|---|---|---|
| Concurrent jobs allowed | 20 (Free plan, owner confirmed) | GitHub plan |
| PR runs per day | 99–156 on most days from 10-15 to 10-29 (74 on 10-15; 14–86 over the 10-22 to 10-26 lull) | Actions API |
| Queue runs per day | 9–34 from 10-15 to 10-27; **36 on 10-28, 53 on 10-29** | Actions API |
| Merged PRs per day | 4–28; 28 on 10-19 and 10-28, 21 on 10-29 | Actions API |
| Runs of all workflows per day | 687–1,439 (CI is about 200 of them; the rest are short housekeeping and CodeQL runs) | Actions API |
| CI runs per merged PR | about 10 (10-29: 202 runs, 21 merges) | derived |
| Runner-minutes per run | about 90 (40-run sample, median 98) | job timings |
| Median wait for a runner, per job | 11–22 min; p90 29–35 min, in the 40 runs that finished by 11:10Z on 10-29 (24 of them queue runs). Spot checks of later 10-29 PR runs: 0.9–8.9 min | job timings |
| Wall-clock per run, all of 10-29 | queue: median 65 min (48 green runs); PR: median 28 min, p75 45 (74 green runs) | Actions API |
| Same run with no contention | 15 min (#2971 alone); 19–20 min (two at once) | queue runs, 10-29 |
| Queue runs per merge | 2.5 on 10-29 (ejections rebuild every entry behind) | derived |
| Jobs started by other workflows per push | 7 CodeQL jobs (code scanning and code quality), docs preview, closing-keyword lint, platform-suites plan, Dependabot auto-merge (starts, then skips) | Actions API |

Three readings:

1. **The load was already at the limit; the queue tipped it over.** PR runs have held at about 120–155 a day for two
   weeks. What jumped on 10-28 and 10-29 was the queue: 36 and 53 runs, against 9–34 before, so 2.5 queue runs per
   merge. That is a feedback loop. Contention slowed queue runs past the 60-minute timer, each ejection rebuilt every
   entry behind it, and every rebuild added contention. On 10-29, 202 CI runs at a typical 90 runner-minutes come to
   about 12.6 busy jobs at every minute of the day (an upper bound, since cancelled runs cost less), and the work
   clusters, so for hours at a time demand sat well above 20. The timeout is now 120 minutes, which breaks the loop;
   the load that made it possible is still there.
2. **Each push costs about as much as a merge.** A PR's runs are 5–7 pushes deep before it merges, and every push
   runs the full render tier. Superseded runs are cancelled, but 26 of 94 runs on one day were cancelled after their
   jobs had started.
3. **Every job repeats the same setup.** `npm ci` and the bundle build run in about eight jobs per run: about 18
   runner-minutes before any test starts.

## 2. What others do, and what is different here

Large projects split pre-merge testing into a cheap presubmit stage and a full gate on the combined change:

- **rust-lang/rust (bors).** A pull request runs a handful of jobs. The full matrix runs only when a reviewer
  approves and bors merges the PR, on the combined state. This is the closest match to a merge queue.
- **Kubernetes (Prow and Tide).** Presubmits run on the PR; Tide re-tests batches of approved PRs together before
  merging them.
- **GitHub's merge queue.** GitHub's own guidance is to run the required checks on `merge_group`, the combined
  state, because that is the state that lands.

The shared idea: the expensive suite runs once per merge, on the state that lands, not once per push.

**Two things differ here, and both favor that model:**

- **The author's machine is a full sandbox.** Every Claude session has Chrome, poppler and the whole toolchain, and
  sessions follow written rules. A human team cannot rely on everyone running the render tier before they push; this
  repository can. Session compute also does not use the 20 GitHub slots.
- **Session results are not attested.** A session's own test run is a claim, not evidence. The merge queue must
  stay the place where the full suite runs on machines nobody controls.

## 3. The five stages

| Stage | Where | Trigger | Purpose | Time budget | Who reads red |
|---|---|---|---|---|---|
| **Local** | the Claude session's sandbox (lefthook) | commit, push, before the merge ask | catch the author's own mistakes before they cost a runner | seconds on commit; minutes on push | the session |
| **PR** | GitHub runners | every push to a PR | an attested, fast check that the branch is sane; reviewer-facing artifacts | about 16 min wall, about 35–55 runner-min | the session |
| **Queue** | GitHub runners | `merge_group` | prove the combined state that lands; the only full gate | 20 min wall | the session; an ejection is a real failure or a flake to fix |
| **Nightly** | GitHub runners | schedule, once a day | slow sweeps and the cross-browser product tests | hours | the nightly issue's owner, next morning |
| **Weekly** | GitHub runners | schedule, once a week | slow-changing inputs: platforms, dependencies, security | hours | the weekly issue's owner |

### Should the PR stage run only unit tests?

Almost, and the data says where the line is. Removing a check from the PR stage does not delete what it catches; it
moves the failure to the queue, where it ejects that PR and rebuilds every entry behind it. So a check stays on the
PR stage when it catches often, and moves when it catches rarely:

| Check | Unique catches per 100 PRs (#2971's 999-run study) | If it moved to the queue | Call |
|---|---|---|---|
| lint and build freshness | 2.4 | 2.4 ejections | **stays on PR** (cheap: 2 min) |
| unit (node 22) | 3.6 | 3.6 ejections | **stays on PR**, in two shards |
| site build (`docs-build`) | about 11 for code; 38 for the route-budget line | about 49 ejections | **stays on PR when the site changes**, until the route-budget check runs locally (followup 2971-p2) |
| render tier (`integration`, 4 shards) | 3.6, and 51% of its failures pass on a re-run | 3.6 real ejections plus its flakes | **moves to the queue**, once the render flakes are fixed and the session runs affected render tests before the merge ask |
| Studio smoke (`studio-smoke`) | about 7, 43% flaky, advisory | n/a: advisory | **stays on PR**, advisory, for engine and site changes until the Studio nightly is green; then site changes only |
| golden before/after comment (`golden-diff`) | none: it posts a comment for the reviewer | n/a | **stays on PR when a visual path changes** |

"The site changes" has to include engine changes: the site bundles `lib/` and `themes/`, so the `docs` path filter
already matches them, and an engine change can trip the route budget. So the PR stage for an engine change is:
static checks, unit, the site build, Studio smoke and the golden comment. Only the render tier leaves.

Estimated from per-job timings (not a measured run), for an engine change:

| | Today | Proposed now | Once the Studio nightly is green |
|---|---|---|---|
| lint and freshness | 2 | 2 | 2 |
| unit | 13 | about 16 (two shards, setup paid twice) | about 16 |
| render tier, 4 shards | about 48 | 0 | 0 |
| site build | 14 | 14 | 14 |
| Studio smoke | 15 | 15 | 0 (site-only changes) |
| golden comment | 3–7 | 3–7 | 3–7 |
| **runner-minutes** | **about 95–100** | **about 50–55** | **about 35–40** |
| **wall-clock** | about 20 uncontended | about 16 (site build or smoke) | about 15 |

A site-only change keeps paying for the site build and smoke, and a prose-only change runs lint and unit only, as
today.

**The condition is not optional.** Moving the render tier while half its failures are flakes trades a red PR for an
ejected queue group. The render flakes get fixed first, and the session runs the render tests its diff affects
before it asks to merge.

### Do we need both builds?

Yes, but not the same build twice. The PR run answers "is this branch sane?" for the author and the reviewer. The
queue run answers "is `main` plus this change green?", which no PR run can answer once other PRs merge. Dropping the
queue run would mean requiring every PR to be up to date with `main` before merging, which at 21–28 merges a day is
the rebase storm HARD RULE #16 exists to prevent. Dropping the PR run would push every lint and unit failure into the
queue. Keep both; stop making them identical.

### Why `max_entries_to_build` 2, not 3

The live ruleset has `max_entries_to_build: 5`. One queue entry starts 8 jobs at once (lint, two unit legs, four
render shards, the site build), 9 when it touches the player. Two entries ask for 16–18 of the 20 slots. Three would
ask for 24–27, so the queue alone would exceed the plan and starve every PR run. Throughput does not need 3: one entry finishes in about 20 minutes, so a single lane clears about
72 merges a day if they are green, and the busiest day had 28. With the Team plan's 60 slots, 3 is fine (§9, D1).

## 4. Test taxonomy: what makes a test unit, integration or system

Define each kind by **what it may touch**, not by its folder:

| Kind | May touch | Must not touch | Examples here |
|---|---|---|---|
| **Static check** | source files, read-only | anything running | lint, typecheck, `build:check`, `check-ownership` gates |
| **Unit** | one module, in process, a temp folder | a browser, a subprocess, the network | `test/unit/**` as intended |
| **Integration** | one real boundary: headless Chromium, the CLI as a subprocess, poppler, a worker | the network | `test/integration/**` |
| **System (end-to-end)** | the built product as a person uses it: the docs site and Studio in real browsers; exports opened by each platform's viewer | | `docs/e2e/**` (Playwright), the macOS, Windows and iOS platform suites |
| **Sweep** | one property checked across the whole corpus: every gallery, theme or deck | | palette sweep, axe, jank, golden, overflow, fit, perf bench |

The tree breaks this today:

- **About 19 files in `test/unit` name a browser library (`puppeteer|playwright`), and about 75 import
  `child_process` and call spawn, exec or fork.** The exact counts depend on the pattern. A unit run that starts Chrome
  is an integration test in the wrong tier. It is also where unit's flakes came from: 7 of unit's 29 failures in the
  #2971 study were Chrome launch timeouts.
- **The unit tier's slowest suite is a static check.** `check-ownership`'s tests take 136 s of a 997 s suite. The
  ten slowest suites take 45% of the unit time.
- **The render tier depends on the network.** Five files fetch marp-cli through `npx` at run time. #2971 shrank this
  with a cache, but a gate that can fail because a registry is slow is a flake source by design. Vendor the
  dependency.

Moving these files is mechanical but large. The rule matters more than the move: a new test goes in the tier its
boundary puts it in, and a lint on `test/unit` refuses browser and subprocess imports, with a counted allowlist for
the files not yet moved.

## 5. What runs where

| Check | Local (session) | PR | Queue | Nightly | Weekly |
|---|---|---|---|---|---|
| lint, deck lint, build freshness | pre-push | yes | yes | | |
| unit, node 22 | affected on commit | yes, 2 shards | yes | | |
| unit, node 24 | | | yes | | |
| render tier (`integration`) | affected, before the merge ask | | yes, 4 shards | | |
| site typecheck, Vitest, build, route budget | pre-push when `docs/` changes | when the site or engine changes | yes | | |
| Studio smoke (advisory) | affected specs | when the site or engine changes; site only once the Studio nightly is green | | | |
| player, WebKit | | when the player changes | when the player changes | | |
| golden before/after comment | | when a visual path changes | | | |
| Studio e2e, all browsers | | | | yes | |
| render nightly, golden bless, overflow, fit, perf, preview, WebKit baselines | | | | yes | |
| platform suites (macOS, Windows) | | when their paths change | | yes | |
| platform suites (iOS Simulator) | | | | yes | |
| CodeQL, JavaScript/TypeScript and Actions | | yes | | | |
| CodeQL, Python and C# (3 and 1 files) | | | | | yes (needs CodeQL's advanced setup: a workflow file in place of GitHub's default setup) |
| dependency audit, link check, benchmark trend | | | | | yes |

## 6. The nightly stage only works if red means something

Moving a test to the nightly is the same as deleting it unless someone acts on red. Today:

| Nightly | Last 10 scheduled runs (newest first; G green, R red, C cancelled) |
|---|---|
| Studio e2e | RRRCRRRRRR |
| golden bless | latest still running, then CCCC, then GGGGG |
| overflow | CCCGGGGGGG |
| render (integration nightly) | RGGGGGGGGG |
| platform suites | GRRRGGRGGG |
| perf, preview e2e, modulepreload, WebKit baselines | GGGGGGGGGG |
| fit | G (one scheduled run so far) |

The proposal: a nightly or weekly suite that is not green for 7 consecutive days is either fixed or deleted, and the
choice is recorded. Each suite keeps one rolling issue, as the platform suites already do. Nothing new moves to the
nightly until the Studio e2e nightly is green, because that is where the Studio's coverage would land.

## 7. Naming

Today's names mix styles: `CI`, `Integration nightly (render-regression tier)`, `Fit nightly (per-component split
ratchet)`, `Studio E2E nightly (playwright)`, `Platform suites (macOS / Windows)`; and jobs `changes`, `docs-build`,
`studio-smoke`, `player no-JS (WebKit)`, `integration (node 22, shard 1/4)`. A check name is read in a narrow list on a
phone, so it should say what failed in a few words.

The scheme:

- **A workflow is named for its stage**, and its file says the same: `checks.yml` "Checks" (PR and queue),
  `nightly.yml` "Nightly", `weekly.yml` "Weekly", `release-*.yml` "Release", `deploy-docs.yml` "Deploy docs",
  `preview-docs.yml` "Preview docs", and `repo-*.yml` "Repo: …" for issue and PR housekeeping.
- **A job is named for its suite**, lowercase, at most about 20 characters, with a variant after a middle dot:
  `lint`, `unit`, `unit · node 24`, `render · 1/4`, `site`, `site · e2e smoke`, `player · webkit`, `golden`.
- **The gate keeps the name `ci`.** It is the one required check, and renaming it means editing branch protection
  and every doc that names it, for no gain in clarity. The gate's own step matches job names with a pattern
  (`/^(unit|integration) \(node …/` in `ci.yml`), so the job rename must update it in the same change.
- **npm scripts follow the taxonomy:** `test:unit`, `test:render`, `test:system`, `test:sweep`, with `npm test`
  staying the unit run.

| Today | Proposed |
|---|---|
| `CI` / `changes` | `Checks` / `changes` |
| `unit (node 22)` | `unit` |
| `unit (node 24)` | `unit · node 24` |
| `integration (node 22, shard 1/4)` | `render · 1/4` |
| `docs-build` | `site` |
| `studio-smoke` | `site · e2e smoke` |
| `player no-JS (WebKit)` | `player · webkit` |
| `golden-diff` | `golden` |
| `Integration nightly (render-regression tier)` and eight other nightly workflows | jobs in `Nightly`: `render`, `studio e2e`, `golden bless`, `overflow`, `fit`, `perf`, `preview`, `modulepreload`, `webkit baselines` |
| `PR closing-keyword lint`, `PR auto-close linked issues`, `Sync labels`, `Issue triage gate`, `Definition of Ready gate` | `Repo: …` |

## 8. Risks, and what would make this wrong

- **Shift-right raises queue ejections.** Each render failure discovered in the queue ejects a group and rebuilds
  every entry behind it. If the queue's failure rate passes about 10%, the queue becomes the bottleneck again. Measure
  ejections per 100 merges for two weeks after the move, and move the render tier back to PRs if it passes that.
- **The local stage is self-reported.** A session that skips its render run costs one queue ejection, not a broken
  `main`. That is the right failure mode, but only because the queue still runs everything.
- **The render tier has to stop flaking first.** 51% of its failures in the #2971 study passed on a re-run. Moved as
  it is, those become ejections.
- **One merged nightly workflow is one point of failure.** If it fails early, every suite in it shows red. Use one
  job per suite with `fail-fast: false`, so each suite reports on its own.
- **The Team plan is a recurring cost.** It does not fix the waste; it hides it. Do it for headroom, and still cut the
  PR stage.
- **The numbers in §3 are from one 10-day window,** which included an Ubuntu image change and a broken dependency.
  The catch rates are the best data the repository has; they are not stable constants.

## 9. Decisions for the owner

- **D1. Capacity.** Move the organization to GitHub Team for 60 concurrent jobs (GitHub's published limits: Free 20,
  Team 60; the price is per member per month, so check it on the billing page) and set `max_entries_to_build` to 3.
  Or stay on Free and set it to 2.
- **D2. The PR stage.** Make it thin (§3): static checks, unit in two shards, and the site checks when the site
  changes. The render tier becomes queue-only after its flakes are fixed and the session runs affected render tests
  before the merge ask. Or keep the render tier on PRs and only cut its setup cost.
- **D3. Nightly and weekly.** Adopt the 7-day rule (§6), add the weekly stage (§5), and fix or delete the Studio e2e
  nightly before anything else moves there.
- **D4. Names and taxonomy.** Adopt the naming scheme (§7) and the taxonomy (§4), with a lint that keeps browsers and
  subprocesses out of `test/unit`. The required check stays `ci`.

Order of work if all four are approved:

1. D1, a settings change, takes effect at once.
2. Fix the top render flakes, and add the local affected-render run before the merge ask.
3. Restructure `ci.yml` into the PR and queue stages, and rename jobs (D2, D4) in the same change, so checks are
   renamed once.
4. Consolidate the nightlies (D3) and add the weekly stage.
5. Move the misfiled unit tests, behind the lint.

## Not measured

- The local render run's time in a session sandbox. The pre-push hook says 4.5 minutes, but the suite has more than
  doubled since that line was written. The per-file weights sum to 4,127 s of serial time.
- How many render failures an affected-test run before the merge ask would catch. That needs a file-to-test map for
  `test/integration`, which does not exist yet.
- The Team plan's current price and limits for this organization.
