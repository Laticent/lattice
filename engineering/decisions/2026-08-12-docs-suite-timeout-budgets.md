---
status: shipped
summary: >
  `docs-build` is a REQUIRED check that failed at random on `main`, ejecting PRs that
  touched zero files under `docs/`. The cause was not a race, a shared fixture, or a
  leaked global (vitest runs `pool: forks` + `isolate: true`, so there is nothing to
  leak) — it was two wall-clock budgets left at library defaults sized for an idle
  machine: vitest's 5 s `testTimeout` and Testing Library's 1 s `asyncUtilTimeout`. A
  Studio component test renders the whole StudioShell behind a 400 ms debounce and
  costs 1–2 s IDLE; 20 tests sat within 2× of the wall; the suite runs its files in
  parallel (373 s of test-time inside 242 s of wall-clock). So each run killed whichever
  test drew the worst scheduling — a different one every time, all passing in isolation.
  Both budgets now live in `docs/test-budgets.js` (20 s / 5 s) with the measurements that
  sized them, plus a report-only margin table and a 3×-repeat nightly.
---

# The docs suite's flakiness was a budget, not a race (#1324)

**Supersedes the working hypothesis in #1324 and #1328.**

## The symptom

`docs-build` is a **required** check. It failed at random on `main`. Because it
gates the merge queue it ejected PRs that touched zero files under `docs/` —
#1317 was ejected while touching none — and an ejection silently clears
auto-merge, so the cost of each one was a human noticing and re-driving the PR.

The card accumulated five implicated test files over six weeks
(`studio.chat-grounding`, `single-slide-render.alignment`, `chart-anima`,
`studio.theme-depth`, `StudioShell`), each with the same signature: **fails
under a full run, passes in isolation, and the file that fails changes between
runs.**

## What it actually is

Two nested wall-clock budgets, both left at library defaults sized for a test
that does almost nothing on an idle machine:

| Budget | Default | Where it bit |
| --- | --- | --- |
| Vitest `testTimeout` | 5 s | `Test timed out in 5000ms` |
| Testing Library `asyncUtilTimeout` | 1 s | `Unable to find an element with the placeholder text of: …` |

A Studio component test renders the whole `StudioShell` and waits out a 400 ms
assessment debounce. Measured on an idle 4-core box at `a71508e`, that costs
**1.6–1.8 s** for the median such test and up to **4.5 s** for the slowest —
against a 5 s wall. Of the tests running on the default budget, **20 were within
2× of it and 65 within 3×**.

Vitest then runs the suite's own files in parallel: a full run spends **373 s of
test-time inside 242 s of wall-clock**. A test with a 2.8× margin idle does not
have a 2.8× margin against that.

So a run kills whichever test drew the worst scheduling. Reproduced here twice
on the same tree, same box, minutes apart:

| Run | Died | Message |
| --- | --- | --- |
| 1 | `studio.findings-fix` › cycles progress in the pill | `Test timed out in 5000ms` |
| 2 | `StudioShell` › reaches Fabricate from the launcher | `Unable to find an element with the placeholder text of: /Describe a look/i` |

Neither reproduces alone: `studio.findings-fix` passed 3/3 in isolation at
1.6–1.8 s.

## What it is not

- **Not cross-file state.** The card's leading hypothesis — "a shared fixture, a
  module-level singleton, or a leaked jsdom global" — is structurally
  impossible. Vitest runs `pool: 'forks'` with `isolate: true` (confirmed in
  `vitest/dist/chunks/defaults.*.js`), so each file gets its own process and its
  own jsdom. There is nothing shared to leak.
- **Not one bad test.** The population at risk was ~20 tests. Fixing the one
  that died today promotes the next-slowest.
- **Not the same bug as the one already fixed in `studio.chat-grounding`.** That
  one was the opposite polarity: a test *racing* a 400 ms debounce, which fails
  when the machine is **fast**. It is fixed in-tree (the test now waits for
  `assessDeck` to settle). Real, but a different mechanism, and fixing it could
  never have fixed the rest.

The retracted measurement in the card's third comment — "9 files / 87 tests
failed", withdrawn because it had been taken while ~49 Chromium processes ran
alongside — was **not** the bad data it was retracted as. It was this mechanism
at extreme contention. It was disclosed correctly and then discounted for the
wrong reason: the load *was* the finding.

## The fix

Both budgets move into `docs/test-budgets.js`, imported by `vitest.config.ts`,
`vitest.setup.ts` and the margin report, sized from the measurements above at
~4× headroom over the slowest ordinary test:

- `TEST_TIMEOUT_MS` / `HOOK_TIMEOUT_MS` — **20 s**
- `ASYNC_UTIL_TIMEOUT_MS` — **5 s**, deliberately well under the outer one so a
  query that truly cannot find its element fails with Testing Library's message
  (which names the query and prints the DOM) rather than the outer timeout's
  bare "Test timed out in …", which names nothing.

**Why raising a timeout is the fix and not an evasion.** A timeout is a budget
for a *machine*; it asserts nothing about the product. No user-visible behavior
is pinned by "this renders in under a second in jsdom on a contended CI runner."
The assertions are untouched and still fail when the product breaks, and a
genuinely hung test still fails — just later. What the new budgets buy is that a
red `docs-build` means something is **wrong** rather than something was **slow**.

This also retires a workaround that had been spreading one call site at a time —
`}, 60_000)` on the fuzz tests, `{ timeout: 25_000 }` in `deictic`,
`{ timeout: 5000 }` in `studio.controls`, `{ timeout: 3000 }` in `StudioShell`.
Each was a correct local read of a global problem. The ones still above the new
default are legitimate (a fast-check property run is not a render assertion) and
stay.

### The second cluster, found by verifying the first

Three full runs after the budget change, the Studio cluster was gone — and run 1
of 3 failed four `vetrina/deictic` tests instead, at their own hand-written
20–30 s timeouts. Same population property, different budget, and worth stating
because it is what a single green verification run would have hidden.

Those tests wait out real `requestAnimationFrame` motion, polled a frame at a
time: `for (let i = 0; i < 1200 && !settled; i++) await frames(1)`. At jsdom's
~16 ms a frame that loop's own worst case is ~19 s, before the mount and the
gesture. So a 25 s budget held ~6 s of slack and a 20 s one sat *under the bound
the test itself permits* — they spent 5.4–9.4 s idle and died together the first
time a full run got busy. They now take `ANIMATION_TEST_TIMEOUT_MS` (60 s).

**But a bigger budget was the wrong fix on its own, and an independent checker
caught why.** The sampling loop is bounded in FRAMES while the contention it
suffers is in WALL-CLOCK. Under load a frame stretches from ~16 ms to ~25 ms, so
the loop spends its 1200 frames *before the gesture finishes* — and then the
test asserts against a path it only half watched. That has two faces:

- `expect(reached).toBeGreaterThan(…)` fails loudly and confusingly
  (`expected 600 to be greater than 880`) — a red that no timeout value fixes.
- `expect(far).toBeLessThan(…)` — a *"the cursor never went over there"* claim —
  **passes vacuously**, because a truncated sample satisfies an upper bound for
  free. The checker observed exactly this: two siblings passing at 30.8 s and
  23.2 s with arithmetically exhausted windows. The oracle goes quiet precisely
  when the machine is too busy to run it properly, which is the worse half.

So the ceiling stops being part of the measurement. `watchGesture()` returns
whether the window `expired`, and every caller asserts on it first. A contended
run now says *"the sampling window ran out before the gesture settled"* instead
of either lying or confusing you, and `ANIMATION_TEST_TIMEOUT_MS` is no longer
load-bearing for a correctness claim — which is the property that matters, since
the measured contention stretch turned out to be ~7×, not the ~3× these budgets
were first sized against.

**A claim withdrawn.** This note first said the deictic cluster "could not have
been caused" by the change, on the grounds that deictic imports no Testing
Library and uses no `waitFor`. That half is true and an independent checker
confirmed it — but it answers only the `asyncUtilTimeout` half of the change. The
other half raises `testTimeout` 5 s → 20 s, which lets a straggler hold a worker
four times longer, and peak contention is exactly the variable that stretches
these tests. Pre-change they ran 5.4–9.4 s and passed; the first post-change run
killed all four. That record is consistent with causation, and nothing here
measures the contention delta either way. So this is **undetermined**, not
pre-existing — and under HARD RULE #18 an undetermined regression that appeared
across this change is treated as one this change caused, which is why the fix
below is in this PR rather than a follow-up.

### Considered and rejected

- **Cap `maxWorkers`.** Reduces contention, but taxes every CI run's wall-clock
  and does nothing about the 1 s Testing Library budget, which is where run 2
  actually died.
- **Make the Studio tests cheap.** The real cost is rendering the whole
  `StudioShell` per test plus the 400 ms debounce. Worth doing, but it is a
  refactor across dozens of files and it is not what stops the queue bleeding
  today.
- **Ratchet a gate on test durations.** Tempting, and wrong: durations are
  measured while the suite competes with itself, so they swing run to run.
  Gating on that number would reintroduce exactly the nondeterminism being
  fixed.

## Keeping it fixed

- `npm run check:test-margin` tables how much of its budget each test spends.
  **Report-only** — no finding fails a build; the only non-zero exit is being
  pointed at a report that isn't there. See above.
- `.github/workflows/docs-flake-nightly.yml` runs the full suite three times and
  opens a rolling `[docs-flake]` issue if the runs disagree. One green run
  cannot disprove nondeterminism, which is the whole reason this took six weeks
  and four contradictory comments to characterize; a nightly distribution can.

## The generalizable bit

Every comment on #1324 that tried to name a *culprit* — a file, a fixture, a
leaked global — was looking for something local, because a failing test names a
file and a file feels like a cause. The actual cause had no location. It was a
*population* property: how many tests were running close to a shared wall, and
how hard the suite was competing with itself. The tell was in the data the whole
time — "a different test fails each run, all pass in isolation" is not a
description of a bug in any of them.
