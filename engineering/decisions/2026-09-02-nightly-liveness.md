---
status: shipped
summary: >
  A liveness alarm for the nightly family is worth having, but the two numbers the
  brief proposed for it are both wrong, and measuring them is what shows it. All seven
  scheduled workflows are alive: each ran on schedule on 2026-09-01, and the median gap
  between consecutive scheduled runs is 24.0h. But the observed MAXIMUM gap is 34.7h, so
  a 36h threshold carries 1.3h of headroom and would have come within eighty minutes of
  firing on ordinary GitHub scheduling drift. Worse, all seven hit their maximum on the
  SAME night (08-26 to 08-27), so the failure this alarm would most often see is
  correlated: a per-workflow alarm turns one GitHub-side slip into seven issues. The
  design that survives the evidence is one job, one rolling issue, a 48h threshold, and a
  probe that requires a SCHEDULED run that actually produced jobs — each of those three
  refinements traceable to a real incident in this repo. Wiring is not done here: a new
  scheduled job is the CI-contract change reserved for the owner.
---

# A liveness alarm, and the two numbers that were wrong

**Date:** 2026-09-02 · **Status:** OPTIONS — not wired, owner's call

No nightly in this repo can report that it **stopped running**. Every alarm in the family
reports on what it measured; none reports that it never measured. `studio-e2e` was silenced
for weeks by a dropped `runs-on` (`2026-08-10-nightly-invalid-and-silent.md`), and GitHub
disables scheduled workflows after 60 days of repository inactivity. Neither the stand-downs
shipped in #1988 nor the orphaned-check census covers this.

So the gap is real. This note measures it before designing for it, and the measurement
changed the design twice.

## What was measured

The 30 most recent runs of each scheduled workflow, read from the Actions API on 2026-09-02.
30 is the API's page size, not a sample I chose; `overflow-nightly` is newer and has only 9
runs in total. Gaps are between consecutive runs whose event is `schedule`, so a
`workflow_dispatch` from a branch cannot mask a missed night.

| workflow | runs | scheduled | median gap | **max gap** | window |
|---|---|---|---|---|---|
| Studio E2E nightly | 30 | 23 | 24.0h | **34.2h** | 08-10 → 09-01 |
| Integration nightly | 30 | 27 | 24.0h | **34.1h** | 08-06 → 09-01 |
| Modulepreload coverage nightly | 30 | 21 | 24.0h | **34.7h** | 08-12 → 09-01 |
| Overflow nightly | 9 | 7 | 24.4h | **33.4h** | 08-26 → 09-01 |
| Perf nightly | 30 | 29 | 24.0h | **34.7h** | 08-04 → 09-01 |
| Preview e2e nightly | 30 | 30 | 24.0h | **34.3h** | 08-03 → 09-01 |
| Sync backlog mirror | 30 | 24 | 24.0h | **34.5h** | 08-09 → 09-01 |

**Every one of the seven is alive.** Each produced a scheduled run on 2026-09-01, the last
full day before this reading, and across all 161 scheduled runs the only conclusions are
`success` (145), `failure` (15) and one `cancelled`. Nothing is currently dead, which is the
honest baseline for a proposal to detect death.

## The first wrong number: 36h

The brief proposed asking whether each nightly produced a run in **36h**. Measured against
the real distribution that is 1.3 hours of headroom over an observed 34.7h maximum.

A threshold that tight does not fail safe. It fires on ordinary GitHub cron drift, and the
family's own history says what happens next: an alarm whose first firing is noise becomes
"the flaky nightly", and the real signal months later arrives on a thread nobody reopens.
That is the exact failure the #1988 stand-down work exists to prevent, and a 36h liveness
alarm would have reintroduced it on day one.

**48h is the defensible number.** It leaves 13.3h over the observed maximum and still catches
a genuinely stopped schedule on the second missed night. The cost is real and worth stating:
detection moves from ~1.5 nights to ~2. Against the incident that motivates this — a
blackout that ran for four nights — two is soon enough, and one false alarm is more expensive
than one night of extra latency.

**Corroborated 2026-09-03, from a different angle.** The gap measurement above is run-to-run.
Measuring instead how late each dispatch is *against its own cron* gives an independent read on
the same drift, over the last 6–8 runs of two workflows:

```
integration-nightly (cron 03:11): +4.66h +5.37h +6.44h +5.96h +6.78h +12.08h
sync-backlog        (cron 06:17): +5.13h +5.45h +7.71h +5.70h +6.44h +12.50h +11.39h +0.89h
```

Ordinary lateness is 5–7h and the tail reaches **12.5h**. A 36h threshold sits inside that tail's
reach; 48h does not. This is the second independent measurement to reject 36h.

**It also carries an operational lesson worth writing down.** *A cron time cannot be used to
predict when a run exists in this repo.* A verification check-in scheduled off the cron during
this work fired hours before either workflow had run. Any future check-in, probe, or wait timed
off a cron here will be wrong; time it off the last observed run instead.

## The second wrong number: one alarm per workflow

All seven workflows hit their maximum gap on **the same night**:

| workflow | the max-gap night | gap |
|---|---|---|
| Overflow nightly | 08-26 03:38 → 08-27 13:05 | 33.4h |
| Integration nightly | 08-26 03:58 → 08-27 14:04 | 34.1h |
| Preview e2e nightly | 08-26 04:59 → 08-27 15:20 | 34.3h |
| Studio E2E nightly | 08-26 05:14 → 08-27 15:28 | 34.2h |
| Modulepreload coverage | 08-26 05:43 → 08-27 16:23 | 34.7h |
| Perf nightly | 08-26 06:02 → 08-27 16:46 | 34.7h |
| Sync backlog mirror | 08-26 07:10 → 08-27 17:40 | 34.5h |

Seven workflows with seven different crons do not independently slip by the same ~34h across
the same 24-hour boundary. This is one GitHub-side scheduling event, and it is the failure
mode a liveness alarm will see most often — far more often than a genuinely dropped
`runs-on`.

**So the alarm must be correlated too: one job, one rolling issue, a table of all seven.** A
per-workflow alarm would have filed seven issues that night for a single non-event. One job
reporting "7 of 7 healthy" or "6 of 7 — `perf-nightly` last ran 61h ago" is both cheaper and
more readable, and it inherits the family's existing filing-and-stand-down shape unchanged.

## What "did it run" cannot see, and the fix for it

A naive probe — *did a run appear in the window* — is satisfied by a run that executed
nothing. Two shapes in this repo's own history prove it, and each argues for one refinement:

**Filter to `event: schedule`.** During the `studio-e2e` blackout the workflow was invalid, so
runs still appeared from pushes while, in the 08-10 note's words, *"the cron cannot fire."*
An unfiltered probe counts those push runs and reports health.

**Require the run to have produced jobs.** Run `33400075078` is the counter-example, verified
here rather than inherited: a `pull_request` run of `ci.yml` on PR #1613, conclusion
`action_required`, with `created_at`, `updated_at` and `run_started_at` all equal to
`2026-08-31T14:00:05Z` — created, then parked awaiting a manual approval, having executed
nothing. The 08-10 note records the same zero-jobs shape for a startup failure: *"runs are
startup failures with zero jobs."* A run record is not evidence that anything ran; a non-zero
job count is.

This is the same discrimination the whole swimlane rests on — a green that measured nothing is
not health — applied one level up, to the alarms themselves.

## The second arm: is the mirror fresh?

Distinct from "did it run", and currently failing.

`BACKLOG.md` on `main` was last committed **2026-08-25** (`d3ad2f0`) — and that was a feature
PR touching it, not the nightly. Its own header claims **167 open** items. The live queue
today reports **275 open issues**, on the same filter the generator uses (`gh issue list
--state open`, PRs excluded, a limit far above both counts).

**108 issues — 39% of the queue — are invisible in the committed mirror**, while
`sync-backlog` has reported `success` on all 24 of its scheduled runs in the window. This is
the exact defect PR #2013 fixes, quantified. It is also the cleanest possible argument for a
freshness arm: the run color was green every single night the file went stale.

### Update 2026-09-03 — this arm's blocker is cleared

The recommendation below was *"B, after #2013 merges"*, because landing a freshness arm against
a stale mirror means its first act is to file a known issue. Both conditions are now met:

- **#2013 merged** as `4c9075c`, and its effect is **verified** — the test it was waiting on was
  whether a check run named `ci` appears on the mirror PR. Baseline 2026-09-03 07:20 UTC: PR
  #1613 carried exactly 6 check runs, all CodeQL, **zero** `ci`. It now carries 17, including
  `ci` (`100629120596`, `success`, 11:22:54Z). The push identity fix works.
- **The mirror is fresh.** PR #1613 merged at 11:37:52Z as `b818d48`, taking `BACKLOG.md` from
  **167 rows to 278**. The 108-issue gap this note measured is closed.

So option B can land whenever the owner chooses; there is no longer an ordering constraint.

### Correction — an earlier draft of this update got the mirror backwards

That draft reported the fresh mirror as **167 open, internally consistent**, and used it to cast
doubt on this note's 275 figure. Both halves were wrong, and the way they were wrong is worth
keeping:

| commit | header | rows |
|---|---|---|
| `d1dbb30` (before #1613) | `**167 open**` | 167 |
| `b818d48` (#1613) → `main` | `**278 open**` | 278 |

The reading was taken while the working tree still sat at `d1dbb30` — so it examined the
**stale** mirror and called it fresh. It *was* internally consistent: 167 rows, 167 links, a
header saying 167. **A stale snapshot is self-consistent, and consistency is not freshness** —
which is this note's own thesis (a green run is not evidence the file it wrote is current),
reproduced by accident one level up.

**The 275 stands.** 275 on 09-02 → 278 on 09-03 is ordinary churn. The figure this note
originally recorded was right, and the doubt cast on it was the error.

## What this cannot cover

**The liveness job can die the same way.** A job that reports on other jobs is one more
scheduled workflow, subject to the same dropped-`runs-on`, the same 60-day disable, the same
parking. Nothing inside the repo closes that loop; only an external heartbeat would, and that
is a bigger change than this problem justifies today. Stating the limit is the honest move —
this alarm shrinks the blind spot, it does not remove it.

**The 60-day idle disable is a weak motivation here.** It triggers on repository inactivity,
and this repo merges most days. The measured risk is the dropped-`runs-on` class, not the
idle class.

**The sample is four weeks.** 34.7h is the largest gap in 161 scheduled runs since 08-03. A
longer tail may exist; 48h is chosen with that in mind, but it is a margin over an observed
maximum, not a proof about an unobserved one.

## Options

Wiring is deliberately **not** done. Adding a scheduled job is the CI-contract change
CLAUDE.md's second filter reserves for the owner: every future night pays the cost, and a bad
alarm is a permanent tax that gets switched off.

| option | what it costs | what could go wrong |
|---|---|---|
| **A. One liveness job, 48h, `event: schedule` + non-zero jobs, one rolling issue** *(recommended)* | A new workflow file, ~30s a night, no browser and no `npm ci` — it is API reads only. Reuses the family's filing/stand-down idiom verbatim, including the three-spelling author match. | One more workflow to maintain, and it cannot watch itself. Threshold rests on a four-week sample. |
| **B. A as above, plus the `BACKLOG.md` freshness arm in the same job** | Marginal — one extra API read and a file-date comparison. Catches the green-and-dead mirror class directly. | Files today, immediately, because the mirror IS stale — so it must land after #2013, or its first act is to file a known issue. |
| **C. Fold liveness into an existing nightly** | No new workflow. | Puts the watcher inside a watched job: if that nightly is the one that dies, the liveness check dies with it. Defeats the purpose. |
| **D. Do nothing** | Nothing. | The blind spot stays exactly as wide as it was when `studio-e2e` sat silent. Everything is alive today, so the cost is deferred, not avoided. |

**Recommendation: B, after #2013 merges.** A is the mechanism and B is the version that
catches the one failure this repo has actually suffered twice. The ordering matters — landing
B while the mirror is still stale means the alarm's first act is to file an issue for a defect
already fixed and waiting in the merge queue.

---

# What shipped (2026-09-03)

**Option B, owner-authorized**, both ordering conditions met: #2013 merged as `4c9075c` and is
verified, and #1613 landed a fresh mirror as `b818d48`.

- `.github/workflows/nightly-liveness.yml` — one job, one rolling issue, cron `43 7 * * *`.
- `tools/check-nightly-liveness.mjs` — the probe. Evaluation is pure and exported; `main()`
  does the `gh api` reads and nothing else.
- `test/unit/tools/nightly-liveness.test.js` — 16 arms over the pure half.

## The measurement was wrong about the size of the family

**There are EIGHT daily scheduled workflows, not seven.** This note measured seven and missed
`publish-kits.yml` (daily 06:29 UTC). Every one of the eight is daily, which is what makes a
single 48h threshold legitimate for the whole list — a weekly workflow dropped into that array
would fire every night and needs its own threshold instead.

Two tests keep the list honest in both directions: every watched file must exist and still
carry a `schedule:` trigger, and **every scheduled workflow in the repo must be watched** —
the arm that catches a future nightly being added and silently left unwatched, which is the
same blind spot in a new costume.

## The self-watching limit is now enforced, not just stated

The note said a job that watches other jobs cannot watch itself. That is now a named
`UNWATCHABLE_WORKFLOWS` entry carrying its reason, and the only permitted exit from the
"everything is watched" test. A second arm pins that the list stays exactly one entry, so the
blind spot cannot quietly grow through an exclusion nobody re-reads.

## Cron placement, which the note did not specify

`43 7 * * *` — deliberately **after** the whole family (overflow 02:41 → publish-kits 06:29).
Watching from in front of them reads yesterday's runs and calls a workflow that died this
morning healthy.

## The freshness tolerance is provisional, and labelled so

`BACKLOG_DRIFT_TOLERANCE = 25`. The live queue read **278** right after #1613 synced it (not
167 — see the correction above); the measured failure was a 108-issue gap while every run was
green. 25 sits well above a day's churn — 275 → 278 across 09-02 → 09-03 is 3 — and far below
the failure. This note's own warning stands: the number should be re-derived from observed
drift, and a week of this job's own rows is the data that settles it.

## Verified, and what was not

- 16/16 unit arms; the workflow YAML parses (6 steps, correct cron and `issues: write`).
- **The parked-run discriminator is verified against the live API**, not assumed: run
  `33400075078` — this note's own counter-example — returns `{"total_count": 0, "jobs": []}`,
  so the `> 0` clause really does reject a run that executed nothing. The
  `event=schedule` listing shape (`workflow_runs[]` with `created_at`) is confirmed the same
  way.
- **The `gh api` half was driven end to end**, against a shim standing in for `gh` (which is
  absent from the authoring sandbox). This exercises the real `probeWorkflow`,
  `liveOpenIssueCount`, report assembly, exit codes and the `workflows=` emission — every
  line of the impure half except the network itself:

  | case | exit | result |
  |---|---|---|
  | all eight alive, mirror fresh | 0 | `✅ 8/8`, emits `workflows=8` |
  | one workflow 99h stale | 1 | `❌ 7/8`, names it and its age |
  | one workflow with no scheduled runs | 1 | `❌ 7/8`, the distinct dropped-`runs-on` message |
  | **every run parked (0 jobs)** | 1 | `❌ 0/8` — the discriminator works through the real code path, not just the unit arm |
  | mirror stale while all eight are alive | 1 | `❌`, `STALE`, drift 172 |

  The first attempt failed, which is the point of running it: it exposed that the probe was
  being handed a URL the stand-in read from the wrong argument position. A bug in the
  harness rather than the tool, but it is the class of thing no unit test over the pure half
  can reach.

## The independent checker pass (HARD RULE #25)

CI/infra with this blast radius earns maker–checker, and it paid for itself: the checker
found a **HIGH-severity defect that would have shipped**, plus confirmed factual errors in
claims made above.

*(It reviewed a combined diff that also carried an unrelated CDN self-hosting change. That
work was split into its own PR before merge, and the findings belonging to it — three
content-only injection guards, a wrong island named, three stale type-docs — are recorded
in `2026-09-03-self-hosted-runtime-deps.md` rather than duplicated here. Only the findings
against THIS change are below.)*

**Fixed as a result:**

- **The workflow requested no `actions: read`.** An explicit `permissions:` block sets every
  unlisted scope to `none`, and the Actions API is this job's only data source. Had the
  reads 403'd, `probeWorkflow` would have swallowed it and the alarm's **first act** would
  have been to file "0/8 alive" — then again every night. An alarm whose debut is a maximal
  false positive is precisely what #1988's history says must never happen. One line, and no
  other workflow here reads that API, so there was no precedent to inherit it from.
- **The probe could not tell "I could not read" from "it is dead".** A 403, a 429 or an auth
  failure produced the byte-identical row and message as a stopped schedule. The BACKLOG arm
  already reported *"blind, not healthy"*; the workflow arm — the primary one — did not. Rows
  now report **BLIND** distinctly, a 404 still reads as death (the workflow really is gone),
  and the report tells a triager to check the token scope before hunting the workflows.
  Verified through the real impure code: 403-on-runs → BLIND, 404-on-runs → dead,
  403-on-jobs-only → BLIND, healthy → 8/8 exit 0.

**Accepted, not fixed, and why:**

- **A probe-step hard failure produces a silent night.** If `checkout` or `setup-node` dies,
  `unhealthy` is `''` and both the filing step and the stand-down skip: the run goes red and
  nothing is filed. This is the family's existing shape (perf-nightly has it too), so fixing
  it here would fix one instance of a family-wide pattern inside an unrelated PR — off-path
  under HARD RULE #18. Logged as the follow-up it is, and it is a real hole in the one alarm
  whose job is noticing that nothing ran.
- **Filing has no `github.ref` guard; the stand-down does.** So a `workflow_dispatch` from a
  branch can file a thread it cannot itself close. That asymmetry is deliberate in this
  family — the contract test *requires* the ref guard on the stand-down, and filing from a
  branch is loud and recoverable where closing on branch evidence is not. It self-heals on
  the next green scheduled night.

- **STILL UNVERIFIED: the real GitHub responses and the filing/closing steps.** The shim
  returns the shapes this repo's API actually produces (both confirmed independently — the
  `event=schedule` listing and the zero-jobs parked run), but no real `gh` call and no
  `gh issue create/comment/close` has run. `workflow_dispatch` is on the workflow precisely
  so the first run can be driven by hand rather than waited for.
