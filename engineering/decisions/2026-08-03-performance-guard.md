---
status: in-progress
summary: Performance was defended by nothing — three timing harnesses existed and none gated anything, and one reported a phantom +124% regression on a healthy tree. Wall clock cannot be the gate on a shared runner (identical code measured 93.9ms and 43.1ms in one session), but the regression that actually hurt is a COUNT, not a duration. So the PR gate counts work and hard-fails the merge, while wall clock becomes a nightly head-vs-base alarm with cliff bands and an auto-filed issue.
---

# Guarding performance: count the work on the PR, clock it nightly

**Status:** all three slices shipped. The work-counter gate blocks merges; the nightly alarm
compares engine render + export rasterize head-vs-base and asserts preview/runtime ceilings.
The print re-place tier stays on-demand — see "What this does not do".

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

Extend `studio-preview-perf.spec.ts` and `bench` with a **cliff** band — several times today's
numbers, not a tight percentage. The failure mode worth catching is 13×; a band that tries to
resolve 10% will only ever produce noise on this infrastructure.

Two mechanisms, not one, because the two surfaces measure differently:

```
PREVIEW — absolute ceilings (no base checkout needed)
  worst healthy · typing      RENDER p50   5.3ms  → alarm above 30ms
  worst healthy · navigation  RENDER p50   6.3ms  → alarm above 30ms
  worst healthy · either      TOTAL  p50  20.6ms  → alarm above 70ms
  worst healthy · either      FRAME  p50   2.5ms  → alarm above 20ms

ENGINE + EXPORT — head vs base on the same runner, no absolute number at all
  engine render   ±60%, widened to max(60, baseRME + headRME)
  export rasterize ±80%, same widening
```

**A nightly with issue-filing already existed and I nearly rebuilt it.** `perf-nightly.yml` runs
Lighthouse over the docs site, head vs a base commit ~24h old, and opens or appends a single rolling
issue on regression. It measures PAGE LOAD — a different axis entirely — but the plumbing is exactly
what this needed (HARD RULE #15). So slice 2 is a second job in that workflow, reusing its
rolling-issue pattern with its own marker.

**Two comparison strategies, deliberately different:**

- **The preview spec asserts CEILINGS** (`test/benchmark/preview-budget.json`) — absolute budgets
  set against the WORST reading across three independent runs, machine-independent by construction,
  so no base checkout is needed. Worst healthy gallery typing is 5.3ms RENDER p50; the ceiling is
  30ms; the pre-#1280 regression was 63.2ms — caught at half its magnitude with 5.7x headroom.
  Mutation-checked by lowering a ceiling below healthy.
- **The engine bench compares HEAD vs BASE built on the SAME RUNNER**, never against the committed
  `baseline.json`. That file is machine-relative and a cold runner reads up to 2x high — comparing
  against a stored number is what produced the phantom +124%. Two builds measured minutes apart on
  one machine cancels the drift. Bands are cliffs (render 60%, export 80%), widened per dataset to
  `max(cliff, baseRME + headRME)`: the committed baseline's own RMEs span 0.9% to 11.5%, and the
  rasterize tier's charts deck reads ±66% at two iterations, so a flat band would fire on noise,
  get ignored, and mute the one real regression. `tools/perf-nightly-compare.mjs` does the diff and
  is mutation-checked six ways: identical runs exit 0, a 3x head exits 1, an empty summary exits 1
  as NOTHING WAS COMPARED, a wholesale rename exits 1 as dataset drift, a dead arm exits 1, and a
  missing argument exits 2 so a wiring bug is never filed as a regression.

The `printDatasets` hole is closed too: `bench:check` blessed four export timings and looped only
the render summary, so the export path could double in cost with a green check. It now compares them
(±50%, wider because a rasterize cycle is far more I/O-exposed than an in-process render), and only
when the run actually produced them, so a plain `bench:check` is unchanged.

### What review changed here, because the first cut of this slice shipped a claim it did not have

The adversarial pass found the nightly ran `engine-bench --json` with **no `--export`** on either
arm, so `print` was `null`, the comparator's export table returned before printing a row, and the
coverage claim below was false. Four things came out of fixing it, and each is a defect the original
would have shipped:

- **`--export` and `--print` are now separate flags.** They rode one flag, and the pair costs ~13
  minutes per arm — which is exactly why the job could not afford to pass it. Split, the rasterize
  tier is ~2 min per arm and runs nightly; the print re-place tier stays on-demand.
- **The export tier had no comparable shape.** It returned a raw `bench.table()` — display rows
  keyed `"Latency avg (ns)"` — so `export.summary` was `undefined` and nothing could have compared
  it whatever flag was passed. It now returns `{ main, summary }` like the render tier.
- **The comparator passed when it compared nothing.** Empty summaries and wholesale dataset renames
  both printed "No tier regressed past its band" and exited 0 — indistinguishable from health.
  Zero comparisons and dataset drift are now failures with their own wording.
- **Bands are variance-aware**, reusing `bench:check`'s `max(cliff, baseRME + headRME)`. The
  rasterize tier's charts deck reads ±66% RME at two iterations; a flat band would have fired on it
  nightly until someone muted the channel.

## Slice 3 — emulator + runtime paint (shipped, and smaller than planned)

Planned as "build two new harnesses". Investigation shrank it to one line of budget plus a finding.

**The emulator has no distinct RENDER path — but that is a narrower finding than the first cut
claimed.** `lattice-emulator.js:1673` calls `latticeEngine.createEngine()` and `:1683` calls
`engine.render()`; the P2 swap (`2026-06-11-emulator-on-engine-p2.md`) left the CLI a wrapper. So
`bench`'s render tier already times the engine work the emulator does, and a second harness for it
would measure the same code twice and need re-blessing twice.

**That does not mean the emulator is covered.** Measured here on `examples/a11y.md`: the full CLI
export takes **~8s wall**, of which `engine.render` is **~10ms — around 0.1%**. The other 99.9% is
the emulator's own pipeline: `inlineLogoMarkSvg`'s per-mark file reads, the per-section image-scrim
pass, the mermaid-cli subprocess per diagram, the in-page overflow/legibility probes, the measured
overflow split loop, font settle, `page.pdf()`, and the pdf-lib assembly. **None of that is
measured by anything**, and `bench --export` does not touch it — the rasterize tier drives its own
hand-built `srcdoc` through Puppeteer and never loads `lattice-emulator.js`.

So: no emulator *render* bench is needed, and an emulator *pipeline* bench is a real gap. It is
logged rather than built here, because the pipeline is dominated by subprocess and I/O time that
head-vs-base on one runner is the only sane way to compare — i.e. it is a second job, not a line of
budget.

**The in-frame DOM write was already being measured and thrown away.** The `@perf` spec has
collected `FRAME p50` on every sample since it existed and asserted nothing, so a change that made
the preview's DOM swap expensive was invisible. It now carries a ceiling like the other two:
observed 0.4–1.9ms across six deck/interaction pairs, ceiling 15ms.

**What FRAME is not** — and the first cut of this slice claimed otherwise. It does **not** cover the
resident runtime's pass (fit spine, chart paint, overflow watcher). On the patch path `frameMs` is
taken synchronously around the `innerHTML` swap plus `scaleFrame`, and the runtime re-processes the
swapped section from a `MutationObserver` microtask delivered *after* that span closes. The number
says so on its face: 1.8ms at 4× CPU throttle is an `innerHTML` assignment, not a gallery slide's
chart paint. Those costs land in `TOTAL`, which does carry a ceiling — so the surface is guarded,
just not by the metric the claim named. Measuring the runtime pass in isolation needs a hook the
runtime does not expose today.

So the coverage map, stated as what each mechanism actually exercises:

| surface | guarded by |
|---|---|
| Studio preview render | work-counter gate (PR) + RENDER ceiling (nightly) |
| in-frame DOM write | FRAME ceiling (nightly) |
| in-frame runtime pass | only via TOTAL — no isolated metric exists |
| engine render | head-vs-base same-runner compare (nightly) |
| export / rasterize | head-vs-base same-runner compare (nightly) |
| print re-place | `bench:check --print` on demand — 11 min/arm is too costly to run nightly |
| emulator | the engine row above covers its RENDER path, and nothing else — see below |

## What this does not do

- It does not measure time on the PR path, on purpose. A work counter cannot tell you that a render
  got 30% slower for the same amount of work — only the nightly can, and only past a cliff.
- **The counter counts renders, not the cost of deciding to render.** A regression inside the route
  decision itself — `needsDeckContext`, `positionIsTrustworthy`, `deckSectionFor`, all of which run
  per keystroke over the whole deck source — scores a perfect `calls: 1, wholeDeck: 0`. Review
  demonstrated 13.9ms of route-decision cost, 3× the entire RENDER budget, with the gate green.
  The preview RENDER ceiling would not see it either: it starts at the engine boundary. Only TOTAL
  would, and only nightly.
- **The print re-place tier is on-demand, not nightly** (`bench --print`, ~11 min per arm). Its
  blessed rows are compared by `bench:check --print`, which nothing runs on a schedule.
- **The emulator's own pipeline is unmeasured** — see slice 3. Its engine render is covered; the
  ~99.9% of its wall time that is not `engine.render` is not.
- **Ceiling headroom is 3–6×, not a uniform 5×.** Ceilings are keyed on interaction, not deck, so
  the same cap covers a 7.4ms and a 16.0ms healthy TOTAL. The thin end is gallery TOTAL (~3×
  against an admitted 2× session drift); the wide end means a 5× regression on a cheap deck stays
  green. Per-deck ceilings would fix both and were not worth the re-blessing surface today.
- The counters live in the docs tier because that is where the decision they guard lives
  (`single-slide-render.ts`). If that logic ever moves into `lib/`, the gate should move with it.
