---
status: proposed
summary: >
  Blessing the four browser tiers produced the first side-by-side reading of the
  calibration probe against the datasets it is supposed to normalize, and the two
  disagree in DIRECTION, not just in magnitude. On one sandbox the render tier ran
  30% SLOWER in wall clock than the committed baseline while its `index` — probe-
  divided, the column that exists to make the file readable across machines — came
  out 27% FASTER. The probe moved 2.75ms to 4.94ms (+80%) where the engine moved
  +18% to +34%, so the divisor swamped the dividend. Six consecutive runs on an
  unchanged tree read the probe at 3.95 / 4.64 / 4.72 / 4.94 / 5.11 / 5.50ms, and
  NO single blessed value brings all six inside the +/-15% PROBE_BAND — the band
  needs a blessed probe of at least 4.783ms to admit the highest and at most
  4.647ms to admit the lowest, which is an empty range. An independent checker on
  the same machine class later read 3.78 / 3.82 / 3.85ms, below that whole range,
  and found the freshly blessed 4.94 stamp out of band on its own hardware. The
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

Six consecutive runs on an unchanged tree, same box, same session:

| | r1 | r2 | r3 | r4 (the bless) | r5 | r6 | spread |
|---|---|---|---|---|---|---|---|
| calibration probe ms | 3.95 | 4.64 | 4.72 | **4.94** | 5.11 | 5.50 | **~39%** |
| `normal (jargon)` ms | 55.6 | 54.8 | 53.0 | **56.34** | 56.0 | 62.7 | ~18% |
| `charts` ms | 46.9 | 47.8 | 48.8 | **48.92** | 48.5 | 52.5 | ~12% |
| `stress (jargon x6)` ms | 152.6 | 153.8 | 152.3 | **160.68** | — | — | 5% |

The probe drifts upward across the session and swings ~39% where the datasets
swing 12–18% — two to three times noisier than what it divides. Its recorded
`rmePct` moved with it: 1.42 blessed, 6.01 on the bless run.

**State the band claim carefully, because the obvious phrasing is wrong.** "The
spread is wider than the ±15% band" does not follow: a ±15% band spans 30%
end to end, so a 25% spread can sit inside it. The claim that *does* hold is about
whether any blessed value could admit the whole sample. A band around a blessed
probe `c` admits `0.85c ≤ x ≤ 1.15c`, so covering these six needs `c ≥ 5.50/1.15 =
4.783` **and** `c ≤ 3.95/0.85 = 4.647` — **an empty range.** No choice of blessed
value keeps this box in band against its own readings. (The first four readings
alone do *not* prove that: they admit `c ∈ [4.296, 4.647]`. The four-run subset was
what this note originally showed, and the claim was unsupported by it.)

**Two caveats on the sample itself, both against the bless.** Run 4 — the one whose
numbers are committed — is the **slowest of the session for all three datasets and
for the probe**, so the blessed baseline is roughly 5–7% permissive rather than
representative. And an independent checker on the same machine class, in a cold
session, read the probe at **3.78 / 3.82 / 3.85ms** — below this entire range, and
22% off the committed 4.94, which put the freshly blessed stamp out of band on its
own fingerprint. See §"What this means for the stamp this note ships with".

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
of the failure points somewhere: at ~4.9ms the probe is roughly 1/10th of the
smallest dataset it divides and 1/33rd of the largest — read the `index` column of
the blessed file, which is exactly that ratio (9.91 for `charts`, 32.55 for
`stress`) — so it runs far more iterations of far less work. That makes it the run's most sensitive instrument to
exactly what a shared sandbox supplies — scheduler jitter, a noisy neighbor, a JIT
tier-up landing in a different sample window — and the least representative of a
Lattice render, which spends its time in plugins and CSS the probe deliberately
excludes. `PROBE_BAND` was sized as if the probe were the steady quantity and the
engine the variable one. Measured here, it is the other way round.

## What this note does NOT decide

Three exits are visible and all of them change what `bench:check` gates for every
future PR, which puts them past the "decide and proceed" line in `CLAUDE.md`:

- **Widen `PROBE_BAND`** — cheapest, and wrong on its own: this box's readings span
  3.78–5.50ms, so a band that admits them all is roughly ±19% *at the best-placed
  center*, which is wide enough to admit genuinely different silicon — the one thing
  `comparableMachine()` exists to refuse.
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

**Tracked as #1856.**

## What this means for the stamp this note ships with

The measurements above were taken while blessing the four browser tiers (#1852), and
they indict that bless's own `calibration` stamp. Stated plainly so no later reader
has to reconstruct it:

- **The wall-clock half of the stamp is provisional.** `blessedOn` records
  `Intel(R) Xeon(R) Processor @ 2.80GHz` with a probe of 4.94ms. An independent run
  on that same fingerprint read 3.78–3.85ms — 22% off, out of band — so
  `comparableMachine()` refuses to gate there and the render rows print
  `slower (not gated)` on an unchanged tree. **Do not read "blessed on this machine"
  as "gates on this machine".** It gates only when the probe also lands in band,
  which on this sandbox class it frequently does not.
- **The stamp is permissive.** Run 4 was the slowest of its session, so the blessed
  render numbers sit roughly 5–7% above what the same box produces cold.
- **The workload half is NOT provisional and does not depend on any of this.** Slide
  counts, the sweep's `overflowing` counts, and the two new `exportDatasets` rows'
  screenshot counts gate on any machine, and they were unchanged by the bless.

Re-blessing on faster silicon would tighten the numbers and may make the probe land
in band. It is not a precondition for the workload signals, and the choice of exit
above may make it unnecessary — if `index` is dropped or the probe replaced, the
question of "which box blessed this" changes shape entirely.

### The sweep's blessed ratio fell 49× → 30.5×, and it is not a scope regression

Worth flagging because HARD RULE #19 makes this file's diff the durable record of
the sweep rework, and that record just halved. The cause is timer granularity, not
a widened scope: `scopedMs` for `normal (jargon)` went 0.1 → 0.2ms — one 0.1ms
bucket — and 6.1/0.2 = 30.5 where 4.9/0.1 = 49. A re-measure on the same box read
29×. The 3× floor the tier actually gates on is untouched and nowhere near.

This also undercuts the claim at `engine-bench.mjs` that the ratio is
machine-independent because "the hardware divides out": a ratio built on a
sub-millisecond measurement inherits that measurement's quantization, so it moves
between boxes anyway. **Read the blessed ratio as a floor check, never as a trend.**
Pre-existing, surfaced by this diff, logged here rather than fixed.

## Also found, not fixed

No browser-tier check block sets `won`. `won` is assigned only inside the render
loop (`test/benchmark/engine-bench.mjs`), so a genuine >50% export / print / CLI
improvement prints per row and the run still ends "Within variance band — no
regression" instead of prompting the ratchet. Pre-existing on `main` in all three
blocks and off the path of the bless; logged rather than pulled into the diff, per
HARD RULE #18. **Tracked as #1855.**

It is the mirror of the hole #1852 closes on the other side: that one lets blessed
rows disappear without failing the run, this one lets a genuine win go unrecorded.
