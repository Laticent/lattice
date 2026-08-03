---
status: in-progress
summary: >
  Performance was defended by nothing: three timing harnesses exist, none gates anything, and one
  is unreliable enough to report a phantom +124% regression on a healthy tree. Wall clock cannot be
  the gate on shared runners — identical code measured 93.9ms and 43.1ms in one session. But the
  regression that actually hurt (a keystroke re-parsing forty slides instead of one) is a COUNT, not
  a duration: deterministic, machine-independent, and impossible to flake. So the PR gate counts
  work and hard-fails the merge, while wall clock moves to a nightly alarm with cliff thresholds and
  an auto-filed issue. Slice 1 (the counter gate) is shipped and mutation-checked; the nightly alarm
  and an emulator/runtime harness are designed here, not built.
---

# Guarding performance: count the work on the PR, clock it nightly

**Status:** slice 1 shipped (the work-counter gate). Slices 2–3 designed, not built.

## The problem

Performance is a first-class product property here, and it was defended by nothing.

Three harnesses exist. None of them gates anything, and one of them lies:

| surface | harness | baseline | compared? | gated? |
|---|---|---|---|---|
| engine render (Node) | `npm run bench` | yes | yes, ±12% | **no** — on-demand |
| export / rasterize | `bench -- --export` | **blessed but never read** | **no** | no |
| Studio preview typing / navigation | `studio-preview-perf.spec.ts` | **none** | **no** — "printed, not asserted" | no |
| emulator | — | — | — | — |
| runtime paint (in-frame) | FRAME in the `@perf` spec | none | no | no |

`grep -rln "bench:check\|@perf\|equiv:check" .github/workflows/` returns nothing.

So the headline win of #1280 — gallery-deck typing **63.2ms → 4.9ms**, a 13× improvement on every
keystroke — was protected by nobody. Reintroduce the per-keystroke deck parse tomorrow and every
gate stays green while the nightly prints a worse number into a log nobody reads.

## Why wall-clock cannot be the gate

The obvious move is to assert the timings. It does not work here, and the evidence is a session
spent being fooled by it.

Measuring `normal (jargon)` repeatedly on ONE machine across ONE session, identical code:

```
93.9ms  →  69.0  →  64.2  →  39.6  →  44.9  →  43.1
```

A monotonic warm-up, a 2× spread. Run `bench:check` first thing and it reports a **+124%
regression** on a healthy tree. I believed it, then "proved" a +62% regression by comparing an
early-session HEAD against a late-session baseline — a confounded experiment I called decisive.
Only an interleaved A/B (alternating arms so drift hits both equally) got the true answer: **+6.4%,
inside the ±12% band.**

An earlier session hit the same wall and said so at the time: *"Machine is noisier now (everything
is up ~40%), so I'll compare within this session."*

A gate that cries wolf gets ignored, and an ignored gate is worse than none. Wall-clock on a shared
runner cannot resolve anything smaller than roughly 2×.

## The insight: the regression is a COUNT, not a duration

The thing that hurt was never fundamentally "milliseconds". It was **amount of work**: one
keystroke re-parsing forty slides instead of one.

That is a counting fact — deterministic, machine-independent, measured in milliseconds of test time,
impossible to flake. So:

- **The PR gate counts work.** One keystroke = one engine render of one slide, with its deck
  position supplied. Hard-fails the merge.
- **The nightly clocks it.** Generous cliff thresholds, an auto-filed issue, no merge impact.

You get a hard gate without the flake, and an alarm without the false alarms.

## Slice 1 — the work-counter gate (shipped)

`docs/src/lib/preview-work-budget.test.ts`, in the docs vitest tier — which runs in `docs-build`,
which is in `ci.needs`, so **it blocks the merge**.

It mocks `renderMarkdown` and counts, per simulated keystroke: how many renders ran, how many were
handed the WHOLE deck rather than a slice, and what position each slice received.

| fixture deck | renders | whole-deck parses | position supplied |
|---|---|---|---|
| plain 40-slide | 1 | **0** | yes |
| paginated (#1272) | 1 | **0** | yes |
| gallery + dividers (#1280, the 63.2ms case) | 1 | **0** | yes |
| running `header:` — **the control** | 1 | **1** | n/a |

The control row is load-bearing: a running global is *text*, so there is nothing to hand over and
the whole-deck render is correct. Without it the suite would pass just as well if the route logic
always answered "slice", which is the failure mode of a guard that cannot fail.

**Mutation-checked, both halves:**

- reintroduce the pre-#1280 divider probe → the two gallery rows fail, everything else stays
  green, and the message reads *"the whole deck was re-parsed — this is the per-keystroke regression"*
- neuter `supplyablePosition` (the #1272 half) → all three position rows fail

## Slice 2 — the nightly alarm (shipped)

Extend `studio-preview-perf.spec.ts` and `bench` with committed baselines and a **cliff** band —
roughly 5× headroom over today's numbers, not a tight percentage. The failure mode worth catching
is 13×; a band that tries to resolve 10% will only ever produce noise on this infrastructure.

```
gallery · typing    RENDER p50   4.9ms  → alarm above 25ms
gallery · navigation             1.4ms  → alarm above 15ms
engine  · normal                41.9ms  → alarm above 120ms
export  · print full · normal   115.8s  → alarm above 300s
```

**A nightly with issue-filing already existed and I nearly rebuilt it.** `perf-nightly.yml` runs
Lighthouse over the docs site, head vs a base commit ~24h old, and opens or appends a single rolling
issue on regression. It measures PAGE LOAD — a different axis entirely — but the plumbing is exactly
what this needed (HARD RULE #15). So slice 2 is a second job in that workflow, reusing its
rolling-issue pattern with its own marker.

**Two comparison strategies, deliberately different:**

- **The preview spec asserts CEILINGS** (`test/benchmark/preview-budget.json`) — absolute budgets
  with ~5x headroom, machine-independent by construction, so no base checkout is needed and drift
  can never fire them. Healthy gallery typing is 4.4ms RENDER p50; the ceiling is 25ms; the
  pre-#1280 regression was 63.2ms. Mutation-checked by lowering the ceiling to 2ms.
- **The engine bench compares HEAD vs BASE built on the SAME RUNNER**, never against the committed
  `baseline.json`. That file is machine-relative and a cold runner reads up to 2x high — comparing
  against a stored number is what produced the phantom +124%. Two builds measured minutes apart on
  one machine cancels the drift. Bands are cliffs (render 60%, export 80%), because even same-runner
  the bench's own RME runs 3-17% and a band that resolves 15% would fire on noise, get ignored, and
  mute the one real regression. `tools/perf-nightly-compare.mjs` does the diff and is
  mutation-checked: identical runs exit 0, a 2.2x head exits 1 with a per-dataset table.

The `printDatasets` hole is closed too: `bench:check` blessed four export timings and looped only
the render summary, so the export path could double in cost with a green check. It now compares them
(±50%, wider because a rasterize cycle is far more I/O-exposed than an in-process render), and only
when the run actually produced them, so a plain `bench:check` is unchanged.

## Slice 3 — emulator + runtime paint (shipped, and smaller than planned)

Planned as "build two new harnesses". Investigation shrank it to one line of budget plus a finding.

**The emulator needs no harness, and that is a result rather than a shortcut.**
`lattice-emulator.js:1673` calls `latticeEngine.createEngine()` and `:1683` calls
`engine.render()` — the P2 swap (`2026-06-11-emulator-on-engine-p2.md`) left the CLI a wrapper with
no render path of its own. `bench`'s render tier already times exactly the code it runs, and
`bench --export` times the PDF/rasterize tier it adds on top. An emulator bench would measure the
same code twice and then need re-blessing twice. Recorded in `preview-budget.json` so the next
person does not build it.

**Runtime paint was already being measured and thrown away.** The `@perf` spec has collected
`FRAME p50` on every sample since it existed — the in-frame runtime's own cost (fit spine, chart
paint, overflow), as distinct from the engine's HTML production (`RENDER`) and the end-to-end span
(`TOTAL`). Nothing asserted it, so a runtime change could double the cost of every keystroke in
silence. It now carries a ceiling like the other two: healthy is 1.4–1.9ms, ceiling 15ms.

So all five surfaces from the original coverage map are now covered, by three mechanisms rather
than five harnesses:

| surface | guarded by |
|---|---|
| Studio preview render | work-counter gate (PR) + RENDER ceiling (nightly) |
| runtime paint | FRAME ceiling (nightly) |
| engine render | head-vs-base same-runner compare (nightly) |
| export / rasterize | head-vs-base same-runner compare (nightly) |
| emulator | the engine + export rows above — it has no distinct path |

## What this does not do

- It does not measure time on the PR path, on purpose. A work counter cannot tell you that a render
  got 30% slower for the same amount of work — only the nightly can, and only past a 5× cliff.
- It counts the **preview** path. Slices 2 and 3 are what extend the discipline to engine, export,
  emulator, and runtime.
- The counters live in the docs tier because that is where the decision they guard lives
  (`single-slide-render.ts`). If that logic ever moves into `lib/`, the gate should move with it.
