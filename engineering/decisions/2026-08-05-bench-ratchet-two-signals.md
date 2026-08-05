---
status: shipped
summary: "`npm run bench:check` was RED on a clean `main` — every dataset reading a ~20% regression before any change was made — because the committed baseline held absolute milliseconds from whatever machine last blessed it, so anywhere slower reads as a slowdown. A ratchet that is red by default is a ratchet nobody uses, which is exactly what happened: the `charts` row sat blessed at 14 slides against a 15-slide deck for over a month with the check printing the fix on every run and exiting 0. Fixed by splitting the two signals the gate had been conflating. WORKLOAD (a slide count moved; a row is new or missing) is machine-independent, so it now fails on ANY machine — that half was rotting precisely because it exited 0. TIMING is only a statement about the code when both numbers came off the same hardware, so the baseline records its runner (`blessedOn`) and the check compares fingerprints: same machine gates on wall clock, different machine reports and exits 0. A calibration probe — upstream markdown-it on a fixed synthetic document, timed by the same harness every run — makes the reported cross-machine figure an INDEX (dataset ms ÷ probe ms) so the committed diff reads as a trend rather than as a record of whose laptop ran it. The probe is deliberately not our code, or an engine-wide optimization would divide itself out. What it does NOT do is measured rather than assumed: it corrects clock speed, not contention (six spinners on four cores moved the probe +38% and the indices +26/+48/+49%), which is why it informs the reading and does not carry the assertion. `charts` re-blessed at its true 15 slides; the check is green on a clean tree."
builds-on: 2026-08-03-performance-guard.md
---

# The perf ratchet had two signals wearing one exit code

## The symptom

On a clean worktree of `main`, with nothing applied:

```
=== PERF CHECK · current vs committed baseline ===
dataset                base ms    now ms      Δ%    band  verdict
normal (jargon)           41.9      51.1   +22.1  ±12.0%  REGRESSION
charts                      14        15       —  slides  WORKLOAD CHANGED (re-bless)
stress (jargon x6)       115.4     139.6   +21.0  ±12.0%  REGRESSION
```

Two different things are wrong, and the gate was reporting them through one exit
code — which is how one of them rotted for a month.

## 1 · TIMING: absolute milliseconds are not portable

`test/benchmark/baseline.json` carried wall-clock milliseconds from whatever
machine last ran `bench:bless`, and `--check` compared against them directly. Run
anywhere slower — the cloud sandbox, a loaded laptop, a CI runner — and every
dataset reads as a ~20% regression before any change is made.

A ratchet that is red by default is a ratchet nobody can use. The next person
either re-blesses on their own hardware (moving the baseline to a number the NEXT
person cannot match either) or learns to ignore it. Both destroy what
HARD RULE #19 asks the baseline to be.

**The fix is to notice that a millisecond delta only means something about the
CODE when both numbers came off the same hardware.** The baseline now records its
runner — platform/arch, CPU model, core count, Node major — and `--check` compares
fingerprints:

- **Same machine** → wall clock, the existing variance band, **exit 1** on a
  regression. This is the workflow the gate is actually for (bless → change →
  re-check), and it keeps full teeth there.
- **Different machine** → the deltas print and the check exits 0, with a line
  saying why and what to do about it.

That is the issue's *"scope the gate to a pinned runner"* without needing a pinned
runner: the baseline records its own, and the check self-scopes.

### The calibration probe, and what it does not do

The cross-machine figure is an **index** — dataset ms ÷ a fixed probe timed in the
same run — so the committed file's diff reads as a trend rather than as a record of
whose laptop ran it.

The probe is **upstream markdown-it parsing a fixed synthetic document**, and it is
deliberately not our code. Normalizing against one of our own renders would make an
engine-wide optimization invisible: numerator and denominator would both fall and
the index would not move. markdown-it is the dominant cost class of what is being
measured (regex, string allocation, GC), so it tracks machine speed for this
workload while nothing in `lib/` can shift it.

**What it does not do was measured, not assumed.** It corrects for CLOCK SPEED, not
for CONTENTION:

| Condition | probe | indices |
|---|---|---|
| six spinners on four cores | **+38%** | **+26% / +48% / +49%** |
| quiet re-run | ±3% (its own RME) | moved *more* than the milliseconds did |

A 5 ms parse and a 150 ms render are not scheduled or garbage-collected alike, and
the index divides by a second measured quantity, so on the one comparison that
gates it would only add noise. Hence the split: **the index is the cross-machine
reading; wall clock is what the same-machine assertion is made on.** A markdown-it
version bump re-scales every index and will read as drift — correct rather than a
flaw, answered by a re-bless justified in the PR.

## 1b · TIMING, second half: the same machine is not the same machine STATE

Splitting the signals fixed "red on every machine that is not the blessing one."
It left a smaller version of the same defect in place: **on the blessing machine,
one noisy sample could still fail a tree nobody had changed.**

Measured here, on this repo's own cloud sandbox, two runs of an identical tree:

| run | `normal (jargon)` | probe |
|---|---|---|
| straight after a test sweep | **65.1 ms** | 5.10 ms |
| quiet, minutes later | **56.3 ms** | 5.03 ms |

15% apart against a ±12% band, and the fingerprint is identical both times — it
is the same four vCPUs, just not the same four vCPUs' *attention*. The probe sees
part of it and not enough of it, for the reason measured above: contention hits a
58-slide render harder than a 2200-line parse, so no single divisor rescues one
sample.

So the fix is not a wider band (which would hide a real 15% regression) or a
tighter probe guard (which would turn the gate off on the machine where it has
teeth). It is **a second sample**: a REGRESSION verdict earns a re-measurement,
and only a dataset that regresses on BOTH passes exits 1. Noise is not correlated
across passes; a regression is. The cost is paid only when something already
looks red, so a green run is unchanged, and the export tier — an ~11-minute
puppeteer arm that cannot be re-run on a hunch — stands on one pass with the wider
±50% band it already had.

Shipping without this would have reproduced the exact bug the issue was filed
for, one machine narrower.

## 2 · WORKLOAD: `charts` had been recording nothing since 29 July

`charts` was blessed at 14 slides and renders 15, which `--check` reported as
`WORKLOAD CHANGED (re-bless)` — **and exited 0**. So the row has been uncomparable
since the baseline was created, with the gate printing the fix on every run and
nothing making anyone do it.

The cause is worth naming because the issue asked for it. The baseline was created
in `f60b364` (2026-07-29) with `slides: 14`, and at that same commit
`lib/components/chart/chart.gallery.md` already rendered **15** — verified by
rendering the deck from a worktree at `f60b364`. The deck has not changed since
(`git log` shows `f60b364` as its last touch). So the row was blessed against a
14-slide render of that deck that corresponds to no committed state of `main`: a
pre-rebase bless that the rebase invalidated and nobody re-ran.

**A slide count is machine-independent**, so a moved one is unambiguous staleness
that any machine can detect. It fails on any machine now, and re-blessing is the
whole fix. `charts` is blessed at 15.

## What this is not

It is not a claim that `bench:check` should become a CI gate. HARD RULE #19 keeps
it on-demand — a wall-clock threshold in the merge train would be flaky on shared
runners — and nothing here changes that. What changes is that running it on a clean
tree now tells you the truth: green, or a specific stale row.

## Verified

- `npm run bench:check` on a clean tree: **exit 0**, all three datasets within
  ±2% of the blessed wall clock on the blessing machine.
- Corrupting `charts.slides` in the baseline back to 14: **exit 1**, naming the row.
- Checking against a baseline blessed by a different fingerprint: deltas printed,
  `DIFFERENT MACHINE — timing is REPORTED, not gated`, **exit 0**.
- A version-1 (unindexed) baseline is **refused** rather than reinterpreted —
  comparing its absolute milliseconds is the defect this removed.
- The two-pass path was exercised by driving it, not by reading it: with
  `tolerancePct` forced to 0.01 in a scratch baseline, pass 1 flagged two
  datasets, the run re-measured, pass 2 printed under `PERF CHECK · pass 2
  (confirming)`, and it exited **1** naming both. The baseline was restored
  afterwards (`git diff` clean).
- The print/export tier is re-blessed in this change, which is what makes
  `bench:check --print` green: `charts` was stale there at 14 slides as well, so
  the `--print` arm exited 1 on a clean tree for the same reason the render tier
  did. Both `printDatasets` charts rows now carry 15.
