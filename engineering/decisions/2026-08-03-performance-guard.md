---
status: shipped
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

| fixture deck | renders | whole-deck parses | bytes to the engine | position |
|---|---|---|---|---|
| plain 40-slide | 1 | **0** | < deck/5 | offset + total |
| paginated (#1272) | 1 | **0** | < deck/5 | offset + total |
| gallery + dividers (#1280, the 63.2ms case) | 1 | **0** | < deck/5 | + deckSection |
| `glossary: auto` — **the control** | 1 | **1** | n/a | n/a |
| running `header:` — **tracked slow path** (#1333) | 1 | 1 | n/a | n/a |

The control row is load-bearing, and it has to be a fact that is **unsliceable by construction**.
`glossary: auto` appends a derived appendix slide, changing the deck's SLIDE COUNT, so no prefix
scan can ever serve a slice and the engine must count for itself. Without a control the suite would
pass just as well if the route logic always answered "slice" — the failure mode of a guard that
cannot fail. The running-header row records today's cost separately, and its failure message says
that going red there is the #1333 win landing rather than a regression. See "What the inversion pass
changed" for why that distinction is the difference between a ratchet and a lock.

**Mutation-checked, both halves:**

- reintroduce the pre-#1280 divider probe → the two gallery rows fail, everything else stays
  green, and the message reads *"the whole deck was re-parsed — this is the per-keystroke regression"*
- neuter `supplyablePosition` (the #1272 half) → all three position rows fail
- hand the engine the whole deck one byte different → the three fast-route rows fail on BYTES
- drop the supplied `deckSection` → the #1280 row fails
- make the route logic always answer "slice" → **both control rows fail and nothing else**

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
  rasterize tier's 58-slide deck read 82% RME at two iterations, so a flat band would fire on noise,
  get ignored, and mute the one real regression. `tools/perf-nightly-compare.mjs` does the diff and
  is mutation-checked six ways: identical runs exit 0, a 3x head exits 1, an empty summary exits 1
  as NOTHING WAS COMPARED, a wholesale rename exits 1 as dataset drift, a dead arm exits 1, and a
  missing argument exits 2 so a wiring bug is never filed as a regression.

The `printDatasets` hole is closed too: `bench:check` blessed four export timings and looped only
the render summary, so the export path could double in cost with a green check. It now compares them
(±50%, wider because a rasterize cycle is far more I/O-exposed than an in-process render), and only
when the run actually produced them, so a plain `bench:check` is unchanged.

### What the first real dispatch changed, and why reading was never going to find it

The job was written, reviewed by two adversarial agents, and re-reviewed — all by reading. Then it
was dispatched on the branch with `workflow_dispatch`, and **it failed on its first run, twice
over**. Both defects were invisible to every form of static review, and one of them was the exact
failure this whole document exists to prevent.

**1. The base arm ran the BASE COMMIT'S harness.** The lighthouse job overlays HEAD's collect
scripts into the base worktree; this job copied the plumbing and not the overlay. So the base arm
executed the base's `engine-bench.mjs` — which predated the `--export`/`--print` split, therefore
ran the print tier under `--export`, therefore needed `jspdf` from `docs/node_modules` that a root
`npm ci` never installs, and died with `Cannot find module 'jspdf'`. More generally: without the
overlay, **any change to what a flag MEANS makes the two arms measure different things**, silently.
Fixed by `cp test/benchmark/engine-bench.mjs /tmp/base/…` — head's harness, base's `lib/`.

**2. The alarm was mute — and I introduced that while fixing a different muteness.** Every GitHub
step runs under `bash -e`. `set -uo pipefail` adds `-u` and `pipefail`; it does **not** clear the
`-e` the shell was *invoked* with. So this:

```bash
node tools/perf-nightly-compare.mjs …      # exits 1 on a real regression
case $? in  0) …  1) echo "regressed=true" >> "$GITHUB_OUTPUT" ;; esac
```

kills the step at the `node` line. The `case` never runs, `regressed` is never set, and the issue
step's condition reads empty. **A real regression files nothing.** Reproduced directly:

```
OLD (bare cmd; case $?)     under bash -e →  (no output)  step exit=1
NEW (rc=0; cmd || rc=$?)    under bash -e →  SET regressed=true · reached end · step exit=0
OLD (cmd | tee; PIPESTATUS) under bash -e →  (no output)  step exit=1
NEW (cmd > log || S=$?)     under bash -e →  STATUS=1 · reached end · step exit=0
```

The preview-ceiling step carried the identical bug and **passed its first dispatch only because the
tests passed** — a genuine breach would have killed the step before `STATUS=` ran. The sibling
lighthouse job is correct because it uses `if node …; then`, a compound command `-e` does not fire
on; the rewrite to `case $?` lost that property without anyone noticing, twice.

**What the run also proved works:** the base arm died and the comparator reported
`NOTHING WAS COMPARED` and exited 1, instead of printing "No tier regressed past its band" and
exiting 0 the way the first cut would have. The guard caught its own harness failure. And the
preview ceilings passed on a real runner at 4x throttle (3 passed, 2.2m; gallery nav RENDER p50
3.2, TOTAL 10.0; gallery typing RENDER p50 2.2, TOTAL 8.9 — against 30/70/20).

**The transferable lesson:** a workflow is not verified by reading it, by an agent reviewing it, or
by CI being green — CI never runs the nightly. HARD RULE #23 says a verification claim names its
surface and carries an artifact from it; for a scheduled workflow the only surface is a dispatched
run. Dispatch it on the branch before merging.

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
claimed.** `lattice-emulator.js:1681` calls `latticeEngine.createEngine()` and `:1691` calls
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
observed 0.4–2.5ms across six deck/interaction pairs, ceiling 20ms.

**What FRAME is not** — and the first cut of this slice claimed otherwise. It does **not** cover the
resident runtime's pass (fit spine, chart paint, overflow watcher). On the patch path `frameMs` is
taken synchronously around the `innerHTML` swap plus `scaleFrame`, and the runtime re-processes the
swapped section from a `MutationObserver` microtask delivered *after* that span closes. The number
says so on its face: 1.8ms at 4× CPU throttle is an `innerHTML` assignment, not a gallery slide's
chart paint. Those costs land in `TOTAL`, which does carry a ceiling — so the surface is guarded,
just not by the metric the claim named. Measuring the runtime pass in isolation needs a hook the
runtime does not expose today.

So the coverage map, stated as what each mechanism actually exercises:

**Read this table as INTERACTIONS, not surfaces** — an inversion pass caught it claiming the
broader thing. The work counter covers ONE interaction (editor typing into the shown slide) through
ONE entry point, on three synthetic deck shapes. It does NOT cover the overview grid (whose N tiles
share a single module-level memo, so its failure mode is N whole-deck parses per modal open), the
Present overlay, or any deck already on the slow route.

| surface | guarded by |
|---|---|
| Studio preview render — editor typing | work-counter gate (PR) + RENDER/TOTAL/FRAME ceilings (nightly) |
| Studio preview render — rail navigation | RENDER/TOTAL/FRAME ceilings (nightly) — no PR gate |
| Studio preview render — overview grid, Present | **nothing** |
| in-frame DOM write | FRAME ceiling (nightly) |
| in-frame runtime pass | only via TOTAL — no isolated metric exists |
| engine render | head-vs-base same-runner compare (nightly) |
| export / rasterize | head-vs-base same-runner compare (nightly) |
| print re-place | `bench:check --print` on demand — 11 min/arm is too costly to run nightly |
| emulator | the engine row above covers its RENDER path, and nothing else — see below |

## What the inversion pass changed, and what it left standing

Lens 2 of the trio (HARD RULE #25) ran last, against what ships. It found no bug — everything works
as written — and one thing worth changing before merge, which is the kind of finding only this lens
produces.

**The control row pinned a fixable slow path as CORRECT.** It used a running `header:` deck and
asserted *"a deck-derived fact must still buy the whole-deck render."* But a running global is
**text**, and text is exactly what a prefix scan can supply — the same move `supplyablePosition`
already makes for position. Meanwhile **54 of the 58 committed decks on the slow route trip that
one probe** (#1333). So whoever lands that optimization finds this gate red, and the natural way to
green it — move the row into `FAST_ROUTE` — deletes the suite's only control, leaving a gate that
passes just as well if the route logic always answers "slice". The ratchet ages into a lock.

Fixed by moving the control to `glossary: auto`, whose appendix slide changes the deck's slide
count. The running-header row stays as a *tracked cost* whose failure message says going red is the
win landing, not a regression.

**And that fix was itself wrong, in the same way, one level down — caught by re-running the trio
after merge.** The fixture was `glossary: auto` with **no `acronyms:` registry**, and
`lib/core/glossary-auto.mjs` returns the source byte-identical when there are no entries. So nothing
was appended, the slide count did *not* change, and "unsliceable by construction" was false of the
very artifact asserting it — the control held only because the probe is a text match on the trigger.
Tightening that probe to the actual fact is a legitimate optimization that would have turned the
control red, with a comment above it saying that could never happen. The fixture now carries a real
`acronyms:` entry so the claim is true of it. Verified: 1680 bytes in, 1680 out, before the fix.

**What it left standing, and why.** Three findings are recorded rather than fixed, because they are
real but not merge-blocking:

- **The counter's incentive gradient rewards whole-deck regex sweeps in the docs layer.** The route
  decision runs five probes plus `deckSectionFor` over the whole source per keystroke — measured at
  ~1.5ms unthrottled / ~6ms at 4x on the 119-slide gallery, against a healthy RENDER of 3.7–5.3ms.
  It is uncounted and uncapped, so a developer adding a deck-scoped feature is rewarded for adding
  another sweep. That is a second hand-rolled deck parser growing in `docs/`, green forever. #1333
  carries it; the fix is a byte-budget on the route decision, which is the same trick this gate
  already uses, applied to the cost it currently exempts.
- **The head-vs-base arms are sequential, not interleaved.** This document's own evidence is that
  only an interleaved A/B resolved the truth, and what shipped is head-then-base, two processes and
  an `npm ci` apart, with a wide band absorbing the residue. An in-process interleaved A/B
  (`engine-bench --ab <ref>`) would resolve ~10% instead of a doubling, in ~30s, with no worktree
  and no comparator — and could plausibly gate a PR. That is the better design and it is not what
  shipped.
- **Guarding the fast path was the visible problem, not the hurting one.** A large share of decks
  sit on the slow route today — **54 trip the running-global probe and nothing else** (#1333), which
  is the figure that reproduces. An earlier draft said "30% of committed decks"; that one does NOT
  reproduce (re-measured at 9.8% / 23.6% / 22.8% depending on which corpus you take, and no corpus
  definition in the repo yields 30%). Engine render is ~0.1% of an emulator export. The nightly
  spends ~20 min/night on the most-measured, least-impactful surface at the coarsest resolution.

If `[perf-nightly-engine]` fires zero true positives and at least one harness-failure false positive
in six months, the right move is to delete the two bench arms and the comparator and keep the
preview ceilings — roughly 30% of the surface for most of the value.

## Slice 4 — cold boot gets a MEASUREMENT, and the ceiling that was going to come with it did not survive review (2026-08-11, #1586)

Every tier above measures a render that happens **after** the app is up. Nothing measures how long
it takes to *get* up, and the near-misses each fail for a different reason:
`studio-instant-shell.spec.ts` waits 45s on the preview iframe but asserts **layout**; Lighthouse
does load `/studio/` but LCP is per-document and the engine paints inside the `iframe.live` srcdoc,
which never contributes to the parent's; `script-size` and TBT catch bundle bloat rather than a
slower render, and both compare against 24h-ago `main`, so a few percent a day trips neither.

So the only thing that had ever failed on a slow cold paint was `gotoStudio`'s fixture wait — and
#1583 raised it from 15s to 45s for reasons about **worker starvation**, not about the app.

**What shipped: an observation, not a guard.** `waitForStudioPaint` annotates every paint it
performs as `first-paint` in the Playwright report, measured from the page's own navigation start.
Nothing asserts on it. The value is that the nightly now accumulates real-runner boot data
continuously, across ~49 spec files, which is precisely what nobody had when this slice tried to
set a number.

**What did not ship, and why — because the reasoning is the useful part.** A `@perf` ceiling of
6000ms was written, measured, mutation-checked, and withdrawn after the adversarial trio
(HARD RULE #25) put it on the real surface. Three independent, reproduced results killed it:

- **The statistic could not see the regression shape that matters.** A p50 of 7 cold boots passes
  a catastrophe. Demonstrated by stalling 3 of 7 documents by 18s: samples
  `19423, 19561, 19423, 1509, 1579, 1559, 1356` → **p50 1579ms, green**. Nearly half of cold visits
  taking 19.5s is exactly what a boot guard exists for. p50 is right for 20 keystrokes with one GC
  pause; for 7 boots a bimodal tail *is* the regression, and no assertion looked at the tail.
- **The number had ~1.3x real headroom, not the 4.5x recorded.** Pinned to 2 cores with two
  competing processes — the closest available analogue to a hosted runner also hosting the preview
  server — a **healthy** tree read p50 4.1–4.5s against the 6000ms cap, and a healthy single sample
  reached 5906ms. The recorded 1286–1345ms band never reproduced; independent runs put the minimum
  p50 at 1405ms and one full-tier p50 at 3044ms. "Observed variance is tight" was an artifact of a
  28-sample window taken on a quiet box.
- **The test destabilized the tier it lived in.** Creating and closing 7 browser contexts inside
  one test, under the config's `trace: 'on'`, failed **9 of 24 runs** with `ENOENT` on trace
  artifacts at `ctx.close()` (`--trace=off`: 9/9 green). That failure is *tokenless*, so on those
  nights `perf-nightly.yml` reports a harness failure, files nothing, **and the three working
  render ceilings above stop reporting too**.

**And a fourth, which is about the surface rather than the number.** The `@perf` tier is served by
`build:e2e`, which — unlike the deployed `build` — never runs `inject-modulepreload.mjs`:
`grep -c 'rel="modulepreload"' dist/studio/index.html` reads **0** after `build:e2e` and **50**
after the inject. So "a chunk stopped being preloaded" was unobservable by construction. Injecting
the hints and re-measuring showed why fixing that would not have helped either — p50 1766/2008/1995
with 50 preloads vs 1968/2012/1984 without, within noise, because the origin is `localhost` with
~0 RTT and round trips are the whole point of a preload. **A localhost cold-boot timing cannot see
network-shaped boot regressions at all.** The sibling `perf-collect.mjs` avoids this by injecting
before Lighthouse runs; a future boot guard belongs where that machinery already lives.

**The generalizable lesson, which is the reason this section exists at all.** Every gate in this
document was justified by *what regression it catches*. This one was justified by *what number a
healthy run produces* — and those are different questions. A budget sized from healthy readings
tells you nothing about whether the failure you care about would cross it, and here it did not:
the guard would have passed a 13x catastrophe while false-alarming a healthy runner. Size the next
one against a reproduced bad state, on a surface that can express it.

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
