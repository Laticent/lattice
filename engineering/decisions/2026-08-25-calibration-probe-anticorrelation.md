---
status: proposed
summary: >
  Blessing the four browser tiers produced the first side-by-side reading of the
  calibration probe against the datasets it is supposed to normalize, and the two
  disagree in DIRECTION, not just in magnitude. On one sandbox the render tier ran
  30% SLOWER in wall clock than the committed baseline while its `index` — probe-
  divided, the column that exists to make the file readable across machines — came
  out 27% FASTER. The probe moved 2.75ms to 4.94ms (+80%) where the engine moved
  +18% to +34%, so the divisor swamped the dividend. Four consecutive runs on an
  unchanged tree read the probe at 3.95 / 4.64 / 4.72 / 4.94ms, a 25% spread that
  is itself wider than the +/-15% PROBE_BAND the probe is used to enforce. The
  instrument is noisier than the measurements it certifies and does not track them.
  Recorded, not fixed: re-sizing the band or replacing the probe changes what
  `bench:check` gates for every future PR, which is the human's call.
tags: [benchmark, performance, calibration, bench-check, hard-rule-19]
---

# The calibration probe is anti-correlated with what it normalizes (2026-08-25)

## Status

**Open — evidence recorded, no fix applied.** The probe's contract is what
`bench:check` gates on for every future PR, so changing it is not a decision this
note takes. What this note does is end the guessing: the probe has been suspected
of being noisy (#1382, and the continuation brief that prompted the bless), and
the numbers below are the first measurement of *how* it fails rather than *that*
it does.

## What the probe is for

`test/benchmark/baseline.json` records wall-clock milliseconds, which are
machine-relative, so the file carries two mechanisms to stay meaningful off the
machine that wrote it:

- **`comparableMachine()`** refuses a wall-clock comparison unless the fingerprint
  matches *and* the calibration probe reads within `PROBE_BAND` (±15%) of the
  blessed value. This is the gate.
- **`index`** (dataset ms ÷ probe ms) is what the check prints when the machines
  differ. It is reported, not gated, and it exists so the committed file's diff
  "read[s] as a trend rather than as a record of whose laptop ran it"
  (`engineering/workflow.md` §Performance).

Both rest on one assumption: **the probe — a stock markdown-it parse of a 2200-line
document, no Lattice plugins — tracks the engine's speed on the same box.**

## What the bless measured

Blessing all four browser tiers (`bench:bless -- --export --print --sweep --cli`)
re-runs the render tier unconditionally, which put this box's render numbers next
to the committed ones. The box is uniformly slower, and every tier agrees on that:

| tier row | blessed | here | Δ |
|---|---|---|---|
| `normal (jargon)` ms | 43.26 | 56.34 | **+30%** |
| `charts` ms | 36.39 | 48.92 | **+34%** |
| `stress (jargon x6)` ms | 136.52 | 160.68 | **+18%** |
| `print full · normal (jargon)` ms | 97112 | 120908 | **+25%** |
| `print re-place · normal (jargon)` ms | 63728 | 81690 | **+28%** |
| `cli · cover-paginate (4 nav)` ms | 2348 | 2722 | **+16%** |

Five independent workloads, in-process and browser, all say the same thing: this
silicon is 16–34% slower. Now the probe-divided column, on the same three rows,
from the same run:

| render row | blessed `index` | here | Δ |
|---|---|---|---|
| `normal (jargon)` | 15.72 | 11.41 | **−27%** |
| `charts` | 13.23 | 9.91 | **−25%** |
| `stress (jargon x6)` | 49.62 | 32.55 | **−34%** |

The column whose entire job is to divide hardware out reports a **large speedup on
a box that is measurably slower.** It is not merely imprecise — it has the sign
wrong. The cause is in one number: the probe went **2.75ms → 4.94ms, +80%**, while
nothing it normalizes moved more than +34%. The divisor outran the dividend, so
`index` fell.

## The probe is also the noisiest thing in the run

Four consecutive runs on an unchanged tree, same box, same session:

| | run 1 | run 2 | run 3 | run 4 (the bless) | spread |
|---|---|---|---|---|---|
| calibration probe ms | 3.95 | 4.64 | 4.72 | 4.94 | **25%** |
| `normal (jargon)` ms | 55.6 | 54.8 | 53.0 | 56.34 | 6% |
| `charts` ms | 46.9 | 47.8 | 48.8 | 48.92 | 4% |
| `stress (jargon x6)` ms | 152.6 | 153.8 | 152.3 | 160.68 | 5% |

The datasets are stable to within a few percent. The probe swings 25% — **wider
than the ±15% band it is used to enforce.** Its recorded `rmePct` moved with it:
1.42 blessed, 6.01 on the bless run.

Two consequences follow directly, and both are observable rather than predicted:

1. **The gate is a coin flip on a single box.** After a bless stamps one of those
   readings, the next run on *the same machine* has a good chance of landing more
   than 15% away from it and dropping to "NOT COMPARABLE — timing is REPORTED, not
   gated." That is the intermittent behavior the continuation brief described as
   "sometimes gates correctly and sometimes refuses."
2. **The trend line lies.** `index` is the only column a reader on another machine
   is offered, and on this box it misreports a 30% slowdown as a 27% speedup.

## Why a stock markdown-it parse is a poor divisor

Speculative, and flagged as such — the note stops at the measurement. But the shape
of the failure points somewhere: at ~4ms the probe is roughly 1/14th of the
smallest dataset it divides and 1/40th of the largest, so it runs far more
iterations of far less work. That makes it the run's most sensitive instrument to
exactly what a shared sandbox supplies — scheduler jitter, a noisy neighbor, a JIT
tier-up landing in a different sample window — and the least representative of a
Lattice render, which spends its time in plugins and CSS the probe deliberately
excludes. `PROBE_BAND` was sized as if the probe were the steady quantity and the
engine the variable one. Measured here, it is the other way round.

## What this note does NOT decide

Three exits are visible and all of them change what `bench:check` gates for every
future PR, which puts them past the "decide and proceed" line in `CLAUDE.md`:

- **Widen `PROBE_BAND`** — cheapest, and wrong on its own: a band wide enough for a
  25% swing is wide enough to admit genuinely different silicon, which is the one
  thing `comparableMachine()` exists to refuse.
- **Replace the probe with something the size of the workload** — e.g. time one
  blessed dataset and index the rest against it, or grow the probe document until
  its per-iteration cost is comparable to a render. Makes the divisor track the
  dividend by construction, at the cost of the probe no longer being independent
  of the engine under test.
- **Drop `index` and gate on fingerprint alone**, accepting that the file is only
  readable on the machine that wrote it. Honest, and a real loss — it is the
  cross-machine trend line #1382 asked for.

Until one is chosen, read `index` deltas in this file's history with the probe
value beside them; a large `index` move with no corresponding `ms` move is the
probe, not the engine.

## Also found, not fixed

No browser-tier check block sets `won`. `won` is assigned only inside the render
loop (`test/benchmark/engine-bench.mjs`), so a genuine >50% export / print / CLI
improvement prints per row and the run still ends "Within variance band — no
regression" instead of prompting the ratchet. Pre-existing on `main` in all three
blocks and off the path of the bless; logged rather than pulled into the diff, per
HARD RULE #18.
