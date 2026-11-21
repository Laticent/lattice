---
status: proposed
summary: >
  A measured plan to cut CI load. Over five days, ci.yml and CodeQL used 16,933 job-minutes and 3,083 jobs a
  day. CodeQL is 42% of the jobs, a third of them for 7 C# and Python files; 38% of PR job-minutes go to runs
  a newer push cancels; the render tier is 40% of PR minutes. Eight changes, each with its measured saving,
  coverage cost and risk. Every one is a CI or settings change, so every one is the owner's call.
---

# CI load: a measured plan (2026-11-21)

**Answer.** Three changes cut about a third of the daily load, and none of them loses a check that has caught
anything this month:

| # | Change | Jobs a day | Job-minutes a day | Coverage that moves |
|---|---|---|---|---|
| C1 | CodeQL: drop C# and Python from both configurations | −732 | −1,290 | 1 `.cs` and 6 `.py` files lose per-push scanning |
| C2 | Render tier (`integration`, four legs) on the merge queue only (already adopted as D2 on 2026-10-30, not yet shipped) | −311 | −4,043 | a render failure shows as a queue ejection instead of a red PR |
| C6 | Run `build:check:all` on one unit shard, not both | 0 | −197 | none: both shards run it on the same tree |
| | **Together** | **−1,043 (−34%)** | **−5,530 (−33%)** | |

The baseline is 3,083 jobs and 16,933 job-minutes a day. Everything below is measured from the GitHub API
unless it says *estimate*. Nothing in this note changes a workflow, a hook, a ruleset or a CodeQL setting: each
row is a proposal for the owner (CLAUDE.md's second filter, row 2). The decision card is at the end.

## 1. The baseline, measured

**Source.** The REST API, every completed run of `ci.yml` (workflow 272747474), CodeQL code scanning (dynamic
workflow 304927975) and Code Quality (343987864), with every job and step of each run. The API returns at most
1,000 runs per query, so the windows are the most recent 1,000 runs:

- `ci.yml`: 983 completed runs, 2026-11-16T18:22Z to 2026-11-21T15:44Z (4.89 days).
- CodeQL code scanning and Code Quality: 1,000 runs each over 5.47 days.

A job-minute is a job's `completed_at − started_at` (runner time, not queue time). A skipped job counts zero.

| Workflow | Runs a day | Jobs a run | Jobs a day | Job-minutes a day |
|---|---|---|---|---|
| `ci.yml`, `pull_request` | 173 (159 of 845 were drafts, every job skipped) | 13 (p50, a finished run) | 1,459 | 10,239 |
| `ci.yml`, `merge_group` | 28 | 12 | 343 | 2,869 |
| CodeQL code scanning (JS/TS, C#, Python, Actions) | 183 | 4 | 732 | 2,186 |
| CodeQL Code Quality (JS/TS, C#, Python) | 183 | 3 | 549 | 1,639 |
| **Total** | | | **3,083** | **16,933** |

That is an average of 11.8 jobs running at every minute of the day; the peaks are far higher, which is why
the 20-job Free limit queued work. Jobs waited for a runner (p50 / p90): PR jobs 5.4 / 30.5 min, queue jobs
11.8 / 43.3 min, CodeQL jobs 5.5 / 22.1 min.

CodeQL is **42% of all jobs and 23% of job-minutes.** That matches the owner's November export (about 20,200
CodeQL job runs against about 23,100 for `ci.yml`'s test jobs). It runs on every push to a PR, drafts
included, because `ci.yml`'s draft skip does not reach it.

**Where `ci.yml`'s minutes go**, per day:

| Job | PR jobs | PR minutes | Queue jobs | Queue minutes | p50 |
|---|---|---|---|---|---|
| `integration` (4 legs) | 311 | 4,043 | 112 | 1,647 | 12.7 min |
| `unit` node 22 (2 shards) | 268 | 2,365 | 56 | 548 | 8.7 min |
| `studio-smoke` | 116 | 968 | 0 | 0 | 9.4 min |
| `docs-test` | 116 | 912 | 28 | 263 | 8.4 min |
| `golden-diff` | 90 | 659 | 0 | 0 | 8.4 min |
| `docs-build` | 116 | 568 | 28 | 88 | 4.3 min |
| `lint` | 134 | 407 | 28 | 65 | 2.2 min |
| `unit` node 24 | 0 | 0 | 28 | 225 | 7.5 min |
| `player no-JS (WebKit)` | 41 | 143 | 6 | 22 | 4.1 min |

**Setup repeated in every job.** Each job checks out, installs and (for five of them) builds on its own:

| Step | Job-minutes a day | p50 |
|---|---|---|
| root `npm ci` (its `prepare` script also builds the uncommitted half of `dist/`) | 1,112 | 50 s |
| `npm run build` (unit, integration, golden-diff, player, unit node 24) | 1,027 | 75 s |
| `build:check:all` (both unit shards, and node 24 in the queue) | 427 | 77 s |

The `ci.yml` comment above `build:check:all` puts it at "~12s". It measures 77 s p50 over 1,358 runs.

## 2. The candidates

### C1. CodeQL: JavaScript/TypeScript and Actions only

Live default setup (read 2026-11-21): languages `actions, csharp, javascript-typescript, python`, query suite
`default`, weekly schedule. Code Quality runs `javascript-typescript, csharp, python`. The repo holds one C# file
(`tools/office-conformance/openxml-check/Program.cs`) and six Python helpers (`design/logo/generate.py`,
`tools/ascii-preview.py`, `tools/gen-chart-finish-css.py`, `tools/icon-font/build.py`,
`tools/lastra-corpus/generate.py`, `tools/lastra-corpus/icc.py`).

| Option | Jobs a push | Jobs a day | Minutes a day | What is lost |
|---|---|---|---|---|
| Today | 7 | 1,281 | 3,825 | |
| **C1a.** Drop C# and Python from both | 3 | 549 (−732) | 2,535 (−1,290) | per-push scanning of those 7 files. None of them runs in a request path or ships in a package |
| C1b. C1a, and turn Code Quality off | 2 | 366 (−915) | 1,491 (−2,334) | Code Quality's JS/TS maintainability findings (−1,044 min a day more). Not measured: whether anyone acts on them |

The 2026-10-30 note's §5 already places C# and Python on a weekly scan, which needs CodeQL's advanced setup (a
workflow file in place of default setup). That is a new workflow, so it is the owner's call too; C1a without it
leaves those 7 files unscanned. Both options are a Settings change the owner makes (Settings, Code security),
undone the same way.

### C2. Render tier on the merge queue only

`integration` is the biggest job: 40% of PR job-minutes. It already runs in full on every queue entry, so a PR
run repeats work the queue does anyway. The owner adopted this as D2 on 2026-10-30, on a precondition: fix the
render tier's flakes first, and have the session run the affected render tests before the merge ask
(`2026-10-30-ci-pipeline-stages.md` §7a and §9). It has not shipped.

- **Saves:** 311 jobs and 4,043 job-minutes a day on PRs (four legs per push). Queue load is unchanged.
- **A reviewer loses:** a red render test on the PR page. In the window 16 PR runs (36 legs) had an
  `integration` failure; each would have surfaced as a queue ejection instead. One ejection costs its own queue
  run (101 job-minutes p50) plus up to four rebuilt entries behind it. If all 16 had reached the queue that is
  at most 16 × 5 × 101 ≈ 8,100 job-minutes over the window, 1,650 a day (*upper bound*, not a measurement; most
  red PR runs are fixed before the merge ask).
- **Not measured here:** this window's flake share. The 2026-10-30 note found 50% of test-level render failures
  were flakes; reading this window's 36 failed logs is the next step before C2 ships.

`golden-diff` and `studio-smoke` stay on PRs. They already skip the queue, so moving them there would add queue
load; and `golden-diff`'s before/after images are the review artifact, which only make sense on the PR.

### C3. Fewer cancelled runs (push volume)

A PR branch averaged 6.9 CI runs in the window (p50 4). 313 of 845 PR runs ended `cancelled`, 309 of them
because a newer push on the same branch replaced them. **3,865 job-minutes a day, 38% of all PR job-minutes,
went to runs that were later cancelled.** CodeQL runs on the same pushes and is not cancelled with them.

The tool for this exists: `npm run pr:park` parks a PR as a draft while the session iterates, and `pr:ready`
runs CI once on the final head (`workflow.md` §Iterating on an open PR). It is optional today. Making it the
default whenever a session pushes more than once (a change to `workflow.md`, so the owner's) caps the saving at
3,865 minutes a day for `ci.yml`. The share sessions would actually save is not measured. Drafts do not stop
CodeQL, so C1 is the lever there.

### C4. Merge-queue reruns

The queue ran 138 groups for 98 PRs: 1.41 runs per PR. 40 extra runs at 101.7 job-minutes each is about 830
job-minutes a day. Only 3 queue runs failed and 3 were cancelled, yet seven PRs had four to seven **green** runs
each. So most extra runs were green work thrown away when the queue rebuilt the groups behind an entry that
failed or left. *Inferred* from the run list, not from GitHub's queue events.

Larger groups do not help: each entry got its own run (138 runs for 98 PRs), so a bigger group means more
speculative runs, not fewer. The lever is `max_entries_to_build` (live: 5). D1 on 2026-10-30 recommended 3 on
Team. Fewer groups building at once means fewer to discard after a failure, and queue latency rises when the
queue is long. The saving is bounded by the 830 a day above and is not measured.

### C5. Build once per run and share it

Gross cost of the repeated setup: 2,139 job-minutes a day (root install 1,112 + build 1,027). A `build` job that
runs once and hands `node_modules` and `dist/` to the others would cost:

- the build job itself, about 168 runs a day × about 2.7 min = 454 min (*estimate*: measured step times plus
  an assumed 20 s upload);
- a restore in about 1,334 jobs a day. Measured here: `node_modules` is 1.1 GB, 279 MB gzipped; `dist/` is 101 MB,
  38 MB gzipped. Restore time on a runner was not measured; at 20–40 s it costs 445–890 min (*estimate*).

**Net: about 800–1,240 job-minutes a day (*estimate*)**, and every run gains a serial job and one more wait for a
runner (p50 5.4 min, p90 30.5 min at today's load) before any test starts. At today's contention that latency
cost is worse than the saving, so C5 waits until queue waits fall. C6 and C7 take the cheap part now.

### C6. `build:check:all` on one unit shard

Both unit shards run the identical check against an identical, freshly built tree. Running it on shard 1 only
saves **197 job-minutes a day** (measured: the step's time on shard 2) and loses nothing. Shard 2's wall time
drops 77 s.

### C7. Skip `prepare`'s partial build where a full build follows

In unit, integration, golden-diff and player, root `npm ci` runs `prepare`, which builds the uncommitted half of
`dist/`; the next step runs the full `npm run build`, which rebuilds it. In this sandbox (4 cores) the partial
build takes 60 s and the full one 126 s. Scaled to CI's 75 s full build, the partial is about 36 s, repeated in
about 820 jobs a day: **about 490 job-minutes a day (*estimate*, from the local ratio).** It needs an opt-out
in `tools/prepare.js` (an env var) plus that env var in the four jobs; the second half is a workflow change.
The `lint` job must keep the partial build: its freshness gate reads `dist/` CSS and must not see a full build
(the `ci.yml` comment above that step says why).

### C8. Node 24 unit leg in the queue

28 jobs and 225 job-minutes a day. The 2026-10-29 note found no catch unique to node 24 in 999 PR runs; this
window has one node 24 failure in 138 queue runs, not read. Moving it to the nightly saves 225 a day and turns a
node-24-only break into a red nightly rather than an ejection. Smaller than the others; listed so it is decided,
not forgotten.

### Not a saving: the leftover probe workflows

`zz-npm-ci-wedge-probe`, `zz-apt-probe-3139`, `rebuild-generated`, `desktop` and `desktop-windows-check` are
still registered with GitHub but ran **zero** times in the window; their files are gone from `main`. Removing
them saves no minutes. Disabling them in the Actions tab is tidying only.

## 3. Order, if the owner takes all of it

1. C1a: a Settings change, takes effect on the next push; the largest cut in jobs.
2. C6 and C7: small `ci.yml` and `prepare.js` changes in one PR.
3. Read this window's 36 failed `integration` legs, fix the flakes, then C2.
4. C4: set `max_entries_to_build` once the Team limit is confirmed in effect.
5. C3 as a `workflow.md` default; C5 only after queue waits fall.

## Not measured

- Restore time for a shared `node_modules` on a hosted runner (C5).
- The split of `npm ci`'s 50 s between install and `prepare` on a runner (C7 uses the local ratio).
- Whether GitHub's queue ever builds one run for several entries; the data shows one run per entry or more.
- What share of cancelled runs `pr:park` would prevent (C3).
- Whether Code Quality's findings are read (C1b).
- Whether the Team plan's 60-job limit is in effect yet; the command center owns that.
