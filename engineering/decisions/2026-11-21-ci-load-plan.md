---
status: proposed
summary: >
  A measured plan to cut CI load. ci.yml and CodeQL use about 16,900 job-minutes and 3,081 jobs a day. CodeQL is
  42% of the jobs, over half of those for 7 C# and Python files; 38% of PR job-minutes go to runs a newer push
  cancels; the render tier is 40% of PR minutes. Fourteen candidates ranked by saving per unit of risk, a tool
  comparison (Nx, Turborepo, a homegrown `changes` job) and a repo-split comparison. Every change is a CI or
  settings change, so every one is the owner's call.
---

# CI load: a measured plan (2026-11-21)

**Answer.** Three changes cut about a third of the daily load, and none of them drops a check that caught
anything in the windows measured:

| # | Change | Jobs a day | Job-minutes a day | Coverage that moves |
|---|---|---|---|---|
| C1 | CodeQL: drop C# and Python from both configurations | −731 | −1,290 | 1 `.cs` and 6 `.py` files lose per-push scanning |
| C2 | Render tier (`integration`, four legs) on the merge queue only (adopted as D2 on 2026-10-30, not yet shipped) | −311 | −4,043 | a render failure shows as a queue ejection instead of a red PR |
| C6 | Run `build:check:all` on one unit shard, not both | 0 | −197 | none: both shards run it on the same tree |
| | **Together** | **−1,042 (−34%)** | **−5,530 (−33%)** | |

The rest of the list is smaller or riskier; §2 ranks all fourteen. Dependency-graph tools (Nx, Turborepo) would
save little here, because 43% of merged PRs touch the engine, which every other part depends on (§3). Splitting
the repo would make 40% of merged PRs cross a repo boundary (§4). The recommendation is to keep one repo and pilot
one input-keyed build cache in one job.

Nothing in this note changes a workflow, a hook, a ruleset or a CodeQL setting: each row is a proposal for the
owner (CLAUDE.md's second filter, row 2). The decision card is at the end of the PR.

## 1. The baseline, measured

**Source.** The GitHub REST API: every completed run of `ci.yml` (workflow 272747474), CodeQL code scanning
(dynamic workflow 304927975) and Code Quality (343987864), with every job and step of each run, all attempts. Two
windows:

- **The 5-day window**, for job and step detail. The API returns at most 1,000 runs per query, so it is the most
  recent 1,000: for `ci.yml`, 983 completed runs from 2026-11-16T18:22Z to 2026-11-21T15:44Z (4.89 days); for each
  CodeQL workflow, 1,000 runs over 5.47 days.
- **The month window**, for failures, reruns and the PR analysis: all 3,055 completed `ci.yml` runs from
  2026-11-01 to 2026-11-21 (20.6 days), fetched one day at a time, and the 312 PRs merged into `main` in November
  with their changed files.

A job-minute is a job's `completed_at − started_at` (runner time, not time waiting for a runner). A skipped job
counts zero. A second agent recomputed every 5-day figure from the raw data with its own scripts.

| Workflow (5-day window) | Runs a day | Jobs a run | Jobs a day | Job-minutes a day |
|---|---|---|---|---|
| `ci.yml`, `pull_request` | 173 (159 of 845 were drafts, every job skipped) | 13 (p50, a finished run) | 1,459 | 10,239 |
| `ci.yml`, `merge_group` | 28 | 12 | 343 | 2,869 |
| CodeQL code scanning (JS/TS, C#, Python, Actions) | 183 | 4 | 731 | 2,186 |
| CodeQL Code Quality (JS/TS, C#, Python) | 183 | 3 | 548 | 1,639 |
| **Total** | | | **3,081** | **16,933** |

That is 11.8 jobs running at any minute on average; the peaks are far higher, which is why the 20-job Free limit
queued work. Jobs waited for a runner (p50 / p90): PR jobs 4.5 / 29.3 min, queue jobs 11.8 / 43.3 min, CodeQL
jobs 5.0 / 20.7 min.

CodeQL is **42% of all jobs and 23% of job-minutes.** It runs on every push to a PR, drafts included, because
`ci.yml`'s draft skip does not reach it. The owner's November export (about 20,200 CodeQL job runs against about
23,100 for `ci.yml`'s test jobs) gives a similar ratio; this note did not check the export itself.

**Where `ci.yml`'s minutes go** (5-day window, per day; p50 over every job that ran):

| Job | PR jobs | PR minutes | Queue jobs | Queue minutes | p50 |
|---|---|---|---|---|---|
| `integration` (4 legs) | 311 | 4,043 | 112 | 1,647 | 12.7 min |
| `unit` node 22 (2 shards) | 268 | 2,365 | 56 | 548 | 8.8 min |
| `studio-smoke` | 116 | 968 | 0 | 0 | 9.2 min |
| `docs-test` | 116 | 912 | 28 | 263 | 8.4 min |
| `golden-diff` | 90 | 659 | 0 | 0 | 7.3 min |
| `docs-build` | 116 | 568 | 28 | 88 | 4.0 min |
| `lint` | 134 | 407 | 28 | 65 | 2.2 min |
| `unit` node 24 | 0 | 0 | 28 | 225 | 7.5 min |
| `player no-JS (WebKit)` | 41 | 143 | 6 | 22 | 3.8 min |

**Setup repeated in every job.** Each job checks out, installs and (for five of them) builds on its own:

| Step | Job-minutes a day | p50 |
|---|---|---|
| root `npm ci` (its `prepare` script also builds the uncommitted half of `dist/`) | 1,112 | 50 s |
| `npm run build` (unit, integration, golden-diff, player, unit node 24) | 1,027 | 75 s |
| `build:check:all` (both unit shards, and node 24 in the queue) | 427 | 77 s |

The `ci.yml` comment above `build:check:all` puts it at "~12s". It measures 77 s p50 over 1,495 successful runs.

**Failures over the month.** 1,602 of 30,621 `ci.yml` jobs failed (5.2%), using 7,035 job-minutes (2.9% of
240,244). The owner's figure of 18,169 failed-job minutes covers every workflow in the organization; `ci.yml` is
39% of it. By job: `docs-build` 378 failures (3,449 min, half of the total, 49 of them on one branch), `integration`
251 (1,617 min), `studio-smoke` 77 (772 min), `unit` node 22 93 (530 min). This note does not sort these into real
catches and flakes.

## 2. The candidates, ranked by saving per unit of risk

"Saving" is job-minutes a day. *Estimate* marks any number that is not a direct measurement.

| Rank | # | Change | Saving a day | Risk | Verdict |
|---|---|---|---|---|---|
| 1 | C1 | CodeQL: JS/TS and Actions only | 1,290 min, 731 jobs | very low | do |
| 2 | C6 | `build:check:all` on one unit shard | 197 min | none | do |
| 3 | C3 | `pr:park` by default while iterating | up to 3,865 min (cap, not a forecast) | none to coverage; a habit to keep | do |
| 4 | C7 | skip `prepare`'s partial build where a full build follows | about 470 min (*estimate*) | low | do |
| 5 | C2 | render tier on the queue only | 4,043 min, 311 jobs | medium: ejections | do, after the flake fix |
| 6 | C11 | fix the flakes that get re-run | 279 min in discarded attempts, plus ejections | none | do (it is #33 anyway) |
| 7 | C9 | cache the build by its inputs (one-job pilot) | about 270–450 min (*estimate*) | low-medium: a wrong key gives a stale build | pilot |
| 8 | C4 | `max_entries_to_build` 5 → 3 | up to 830 min | low: a long queue drains slower | do once Team is live |
| 9 | C8 | node 24 unit leg to the nightly | 225 min, 28 jobs | low | owner's taste |
| 10 | C10 | fail fast: heavy jobs wait on lint and unit | up to about 530 min | medium: +9 min and one more runner wait per PR run | not now |
| 11 | C12 | affected-only test selection | up to about 1,300 min (ceiling) | medium-high: missed coverage | not now; C9 first |
| 12 | C5 | build once per run, share it | about 850–1,270 min (*estimate*) | medium: +1 serial job per run | not now |
| — | C13 | merge-queue batching (bigger groups) | 0 | — | drop: GitHub runs one CI per entry |
| — | C14 | split or trim the slowest suites | 0 job-minutes (wall time only) | — | drop as a load lever |
| — | — | cache a same-tree re-run | 4 min | — | drop |
| — | — | delete the leftover probe workflows | 0 (none ran) | — | tidying only |

### C1. CodeQL: JavaScript/TypeScript and Actions only

Live default setup (read 2026-11-21): languages `actions, csharp, javascript-typescript, python`, query suite
`default`, weekly schedule. Code Quality runs `javascript-typescript, csharp, python`. The repo holds one C# file
(`tools/office-conformance/openxml-check/Program.cs`) and six Python helpers (`design/logo/generate.py`,
`tools/ascii-preview.py`, `tools/gen-chart-finish-css.py`, `tools/icon-font/build.py`,
`tools/lastra-corpus/generate.py`, `tools/lastra-corpus/icc.py`).

| Option | Jobs a push | Jobs a day | Minutes a day | What is lost |
|---|---|---|---|---|
| Today | 7 | 1,279 | 3,825 | |
| **C1a.** Drop C# and Python from both | 3 | 548 (−731) | 2,535 (−1,290) | per-push scanning of those 7 files. None runs in a request path or ships in a package |
| C1b. C1a, and turn Code Quality off | 2 | 366 (−913) | 1,494 (−2,331) | Code Quality's JS/TS maintainability findings. Not measured: whether anyone acts on them |

The 2026-10-30 note's §5 already puts C# and Python on a weekly scan, which needs CodeQL's advanced setup (a
workflow file in place of default setup). That is a new workflow, so it is the owner's call too; C1a without it
leaves those 7 files unscanned. Both options are a Settings change the owner makes (Settings, Code security),
undone the same way.

### C2. Render tier on the merge queue only

`integration` is the biggest job: 40% of PR job-minutes. It already runs in full on every queue entry, so the PR
run repeats work the queue does anyway. The owner adopted this as D2 on 2026-10-30, on a precondition: fix the
render tier's flakes first, and have the session run the affected render tests before the merge ask
(`2026-10-30-ci-pipeline-stages.md` §7a and §9). It has not shipped.

- **Saves:** 311 jobs and 4,043 job-minutes a day on PRs. Queue load is unchanged.
- **A reviewer loses:** a red render test on the PR page. In the 5-day window 16 PR runs (36 legs) had an
  `integration` failure; each would have surfaced as a queue ejection instead. One ejection costs its own queue
  run (101 job-minutes p50) plus up to four rebuilt entries behind it: at most 16 × 5 × 101 ≈ 8,100 job-minutes
  over the window, 1,650 a day (*upper bound*; most red PR runs are fixed before the merge ask).
- **Not measured here:** this window's flake share. The 2026-10-30 note found half of test-level render failures
  were flakes. C11 is the step before C2.

`golden-diff` and `studio-smoke` stay on PRs. They already skip the queue, so moving them there would add queue
load, and `golden-diff`'s before/after images are a review artifact that only makes sense on the PR.

### C3. Fewer cancelled runs

A PR branch averaged 6.9 CI runs in the 5-day window (p50 4). 313 of 845 PR runs ended `cancelled`, 309 of them
because a newer push on the same branch replaced them. **3,865 job-minutes a day, 38% of all PR job-minutes, went
to runs that were later cancelled.** CodeQL runs on the same pushes and mostly runs to the end (54 of 1,000 code
scanning runs were cancelled).

The tool exists: `npm run pr:park` parks a PR as a draft while the session iterates, and `pr:ready` runs CI once on
the final head (`workflow.md` §Iterating on an open PR). It is optional today. Making it the default for any
session that pushes more than once is a change to `workflow.md`, so the owner's. 3,865 is the cap; the share
sessions would actually save is not measured. Drafts do not stop CodeQL, so C1 is the lever there.

### C4 and C13. The merge queue: build concurrency, not batching

In the 5-day window the queue ran 138 groups for 98 PRs (1.41 runs per PR); over the month, 390 for 317 (1.23).
Only 3 of the 138 failed and 3 were cancelled, yet seven PRs had four to seven **green** runs each. So most extra
runs were green work thrown away when the queue rebuilt the groups behind an entry that failed or left: 40 extra
runs at 101.7 job-minutes each, about 830 a day. *Inferred* from the run list, not from GitHub's queue events.

**Batching does not help (C13).** Every queue entry got its own CI run (runs ≥ PRs in both windows), and a group of
five is five runs, each holding the PRs ahead of it. A bigger group means more speculative runs to discard when one
fails, not fewer runs. When a group fails, ALLGREEN removes the red PR and re-runs every entry behind it.

**The lever is `max_entries_to_build`** (live: 5). D1 on 2026-10-30 recommended 3 on Team. Fewer groups building at
once means fewer to discard after a failure; the cost is a slower drain when the queue is long. The saving is
bounded by the 830 a day above.

### C5. Build once per run and share it

The repeated setup costs 2,139 job-minutes a day (root install 1,112 + build 1,027). A `build` job that runs once
and hands `node_modules` and `dist/` to the others would cost:

- the build job itself: 168 runs a day × about 2.7 min = 454 min (*estimate*: measured step times plus an assumed
  20 s upload);
- a restore in each of the 1,255 jobs a day that run a root `npm ci`. Measured here: `node_modules` is 1.1 GB, 279
  MB gzipped; `dist/` is 100 MB, 38 MB gzipped. Restore time on a runner was not measured; at 20–40 s it costs
  418–837 min (*estimate*).

**Net: about 850–1,270 job-minutes a day (*estimate*)**, and every run gains a serial job and one more wait for a
runner (p50 4.5 min, p90 29.3 min at today's load) before any test starts. At today's contention that wait costs
more than the minutes save. C7 and C9 take the cheap part now.

### C6. `build:check:all` on one unit shard

Both unit shards run the same check against the same freshly built tree. Running it on shard 1 only saves **197
job-minutes a day** (the step's measured time on shard 2) and loses nothing. Shard 2 finishes 77 s sooner.

### C7. Skip `prepare`'s partial build where a full build follows

In unit, integration, golden-diff and player, root `npm ci` runs `prepare`, which builds the uncommitted half of
`dist/`; the next step runs the full `npm run build`, which builds it again. In this sandbox (4 cores, measured
once) the partial build took 60 s and the full one 126 s. Scaled to CI's 75 s full build, the partial is about
36 s, repeated in the 786 jobs a day that run the full build: **about 470 job-minutes a day (*estimate*, from the
local ratio).** It needs an opt-out in `tools/prepare.js` (an env var; there is none today) plus that env var in the
four jobs, and the second half is a workflow change. The `lint` job must keep the partial build: its freshness gate
reads `dist/` CSS and must not see a full build (the `ci.yml` comment above that step says why).

### C8. Node 24 unit leg in the queue

28 jobs and 225 job-minutes a day. The 2026-10-29 note found no failure unique to node 24 in 999 PR runs; this
month it failed 10 times in the queue (66 min), not read. Moving it to the nightly turns a node-24-only break into a
red nightly instead of an ejection.

### C9. Cache the build by its inputs

The build's inputs are the engine (`lib/`, `themes/`, `assets/fonts/`, `kit/`), the build tools and the lockfile.
57% of November's merged PRs did not touch the engine (§3), so most of their pushes rebuild a `dist/` that an
earlier run on `main` already built. Restoring `dist/` from GitHub's own cache (`actions/cache`, keyed on a hash of
those paths) instead of building it would skip the 75 s build and about 36 s of `prepare` on those runs. Merged PRs
that did not touch the engine used 24% of PR job-minutes, and unmerged branches (not classified) another 16%. The
PR-side build and `prepare` cost about 1,125 job-minutes a day, so the saving is about 0.24–0.40 × 1,125 ≈
**270–450 job-minutes a day (*estimate*)**.

The risk is a key that misses an input: a stale `dist/` and a false green. `build:check:all` in the unit job checks
the built tree against every generator, so the pilot keeps that step uncached; a wrong key fails there. Nothing
leaves GitHub. Same-tree re-runs, the other half of "cache by input", are not worth building: 3 PR runs this month
re-ran a head that already had a green run (76 min in all), because HARD RULE #16 already stops no-op rebases.

### C10. Fail fast: heavy jobs wait on lint and unit

Over the month, 81 PR runs had a red `lint` or `unit`; the heavy jobs in those runs (`integration`, `golden-diff`,
`studio-smoke`, `docs-*`, player) used 4,713 job-minutes, **229 a day**. Up to 303 a day more went to heavy jobs in
runs cancelled within 15 minutes, which a gate would often have stopped before they started (the two overlap, so
about 530 a day is the ceiling). The price is on every PR run: the heavy jobs start after unit finishes (p50 8.8
min) plus one more runner wait (p50 4.5 min). At 7,482 heavy job-minutes a day on PRs, the gate saves about 7% of
them and adds about 13 minutes to every green PR's time to `ci`. Not worth it while runners are scarce; C2 removes
the largest heavy job from PRs anyway.

### C11. Flakes as a CI cost

This month 48 `ci.yml` runs were re-run by hand. 35 of them ended green after a failed attempt, which is the
pattern of a flake re-run until it passes (HARD RULE #33 forbids exactly that). The failed earlier attempts held 33
`integration` legs, 14 `studio-smoke`, 7 `golden-diff`, 4 `docs-build` and 2 `unit` failures, and the discarded
attempts used **279 job-minutes a day**. In the queue, 19 of 390 groups failed (16 with an `integration` leg red,
10 with node 24), and each failure re-runs every entry behind it. Fixing these is the flake desk's work, not a CI
change; it is also C2's precondition.

### C12. Affected-only test selection

See §3: the ceiling is about 1,300 job-minutes a day, it needs a dependency map finer than npm workspaces, and it
moves coverage risk into the queue. C9 gets a quarter to a third of that saving for a fraction of the risk.

### C14. The slowest suites

**Integration** (`test/integration/shard-weights.json`, re-blessed 2026-11-19): 169 files, 4,633 recorded seconds;
the 10 slowest are 43% of it. `export-formats` 353 s, `html-player` 249 s, `axe-a11y` 246 s, `office-conformance`
238 s, `marp-vscode-css-parity` 208 s, `palette-sweep-gallery` 170 s, `content-clipped-pill` 145 s,
`strip-notes-no-fingerprint` 142 s, `jank-sweep` 131 s, `strip-notes-every-format` 107 s. The venue-conformance
ratchet on shard 4 adds 307 s p50.

**Studio smoke** (one passing job, 2026-11-21): 161 tests, 929 s of test time on 2 workers. The three slowest are
the Show Me tour (59 s), phone-photo export (40 s) and Mermaid-unavailable export (25 s).

Splitting a file across more shards changes wall time, not job-minutes: the same seconds run on more runners, and
each extra leg pays about 2.5 minutes of setup. Trimming a test changes what it covers, which the lane rules leave to
the owner. Neither cuts load, so C14 is dropped as a load lever. It stays a wall-time lever once runners are free.

### Not a saving: the leftover probe workflows

`zz-npm-ci-wedge-probe`, `zz-apt-probe-3139`, `rebuild-generated`, `desktop` and `desktop-windows-check` are still
registered with GitHub but ran **zero** times in the 5-day window (last runs 2026-08-17 to 2026-11-13); their files
are gone from `main`. Disabling them in the Actions tab is tidying only.

## 3. Affected-only tools: Nx, Turborepo, or the `changes` job

**The ceiling, measured.** Of the 312 PRs merged in November (310 by the owner's sessions, 2 by Dependabot):

| What the PR touched | PRs | Share | Its PR-run job-minutes this month | What an affected-only run could skip |
|---|---|---|---|---|
| The engine (`lib/`, `themes/`, fonts, `kit/`, `package.json`) | 134 | 43% | 121,263 (60%) | almost nothing: every package and test reads the engine |
| The docs site and its workspaces only | 98 | 31% | 18,456 (9%) | most of `unit` (7,112); `integration` already skips |
| Prose, `backlog.d/` or CI config only | 37 | 12% | 2,158 (1%) | `unit` and the stray `integration` runs |
| Tools and tests only | 15 | 5% | 4,598 (2%) | the render tests the change does not reach |
| A non-engine mix (site, tools, tests, `.github`) | 28 | 9% | 21,891 (11%) | part of `integration` (9,709) and `unit` (4,084) |

Unmerged branches used the other 32,511 minutes (16%). Adding up what each row could skip (every job but `lint` in
the prose and tools rows, `unit` in the site row, `integration` and `unit` in the mix row) gives at most about
27,200 job-minutes over 20.6 days, **about 1,300 a day: a ceiling, not a forecast.** The `changes` job's path
filters already take the easy part (a docs-only PR skips `integration`).

**Why the graph tools gain little here.** Nx and Turborepo skip work per *package*. The engine is the root package,
and the 19 workspaces (`docs/src/lib/*`) all sit downstream of it. Of the 49 merged PRs that touched a workspace,
one touched only that workspace. A tool can only skip what a change provably does not reach, and at package
granularity almost every change reaches almost everything.

| Option | What it gives | Remote cache | Adoption cost | Fit |
|---|---|---|---|---|
| **Nx** | project graph, `nx affected`, task caching by input hash | Nx Cloud (hosted by Nrwl), or self-hosted; check the current license terms for self-hosting | an `nx.json` and a project per workspace; 309 root scripts to map to targets; the root package stays one project | low: the root package is most of the graph |
| **Turborepo** | task caching by input hash, `--filter=[base]` for affected packages | Vercel Remote Cache (hosted), or a self-hosted server speaking its open cache API | a `turbo.json` pipeline over the 23 `package.json` files | low, for the same reason |
| **Homegrown: extend `changes` + `actions/cache`** | finer path filters (`dorny/paths-filter`, already in use) and a build cache keyed by `hashFiles(...)` | GitHub's own cache, inside the org | edits to one workflow | good: it skips by path and caches by input, which is the part that pays |
| Bazel, Pants | hermetic builds, fine-grained graphs | their own remote-execution caches | rewrite every build and test as BUILD targets; poor fit for Playwright and Chromium renders | no |

**A hosted cache sends build outputs to a third party.** With Nx Cloud or Vercel's cache, `dist/` and the cached
test outputs leave GitHub and live on that vendor's servers. A self-hosted cache keeps them in, but someone has to
run it. `actions/cache` keeps them inside GitHub with nothing new to run.

**HARD RULE #15.** Adopting Nx or Turborepo would be reuse, not reinvention. But neither changes the ceiling,
because the ceiling is set by the repo's shape, not the tool. Extending the `changes` job reuses two tools the repo
already runs (`dorny/paths-filter`, `actions/cache`), so it is not reinvention either.

**Recommendation: the homegrown route, as a one-job pilot (C9).** Cache `dist/` by input hash in the `unit` job only,
with `build:check:all` left uncached as the check, and measure the hit rate and minutes for a week. If the hit rate
is high, extend it to `integration` and `golden-diff`; if Nx or Turborepo still looks worth it after that, the
pilot's hit rate is the number to judge it by.

## 4. Should the libraries move to their own repos?

**No.** Measured on November's 312 merged PRs:

- **Engine repo plus site repo:** 126 PRs (40%) touched both sides (the engine, tools, tests or decks, and the site
  or a workspace). Each would have been two coordinated PRs, with a published engine version in between.
- **Each workspace its own repo:** 48 of the 49 workspace PRs also touched something outside that workspace.

**The constraints point the same way.** HARD RULE #1 keeps every render path on one shared kernel, and the site
imports the engine from source. CLAUDE.md's "develop, never consume" rule means a split site could not test against
a published engine package anyway, so it would need the engine's source beside it, which is a monorepo again. The
desktop app is also planned for this repo.

**The CI saving a split promises comes cheaper in place.** A split saves CI by running fewer tests per change. C9
and the `changes` job's filters do that inside one repo, without 40% of changes paying for two PRs and a release.

## 5. Order, if the owner takes all of it

1. C1a: a Settings change, takes effect on the next push; the largest cut in jobs.
2. C6 and C7: small `ci.yml` and `prepare.js` edits in one PR.
3. C3: `pr:park` as the `workflow.md` default.
4. C11, then C2: fix the re-run flakes, then move the render tier to the queue.
5. C9: the one-job build-cache pilot, measured for a week.
6. C4 once the Team limit is confirmed in effect; C8 at the owner's taste.
7. C5, C10 and C12 stay parked until runner waits fall.

## Not measured

- Restore time for a shared `node_modules` or a cached `dist/` on a hosted runner (C5, C9).
- The split of `npm ci`'s 50 s between install and `prepare` on a runner (C7 uses the local ratio).
- What share of cancelled runs `pr:park` would prevent (C3).
- Whether GitHub's queue ever builds one run for several entries; the data shows at least one run per entry.
- Which of the month's 1,602 failed jobs were flakes and which were real catches.
- Whether Code Quality's findings are read (C1b).
- Whether the Team plan's 60-job limit is in effect yet; the command center owns that.
