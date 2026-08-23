---
status: shipped
summary: >
  The docs vitest suite flaked in the `studio.*` family under full-suite load (#1328) — a
  different failing set every run, which is the failure mode that trains people to dismiss
  failures, and did: a real regression in #1312 was very nearly waved through as contention.
  The pool turned out to be wider than the file it was filed against: FIVE tests crossed 5s
  in one instrumented contended run, across three files, two of them outside `studio.*`
  entirely — which is why the budget lands in the config rather than on a `studio.*` glob.
  Root cause is not a race and not a slow test. It is the framework's generic 5s
  `testTimeout`, never chosen for a suite whose heaviest tests drive a full 5,000-line
  `StudioShell` render plus ~10 real-timer `userEvent` interactions. Measured on one box:
  those tests cost 1.8-2.0s idle and 4.9-6.1s under 4-way CPU contention (a 2.8-3.3x
  factor), so they straddle 5s exactly. Fixed by setting a considered budget — 20s default
  in `vitest.config.ts`, and `studio.fuzz`'s journey property raised 60s → 120s, which was
  sitting at 1.39x of its own contended cost. Verified with 10 consecutive full runs green,
  plus 3 more under the contention that reproduced the flake. Rejected: making the tests
  cheaper (`delay: null` saves nothing, mount is 90-205ms — the cost is real React work),
  and `fileParallelism: false` (it hides the budget problem behind a slower suite).
---

# The docs jsdom suite's 5-second default was a wall-clock gate nobody chose

**Closes #1328.**

## The symptom, and why it was worth fixing

`docs/src/components/studio/studio.theme-depth.test.tsx` failed intermittently in a full
`npx vitest run` and passed 6/6 in isolation. Across ~8 full-suite runs during #1312 the
failing set was **different every time** — 29 failures once under heavy load, then 1, then
2, then 0, then 2 — drawn from `studio.theme-depth`, `studio.controls`, `studio.findings-fix`,
`studio.fuzz` and `StudioShell.test.tsx`.

The cost was never the red run. It is that **a suite that cries wolf teaches you to dismiss
its failures**, and #1328 records the bill: during #1312 a genuine regression
(`positionIsTrustworthy` over-refusing a heading nested in a list) surfaced as exactly one
failing docs test, and the honest-looking move was to call it contention. It was real.

## Reproducing it

The flake needs load, and an idle sandbox does not have any: a plain full run here is green.
Four busy loops against four vitest workers on four cores reproduce it on the first attempt.

```sh
cd docs
for i in 1 2 3 4; do (timeout 500 sh -c 'while :; do :; done' >/dev/null 2>&1 &); done
npx vitest run --reporter=dot
pkill -f 'while :; do :; done'
```

→ `FAIL src/components/studio/studio.theme-depth.test.tsx` — both the save-a-theme and
remove-a-theme cases, `Test Files 1 failed | 247 passed (248)`. Reproduced twice.

## The root cause is a budget, not a race

The failure text is unambiguous and it is the same for both:

```
Error: Test timed out in 5000ms.
```

Not an assertion, not a hang, not an ordering bug between the theme-library tests — the test
simply did not finish inside vitest's default `testTimeout` of 5000ms.

Measured on the same box, per test:

| test | idle | 4-way contention | factor |
|---|---:|---:|---:|
| `studio.theme-depth` › removes a saved theme… | 1.98s | **6.09s** | 3.1x |
| `studio.theme-depth` › saves a named theme… | 1.78s | **4.94s** | 2.8x |
| `studio.fuzz` › never crashes… | 12.99s | **43.14s** | 3.3x |

The two #1328 filed straddle 5s exactly: comfortable idle, over the line under load. That
is the whole flake. Contended durations were captured by re-running the full suite under the
same four burners with `--testTimeout=60000 --reporter=json` — which finished **0 failures**,
which is itself the proof that the budget was the only thing wrong.

### The flake pool is wider than the file it was filed against

That same run is worth reading for what else it caught. **Five tests relying on the 5s
default exceeded it, across three files** — so at the real default that run would have been
red in three places, not one:

| test | file | contended |
|---|---|---:|
| removes a saved theme… | `studio.theme-depth.test.tsx` | 6.09s |
| underline goes straight there | `lib/vetrina/deictic.test.ts` | 5.20s |
| the human-in-the-loop gate: Present offers a reader view… | `StudioShell.test.tsx` | 5.09s |
| underline still sweeps its line before withdrawing… | `lib/vetrina/deictic.test.ts` | 5.07s |
| saves a named theme… | `studio.theme-depth.test.tsx` | 4.94s |

This is #1328's "different failing set every time" seen from the other side: which of a pool
of near-5s tests trips depends on how the scheduler happened to interleave that run. It also
decides **where the fix belongs** — a `studio.*` glob carve-out, the issue's own first
suggestion, would have left `lib/vetrina/deictic.test.ts` flaking. The budget goes in the
config, for the whole suite.

(The three slowest tests in that run — `studio.fuzz` at 43.1s, `PlaygroundApp`'s toolbar
fuzz at 11.2s, and a `deictic` case at 8.8s — all carry their own explicit budgets already
and were never part of the flake.)

### The tests are not wasteful, and could not be cheaply made cheaper

Two candidate "make it faster instead" fixes were measured and rejected before touching the
budget:

- **`userEvent.setup({ delay: null })`** — the documented way to drop `userEvent`'s
  inter-event yield. Saves nothing: 1.99s vs 1.78s on the same test, inside noise.
- **The mount is not the cost.** A bare `render(<StudioShell options={options} />)` is
  **205ms** cold and **90ms** warm.

What remains is the interactions: these tests drive an end-to-end save → list → select →
delete loop through the real shell, which is ~10 re-renders of a 5,000-line component. That
is what the test is for. There is no waste to remove without weakening the coverage.

## What a per-test timeout is actually for

**It catches a hang — an await that will never resolve. It is not a performance budget.**
At 5s this one was doing the second job by accident, and doing it on a shared, contended
machine.

`2026-08-03-performance-guard.md` already settled that argument for this repo: a shared
runner cannot resolve anything smaller than about 2x, so durations became a nightly alarm
and only **deterministic counts** gate the merge. A 5-second per-test timeout is a
wall-clock gate on a shared runner. It arrived by framework default rather than by choice,
and it behaves exactly as that decision predicts.

The suite had already been conceding this, one file at a time, wherever someone hit the
wall: `studio.fuzz` carries `60_000`, `studio.present-autoplay-chain` `30_000` and
`20_000`, `studio.present-pace` `30_000`. `studio.theme-depth` and `studio.controls` never
got theirs. Worse, the patchwork had produced a contradiction — `studio.controls.test.tsx`
waits `{ timeout: 6000 }` at `:257` and `{ timeout: 6000 }` at `:388`, **inside a 5000ms
test**, so that grace was unreachable and the test always died first.

## The change

- **`docs/vitest.config.ts` — `testTimeout: 20_000`.** Sized from the data: ~3.3x the
  slowest test that relies on this default under the reproduced contention (6.09s) and ~10x
  its idle cost. Deliberately generous, because the error is asymmetric — wrong high costs
  one slow report on a genuine hang; wrong low costs a red suite people learn to dismiss.
  Every existing explicit budget sits **at or above** 20s
  (`studio.present-autoplay-chain.test.tsx:71`'s `20_000` is the equal case), so this
  default weakens none of them, and it makes those two `studio.controls` waits reachable
  for the first time.
- **`studio.fuzz.test.tsx` — the journey property, `60_000` → `120_000`.** At 43.14s
  contended it had 1.39x of headroom: the next wolf-cry, queued up in the family #1328
  named. Raised to ~2.8x the contended measurement rather than cutting `numRuns` from 15,
  which would have bought the margin with fuzz coverage. Its sibling property (1.05s idle)
  keeps its `60_000` — it is nowhere near its ceiling.

**`hookTimeout` is deliberately untouched** at vitest's 10s default. The same argument would
apply to it, but no hook failure was observed in any run, and widening a budget with no
evidence behind it is how you mask the next real defect rather than the last one.

**`fileParallelism: false` / pinning the family to one worker was rejected.** It does not fix
the budget — it hides it by removing the contention, and pays for that with a much slower
suite on every developer's machine and in CI. The flake would come back the first time CI's
runner is busy for its own reasons.

## Verified

- **10 consecutive full `npx vitest run` in `docs/`, zero failures** (248 files, 3,274
  tests) — #1328's own acceptance bar.
- **3 further full runs under the four-burner contention that reproduced the flake**, zero
  failures. The plain-run bar cannot distinguish a fix from an idle machine; this one can.
- The reproduction above, run before the change, fails on the first attempt.

## What this does NOT claim

It does not claim the `studio.*` tests are free of `act(...)` warnings — they are not, and
the suite prints many. None of them produced a failure in any run recorded here, so they are
noise rather than the defect, and chasing them is a separate piece of work from #1328.
