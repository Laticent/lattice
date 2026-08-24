---
status: shipped
summary: >
  The docs vitest suite flaked in the `studio.*` family under full-suite load (#1328) — a
  different failing set every run, which is the failure mode that trains people to dismiss
  failures, and did: a real regression in #1312 was very nearly waved through as contention.
  The budget lands in the config rather than on a `studio.*` glob because the suite already
  carried TEN private per-test budgets across five files, every one ≥20s — five authors
  working around the same default, and the two files nobody had patched yet are the two that
  flaked. (An earlier draft justified this with a measured counterexample outside `studio.*`;
  an independent checker showed that was a regex artifact. See §"The near-5s pool".)
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

### The near-5s pool, and where the fix belongs

**A correction, kept in place because the error is instructive.** The first version of this
note claimed FIVE default-reliant tests crossed 5s across THREE files, two of them in
`lib/vetrina/deictic.test.ts`, and rested the global-vs-glob decision on that: a `studio.*`
carve-out "would have left deictic flaking." **That was false, and an independent checker
caught it.**

Both deictic rows carry their own explicit 25-second budgets and have since 2026-08-17
(`e510b3f`) — written in the **options-object** form, which the scan that produced the table
did not match:

```js
// deictic.test.ts:295 and :340 — invisible to a `}, 30_000);` grep
it('underline still sweeps its line before withdrawing to a rest behind it', { timeout: 25_000 }, async () => {
it(`${kind} goes straight there`, { timeout: 25_000 }, async () => {
```

Proof, rather than a second reading of the source — force the default to 50ms and see which
tests survive on a budget of their own:

```
$ npx vitest run src/lib/vetrina/deictic.test.ts --testTimeout=50
 ✓ underline still sweeps its line before withdrawing to a rest behind it   3538ms
 ✓ underline goes straight there                                            3656ms
 × (every test in the file without an explicit budget)   Test timed out in 50ms.
```

**The corrected pool is two tests, in two files, both under `docs/src/components/studio/`:**

| test | file | contended |
|---|---|---:|
| removes a saved theme… | `studio.theme-depth.test.tsx` | 6.09s |
| the human-in-the-loop gate: Present offers a reader view… | `StudioShell.test.tsx` | 5.09s |
| *(saves a named theme… — just under, at 4.94s)* | `studio.theme-depth.test.tsx` | 4.94s |

**So a directory-scoped carve-out WOULD have covered the whole observed flake pool.** The
empirical argument for a suite-wide default does not exist; it was an artifact of a regex
that could see one of the two ways this repo writes a per-test budget.

**The decision still stands, on the argument that survives.** The suite carries **ten**
explicit per-test budgets across five files, every one of them ≥20s, each added when someone
hit the wall in that file — `studio.fuzz`, `studio.present-autoplay-chain`,
`studio.present-pace`, `PlaygroundApp`, and `deictic` twice over in two different syntaxes.
That patchwork **is** the evidence: five independent authors concluded the 5s default was
wrong for their file and worked around it privately, and the two files that had not yet been
patched are the two that flaked. A glob would fix those two and leave the sixth author to
rediscover the same thing. The default is what is wrong, so the default is what this changes.

That is a weaker claim than the one it replaces — it argues from a pattern rather than from
a measured counterexample — and it is the true one.

(The three slowest tests in that run — `studio.fuzz` at 43.1s, `PlaygroundApp`'s toolbar
fuzz at 11.2s, and a `deictic` case at 8.8s — all carry their own explicit budgets already
and were never part of the flake.)

**Lesson worth keeping: a per-test budget in this repo is written two ways.** Any future
scan for one must match `it(name, fn, 30_000)` AND `it(name, { timeout: 25_000 }, fn)`, and
should be checked by forcing the default down rather than by reading the source.

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
test**, so the last second of that grace was unreachable: the test would have died at 5s
with a second still on the inner clock. (Those tests pass today — the grace was never
*reached*, not "always died". The same contradiction sits at `studio.controls.test.tsx:398`
and `StudioShell.test.tsx:326`, both `{ timeout: 5000 }` inside a 5000ms test.)

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

**Nothing replaces the perf signal this gives up, and that is worth stating.** At 5s a test
regressing from 2s to 4.9s would eventually have gone red by accident; at 20s it will not.
The docs side does have real perf guards — `perf-nightly.yml`, `docs/e2e/studio-preview-perf.spec.ts`
(hard render/frame ceilings), and the blocking `check-route-budget.mjs` — but **none of them
measures StudioShell mount + interaction cost**, which is exactly what these jsdom tests
exercise. So this trades an accidental canary for none at all on that specific cost. That is
consistent with `2026-08-03-performance-guard.md` (wall clock on a shared runner cannot gate
a merge) and with this repo having removed a wall-clock assertion for the same reason
(`docs/src/lib/intent-search.test.ts:90-113`) — but it is a real thing given up, not a free
win.

**`hookTimeout` is deliberately untouched** at vitest's 10s default. The same argument would
apply to it, but no hook failure was observed in any run, and widening a budget with no
evidence behind it is how you mask the next real defect rather than the last one.

**`fileParallelism: false` / pinning the family to one worker was rejected.** It does not fix
the budget — it hides it by removing the contention, and pays for that with a much slower
suite on every developer's machine and in CI. The flake would come back the first time CI's
runner is busy for its own reasons.

## What this does NOT fix: a second flake class, one level in

**The outer budget is not the only clock in these tests, and this change does not touch the
other one.** An independent checker running the reproduction recipe above against the
COMMITTED config still got a red run — a different failure:

```
FAIL  studio.theme-depth.test.tsx > edits all ten essentials and auditions the derived theme…
Error: Fabricate not loaded yet
```

That is thrown from a bare `waitFor` (`studio.theme-depth.test.tsx:66-68`) waiting for the
`React.lazy` Fabricate chunk. A bare `waitFor` runs on Testing Library's own
`asyncUtilTimeout`, which this repo leaves at the library default:

```
$ node -e "console.log(require('@testing-library/dom/dist/config.js').getConfig().asyncUtilTimeout)"
1000
```

`testTimeout` cannot rescue that wait — the inner clock expires first and the outer 20s is
never consulted. The exposed surface is not small: `docs/src/components/studio/*.test.tsx`
holds **83** `waitFor` calls of which **10** carry an explicit timeout, plus **280**
`findBy*` calls, essentially all on the 1000ms default.

**It is deliberately NOT fixed here, and the reason is the rule this note already states for
`hookTimeout`: no evidence of marginality, no change.** Measured, instrumenting that exact
wait:

| condition | first (cold) wait | subsequent |
|---|---:|---:|
| idle, file alone | 423ms | ~2ms |
| 4-way contention, file alone | 501 / 474 / 594ms | ~3ms |
| **4-way contention, inside the FULL suite** | **324 / 269ms** | ~3ms |

Both full-suite contended runs passed (249 files / 3280 tests, the instrumented copy
included). The wait sits at **3.1-3.7x headroom** under its 1000ms budget in the condition
where the failure was actually observed — *healthier* than the outer timeout's 2.5x was
before this change. The arithmetic that predicted otherwise (423ms x the 3.3x whole-test
contention factor) is wrong: this wait is dominated by module resolution, not React work,
and does not scale with CPU pressure the way a render-and-interact test does.

So the class is **real** — one observed red, with a mechanism that is fully understood — but
it is a **tail event I could not reproduce in five contended attempts**, and raising a second
global budget to chase an uncharacterized tail is how a suite stops being able to fail at
all. Filed as **#1806** with the artifact and this measurement instead.

**Update (2026-08-24): the class was fixed, and the headroom above was measured on the wrong
site.** Instrumenting the wait that actually FAILS — `StudioShell.test.tsx:470`, not a copy of
`studio.theme-depth` — gives 634.5 / 752.3 / **996.0** ms against the same 1000ms budget, and
it failed 2 of 3 contended full runs. The 3.1-3.7x headroom is real for that chunk waited on as
the FIRST test of a fresh file (72 samples, 224-527ms); the failing site is the 23rd test in a
worker that has already rendered `StudioShell` 22 times, and costs about twice as much. See
`2026-08-24-testing-library-async-budget.md`.

## Verified

- **10 consecutive full `npx vitest run` in `docs/`, zero failures** (248 files, 3,274
  tests) — #1328's own acceptance bar.
- **3 further full runs under the four-burner contention that reproduced the flake**, zero
  failures. The plain-run bar cannot distinguish a fix from an idle machine; this one can.
- The reproduction above, run before the change, fails on the first attempt.

## What this does NOT claim

**It does not claim the suite no longer flakes.** It claims one specific class is gone — the
one whose failure text is `Test timed out in 5000ms`. A second class survives, on Testing
Library's inner 1000ms clock (above), and this note's "3 contended runs, zero failures"
below is exactly three samples of an intermittent, not a proof. An independent checker
running the same recipe got a red on a different class; both results are reported.

It does not claim the `studio.*` tests are free of `act(...)` warnings — they are not, and
the suite prints many. None of them produced a failure in any run recorded here, so they are
noise rather than the defect, and chasing them is a separate piece of work from #1328.
