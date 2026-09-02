---
status: shipped
summary: >
  Of five checks reported as wired to nothing, only two are actually unguarded.
  The premise is right about the SCRIPTS and wrong about three of the DEFECTS. All five
  npm scripts are genuinely orphaned, but `check:responsive`, `equiv:check` and `oracle:check`
  each have their checking logic run by something that IS wired: two by unit tests inside
  `npm test`, one by `checkSplitOracle` inside `build:check`. Wiring any of the three would
  duplicate an existing gate and buy nothing. Only `check:chart-fit` and `geometry:check` are
  unchecked by anything, and both are real: browser-driven, minutes long, runner-dependent,
  and covering defects nothing else can see. Neither belongs on the PR critical path; both
  belong nightly. `check:chart-fit` also exited 0 with "SKIPPED, nothing verified" when no
  Chromium was found — the exact green-having-measured-nothing shape this swimlane exists to
  remove — which is fixed here so the check is safe to wire whenever the wiring is approved.
  Wiring was deliberately NOT done in the census; it was authorized and landed the next day in
  PR #2044 (see the closing section), which found the wiring is four edits rather than three.
---

# Five orphaned checks: what is actually unguarded

**Symptom.** A queue audit reported five checks wired to nothing — no CI workflow, no
lefthook hook, no `tools/build.js` step — and two of them red. The repo appeared to believe
it had five gates it did not have.

**Root cause, and the correction.** All five npm scripts really are orphaned. But a script
is not a gate, and three of the five defects are already caught elsewhere:

| check | script wired? | defect covered elsewhere? | runtime | verdict | deterministic? |
|---|---|---|---|---|---|
| `check:responsive` | no | **yes, fully** — `test/unit/tools/chart-responsiveness.test.js` | 0.3s | pass | yes |
| `check:chart-fit` | no | **no** | 30s | **pass** — first green at #2032; NEVER green before it | no — real Chromium |
| `equiv:check` | no | **yes, fully** — `test/unit/diagnostics/slice-equivalence-baseline.test.js` | 3s | pass | yes |
| `oracle:check` | no | **yes** — `checkSplitOracle` in `check-ownership.js` | 0.3s | pass | yes |
| `geometry:check` | no | **partly** — `checkSectionCqAnchoring` catches one of two causes | 2m08s | pass | no — real Chromium |

Runtimes are wall clock on this sandbox with `dist/` already built; the two browser checks
also need `npm run build` first. `npm run build:check` is 14s for comparison.

**The three that are already covered.**

- `check:responsive` — `chart-responsiveness.test.js:118` calls the tool's own exported
  `findViolations` over a byte-identical file set (both do
  `execSync('ls lib/components/chart/*/*.css')`). That test is inside `npm test`, which runs
  in `ci.yml` and on pre-push. Wiring the CLI would add zero coverage.
- `equiv:check` — `slice-equivalence-baseline.test.js:26` imports the harness and runs the
  full sweep in the unit tier. **This was fixed one day before the audit** (#1970,
  `a378cf9`), which also re-blessed the baseline — so the audit's "fails on shape,
  154→157 decks" is stale. Measured now: `1469/1493 slides (98.4%)`, 158 decks, `within
  contract`, exit 0.
- `oracle:check` — `check-ownership.js:8701` calls `attestationProblems` from the same
  module, and `check-ownership.js` is step 0 of `tools/build.js`. `build:check` really does
  gate it.

**The two that are not.** Both references found in the tree for these are comments, not
calls (`check-ownership.js:2610` describes what `check-chart-fit` does; `resolve-chrome.js:6`
records a drift it caused). Nothing runs either one.

- **`check:chart-fit`** renders a fixture at three aspect ratios in real Chromium and asserts
  content does not paint outside `.cell-stage`, does not overflow its **SVG viewBox**, and
  that the body box is not needlessly narrowed. The viewBox arm is caught by nothing else:
  `lib/core/overflow-probe.js` is structurally blind to it because the SVG crops before the
  DOM measures. **Was red when this note was written**, stably so — `[square]` slide 15
  (progress) painted 10.9px below the stage, cut silently because the stage is
  `overflow: clip`. That clip was fixed by #1920 / PR #2030.
  **CAUTION — this note asserted the gate was green, in THREE places, when it never was.** The line
  above said so, the bullet you are reading said so, and the Recommendation said so —
  all three added by #2030's commit, and all three already false the moment it merged.
  #2016 landed **51 minutes earlier** and reopened the gate at a DIFFERENT site,
  `roadmap` at portrait (+75.4px on two pages) and at strip (+80px), by seating the
  split's new universal forward-pointer signal inside a stage `roadmap` had floored at
  exactly 100%. **There was never a green window**: the gate went fail(progress) ->
  fail(progress + roadmap) at 10:58 -> fail(roadmap) at 11:49 -> pass only at #2032.
  Read no sequence into it that implies otherwise. Nothing caught the contradiction
  because #2030's branch measured a tree without #2016 on it, and the gate this note is
  about runs in no CI job — the swimlane's own thesis, demonstrated on this note. Closed
  by #2032; the gate exits 0 across all three sizes with no `SANCTIONED_CLIPS` entry.
- **`geometry:check`** renders five example decks and compares section padding box, stage
  height and overflow verdict across four viewport sizes and again with sections
  transform-scaled the way the filmstrip preview scales them. It catches a slide whose
  geometry depends on the window viewing it — the Playground, Studio and PDF disagreeing
  about which slides overflow. `checkSectionCqAnchoring` catches cause 1 (a bare `cq*` on the
  section) by spelling; nothing catches cause 2 (a `getBoundingClientRect()` that ignores
  host transform scale), which only a real scaled render exposes. Currently green: 50 slides
  identical on every surface.

## Fixed here: a check that reported success having measured nothing

`check-chart-fit.js` exited **0** with `SKIPPED, nothing verified` when `resolveChrome()`
found no browser. That is the precise shape this swimlane exists to remove, and it was one
decision away from being wired: on a runner whose Chromium is missing, or whose puppeteer
cache restored without the binary — a failure `overflow-nightly.yml` documents as recurring
— the job would have gone green every night while every clip went unmeasured.

It now exits **2**, matching its closest sibling `check-geometry-parity.js`. 2 rather than 1
keeps a setup failure distinct from a real clip finding, which is the discrimination the
nightly alarm family is built on. Nothing runs the script, so this changes no current
behavior; it makes the check safe to wire.

## What should run them — options, not a decision

Neither belongs on the PR critical path. Both drive a real browser, both take minutes, and
per the repo gate strategy
(`2026-06-13-gate-strategy-change-detection.md` §C/§D) a browser-dependent check whose
verdict can move with the runner belongs off it. That leaves three options:

| option | what it costs | what could go wrong |
|---|---|---|
| **A. Add both as steps to `integration-nightly.yml`** *(recommended)* | ~3 min added to a job that already runs 2h04m. No new workflow, no new browser install — that job already caches puppeteer and builds `dist/`. Inherits the rolling-issue alarm and its stand-down for free. | Lengthens an already-long job, and folds two more arms into one rolling issue, so a chart-fit clip and a golden drift share a thread. The alarm body greps failure markers, so both would show — but the title says "render-regression tier", not which arm. |
| **B. A new nightly workflow for the two** | A new workflow file, its own Chromium setup and `npm ci` (~4 min of setup for ~3 min of work), and its own rolling issue and stand-down step. | A new workflow is a new thing to maintain, and the setup cost roughly doubles the real work. Its own thread is the only real advantage over A. |
| **C. Leave both on-demand, documented** | Nothing. | `check:chart-fit` stays red with nobody watching, which is where it has been. The known clip does not regress silently — but a SECOND clip would appear the same way, and nobody would know. |

**Recommendation: A.** The "handle the red first" precondition this note originally carried
is discharged **twice over**: #1920 / PR #2030 closed the `[square] progress` clip, and #2032
closed the `[portrait] roadmap` clip that #2016 opened an hour later. `check:chart-fit` exits 0
across all three sizes with no `SANCTIONED_CLIPS` entry.

**Read the precondition as standing, not as spent.** It has now been discharged twice and
falsified once in a single day, by a change that touched neither of the components involved.
Re-run the gate against the tree you are actually about to wire, not against the tree the
branch was cut from — this note was wrong on exactly that point for 51 minutes.

One wiring detail this note did not anticipate, found while preparing the change: the job
summary in `integration-nightly.yml` greps a FIXED list of failure markers, and neither new
check's failure line matches it — `check-chart-fit` prints `N clip(s) across M size(s)` and
`check-geometry-parity` prints `N geometry disagreement(s)`. Wiring the arms without extending
that list reproduces #1529, where a rolling issue carried a bare failure count for fifteen
nights with the one explanatory line dropped. So the wiring is three edits, not two: the two
arms, the filing condition, AND the marker list.

**Not done here.** Adding a job or a step is the CI-contract change CLAUDE.md's second filter
reserves for the owner: every future PR pays the cost, and a bad gate is a permanent tax. The
census and the numbers are the deliverable; the wiring waits on a decision.

## Wired, 2026-09-02 (PR #2044)

Option A was authorized and both arms are in `integration-nightly.yml` as `chartfit` and
`geometry`, sitting after `codewidth` and before the 72-minute `regress` arm. Four things the
option table and the three-edit note above got wrong or did not reach:

- **It is FOUR edits, not three.** The stand-down step ANDs every arm the filing step ORs, so
  an arm added to one and not the other is not a partial wiring — it is a contradiction: on a
  night where only the new arm is red the tier would file the failure and comment "measured
  green" on the same issue. `nightly-alarm-contract.test.js` already gates that symmetry, and
  the omission was mutation-proved to fail CI, so this one was never invisible.
- **`check-chart-fit` has THREE failure headlines, not one.** `N clip(s)`, `N re-derived outer
  inset(s)` and `N STALE sanction(s)`, printed by three separate branches. The note above named
  only the first, and matching only that would have reproduced #1529 on the other two the same
  week the note cited #1529 as the reason to be careful.
- **The marker grep appears TWICE**, identically — the job summary and the issue body. The
  issue body is the one that matters: #1529's damage was a rolling issue carrying a bare count.
- **Nothing in the tree could see a missing marker,** which is why it survived fifteen nights.
  The sibling assertions in `nightly-alarm-contract.test.js` read `if:` expressions, which a
  workflow parser can reach; this question is whether a regex matches text a *different file*
  prints, and the two files reference each other in neither direction. A backstop now pins it,
  with the samples captured from real runs rather than read off the tools' sources.

The precondition held: both gates were re-measured green on `main@f43364b`, the tree they were
wired into, rather than taken from this note. That re-measurement is what the paragraph above
asks for, and it is the second time in two days that doing it changed the answer.
