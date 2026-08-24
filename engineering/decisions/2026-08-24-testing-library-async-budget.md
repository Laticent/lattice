---
status: shipped
summary: >
  #1799 fixed the docs flake class whose failure text is `Test timed out in 5000ms`. A second
  class survived on Testing Library's OWN clock — a bare `waitFor`/`findBy*` expires on
  `asyncUtilTimeout` (library default 1000ms) and the outer 20s budget is never consulted.
  #1806 filed it as an uncharacterized tail with 3.1-3.7x headroom and deliberately did not
  fix it. That headroom was measured on the wrong site. Reproduced here 2 of 3 contended full
  runs, always at `StudioShell.test.tsx:470`, and instrumented: 634.5 / 752.3 / **996.0** ms
  against a 1000ms budget — a wait sitting on its ceiling, not a tail event. The same
  React.lazy chunk waited on as the FIRST test of a fresh file costs 224-527ms across 72
  samples in those same runs, which is what #1806 measured. Fixed with a considered
  `configure({ asyncUtilTimeout: 5_000 })` in `docs/vitest.setup.ts` — 5.0x the slowest
  measured wait, deliberately more than #1799's 3.3x because a failing run yields no
  measurement, so 996ms is a censored floor rather than a maximum; and 4x inside `testTimeout`
  so an expired inner wait still reports what it was waiting for. Verified with 3 contended
  full runs green against the recipe that reproduced it 2 of 3 times before.
---

# The other clock: Testing Library's 1000ms `asyncUtilTimeout`

**Closes #1806.**

## Two clocks, and #1799 only reached one

A vitest `testTimeout` bounds the TEST. A Testing Library `waitFor` or `findBy*` bounds
ITSELF, on `asyncUtilTimeout`, which this repo left at the library default:

```
$ node -e "console.log(require('@testing-library/dom/dist/config.js').getConfig().asyncUtilTimeout)"
1000
```

When the inner clock expires first the outer one is never consulted, so #1799's 5s → 20s
`testTimeout` could not rescue this class and its note says so. The exposed surface is not
small: `docs/src/components/studio/*.test.tsx` holds **82** Testing Library `waitFor` calls of
which 11 carry an explicit budget, plus **283** `findBy*` of which 3 do.

## Reproducing it

Four busy loops against four vitest workers on four cores — #1328's recipe — around a full
`npx vitest run` in `docs/`:

```sh
cd docs
for i in 1 2 3 4; do (timeout 2400 sh -c 'while :; do :; done' >/dev/null 2>&1 &); done   # kill by PID
npx vitest run --reporter=dot
```

**Two of three runs failed**, both on the same test, both on the inner clock:

```
FAIL  src/components/studio/StudioShell.test.tsx > StudioShell — e2e flows (jsdom)
      > reaches Fabricate from the launcher (not a deck mode)
TestingLibraryElementError: Unable to find an element with the placeholder text of: /Describe a look/i
 Test Files  1 failed | 262 passed (263)
```

That is `StudioShell.test.tsx:470` — a bare `findByPlaceholderText` waiting for the
`React.lazy` Fabricate chunk, the same lazy boundary #1806's own instance
(`studio.theme-depth.test.tsx:66`) waits on.

## The measurement that changes the answer

#1806 declined to fix this on the grounds that the wait had **3.1-3.7x headroom** under its
budget in the condition where the failure was observed, making it an uncharacterized tail.
**That number is real, and it is measured on the wrong site.**

Instrumenting the wait that actually fails — a 60s budget so it reports its true duration
instead of dying at 1000ms — across three contended full runs:

| run | `findByText('Fabricate')` | **`findByPlaceholderText(/Describe a look/i)`** |
|---|---:|---:|
| 4 | 399.0 ms | **752.3 ms** |
| 5 | 485.7 ms | **634.5 ms** |
| 6 | 182.1 ms | **996.0 ms** |

996 of 1000. Headroom **1.00-1.58x**, and two of three uninstrumented runs went over. This is
not a tail event; it is a wait sitting on its ceiling.

### Why #1806's number and this one disagree

They measure the same chunk in two different places. Twelve probe files, each opening
Fabricate as the FIRST test of a FRESH file, inside those same contended runs — 72 samples:

| condition | n | min | p50 | p90 | max |
|---|---:|---:|---:|---:|---:|
| cold Fabricate wait, first test of a fresh file | 72 | 224 ms | 367 ms | 429 ms | 527 ms |
| the same chunk at `StudioShell.test.tsx:470` | 3 | 634 ms | 752 ms | — | **996 ms** |

`StudioShell.test.tsx:470` is the **23rd test in its file**, in a worker that has already
rendered `StudioShell` 22 times. Same import, roughly twice the cost. #1806 measured a copy of
`studio.theme-depth.test.tsx` — a fresh-file wait — and generalized from it. The lesson has the
same shape as the one #1799 wrote down about per-test budgets: **measure the site that fails,
not a site that resembles it.**

## The change

`docs/vitest.setup.ts`:

```ts
configure({ asyncUtilTimeout: 5_000 });
```

**Sized 5.0x the slowest measured wait, deliberately above #1799's 3.3x.** A run that FAILS
yields no measurement — the wait is truncated at its budget — so 996ms is a censored floor,
not a maximum, and a multiple has to be taken against a number known to be too small.

**The binding constraint is the outer budget, not the multiple.** 5s is 4x inside
`testTimeout`'s 20s, so a single expired inner wait still expires first and reports what it
was waiting for (`Unable to find an element with the placeholder text of: …`) rather than a
bare `Test timed out`. An inner grace the outer clock cannot reach is the contradiction #1799
found in `studio.controls.test.tsx` and fixed; this must not reintroduce it in the other
direction.

**Global, not one explicit budget on the failing wait.** The narrow fix was the honest option
if the tail had been fine — it is not. Two distinct sites, in two files, in two call shapes
(`waitFor` and `findBy*`), on the same lazy boundary; and eleven `waitFor`s in this suite
already carry private explicit budgets, every one of them above 5s. That is the same
five-authors-worked-around-the-same-default pattern #1799 argued from, one clock down.

**The 11 explicit budgets keep theirs**, all at or above 5s, so this weakens none of them.

## Verified

- **The knob is wired, proved by forcing it the wrong way** rather than by reading the source
  (the method #1799's own correction insists on): at `asyncUtilTimeout: 5` the `StudioShell`
  file goes red (2 failures / 92), at `5_000` it is green (92/92).
- **3 contended full runs green** under the recipe above — the recipe that failed 2 of 3
  before the change. A plain idle run cannot distinguish a fix from a quiet machine.
- The instrumented and probe measurements above, 75 samples in total.

## What this does NOT fix, and does NOT claim

**It does not claim the docs suite no longer flakes.** It claims a second specific class is
addressed: waits that expire on Testing Library's inner clock. What remains unmeasured is
whether any OTHER wait among the 82 + 283 sits closer to 5s than this one sat to 1000ms — the
survey here is two sites deep, not a census.

**`hookTimeout` is still untouched**, at vitest's 10s default, for the reason #1799 gave and
this note has now honored twice: no hook failure has been observed in any run recorded in
either note, and widening a budget with no evidence behind it masks the next real defect
rather than the last one. What changed here is that the evidence arrived — for this clock, and
still not for that one.

**The perf signal given up is the same one #1799 gave up, one level down.** A wait regressing
from 400ms to 4s will no longer go red by accident. Nothing measures that cost, and nothing in
this change adds anything that does.
