---
status: proposed
summary: Where a graph chart's live-typing time goes, measured on the real Studio (production build). A key reaches its first drawn layout in 70–101 ms (median), and the router is 23–38% of that; the rest is the Studio's render (~30%), forced style reads before the worker is asked (16–24%) and paint (11–15%). The router's work cap is not the problem it was recorded as (0 capped routings on either bench deck). Proposes cutting the main-thread reads and stale worker jobs first, with identical drawings, and holding crossing-aware placement until it is wanted for drawing quality. The owner picks.
---

# Graph charts: where the typing time goes, and what to cut first (2026-10-05)

**Status: proposed.** Origin: the continuation brief after #2424, priority P1, and two
follow-ups, `followups.d/2385-p1-graph-chart-live-layout-latency.md` and
`followups.d/2424-p3-trama-wrap-aware-placement.md`. The brief asked for a design note
before any kernel change, confirmed with the owner in one round. This is that note.

## The premise did not reproduce

The brief said "every routing of these charts hits the router's 20,000-evaluation cap",
and proposed crossing-aware wrap placement and nudging shared runs to cut the router's cost
under that cap. This PR added two counters to the kernel (`stats.evals`, `stats.capped`) and
measured it three ways:

- **The bench** (`npm run bench`, GRAPH LAYOUT): the state-chart stress deck routes 18
  times for 68,761 evaluations, and **0** routings are capped; the flowchart demo deck
  routes 12 times for 4,425, also 0 capped.
- **The brief's own charts**, captured from a Chromium export of an 11-state chain, a
  12-state machine with a composite, and the 11-step flowchart
  (`.scratch/router/charts.md`): the 11-state chart routes once, in **2,018**
  evaluations, and lays out in **43 ms** warm in Node. The flowchart takes 31 ms.
- **A sweep** of every recorded call × three type scales (1, 1.6, 2.4) × three stage
  shapes, 288 layouts: **3 of 348** routings reach the cap.

So the cap is rare, and the follow-up's Node target (an 11–14-state machine under 150 ms)
is already met. The earlier figure most likely summed evaluations over a session rather
than per routing, but that cannot be checked now.

## Where the time goes on the real Studio

A real-Studio typing harness (`.scratch/typing/typing-bench.mjs`, production build,
headless Chromium) typed the last 30–36 keys of each chart and timed every stage of every
key. Medians / p90 in ms, 3 runs a cell:

| | 11 states @600 | 11 states @150 | 12 + composite @600 | flowchart @600 | flowchart @150 |
|---|---|---|---|---|---|
| **key → first layout drawn** | **87 / 126** | **101 / 134** | **78 / 98** | **70 / 119** | **94 / 132** |
| Studio render (key → slide patched) | 27 / 36 | 27 / 38 | 27 / 37 | 25 / 35 | 26 / 36 |
| main thread before the post (measure, `sigNow`, `showPrev`; sum of stage medians) | 15 | 19 | 18 | 11 | 15 |
| the router, in the worker | 29 / 51 | 33 / 42 | 18 / 26 | 21 / 64 | 34 / 52 |
| paint (adapter, SVG write, fit) | 11 / 15 | 13 / 17 | 11 / 18 | 8 / 13 | 12 / 16 |
| messaging, both ways | ~1 | ~1 | ~1 | ~1 | ~1 |

As a share of the mean: the router is **23–38%**, the Studio render 27–36%, the main thread
before the post 15–24%, paint 11–15%, and messaging about 2%. At 150 ms a key, the flowchart
also spends 13% waiting behind a worker job a newer key has already made stale (29 of 111
answers were thrown away; 27 of 117 on the 11-state chart).

These numbers are lower than #2424's (138 / 236 ms for the 11-state chart): the harness is
new, and its stages are defined differently, so the two are not a before and after.

## The options

Each option names what it costs, what it buys (from the table above), and whether the
drawings change.

- **A. Crossing-aware wrap placement, then nudging shared runs (the follow-up's proposal).**
  Rows become a width-bounded layering with barycenter order, so crossings are settled at
  placement. *Buys:* at most part of the router's share, 18–34 ms a key; fewer crossings.
  *Costs:* a rewrite of the grid path in the shared kernel, the adversarial trio, and
  every wrapped drawing changes (both chart decks re-rendered and reviewed). *Risk:* high.
- **B. Router micro-work with identical drawings.** The profile's top self-time entries are
  candidate building (`build` 9%, `simplify` 4%), `costOf` (7%), and dagre's own graph
  calls (7%). A route call tries ~282 candidates, builds ~204 and fully evaluates ~137, so
  building lazily saves little. *Buys:* perhaps 15–25% of the router's share, 4–8 ms a key.
  *Costs:* small; byte-identity is checkable on 288 recorded layouts and the 1,837 the unit
  suites make.
- **C. Stop forcing style recalculation before the post.** The state chart's redraw
  signature reads `getComputedStyle(…).font` on three harness elements
  (`state-chart.layout.js`, `styleSig`), and the pipeline computes the signature three
  times a draw (`pipeline.ts`, `sigNow`), each right after a DOM write, so each read forces
  a style recalculation: 455–582 ms of self time over a 36-key run. *Buys:* most of the
  15–24% main-thread share, an estimated 10–15 ms a key, on the editor's own thread.
  *Costs:* moderate; the signature is what keeps a resize or a font load from redrawing for
  nothing, so it must stay correct. Drawings do not change.
- **D. Drop stale worker jobs at speed.** A worker cannot cancel a job, so at 150 ms a key
  a new key waits behind one a newer key has made stale. Terminating and restarting the
  keys' worker when its job goes stale (a warm restart costs a dagre `importScripts`), or
  splitting work across two key workers, removes the wait. *Buys:* the 13% stale share at
  fast typing. *Costs:* a restart costs more than the job it saves on a slow chart; it needs
  measuring before it ships. Drawings do not change.
- **E. The Studio's render** (27 ms a key: React to the preview's effect ~12, a frame wait
  ~7, the patch ~8). This is Studio work rather than Trama work, and it serves every
  component, not only graph charts. Out of scope here; worth its own note.

## Recommendation

**C, then D, then B; hold A.** C and D act on the largest shares a graph chart owns (the
main thread before the post, and the stale wait at speed), and neither changes a drawing.
B is cheap and safe but small. A is the most expensive and the riskiest, and the
measurements give it the least to win on speed: the router is a third of a key at most. A
is still worth doing for **drawing quality** (fewer crossings: the fuzz corpus pays 39 since
joins became a hard rule), and should be judged on that, with its own design round.

## What this PR did and did not do

It added the two kernel counters and the bench's `evals` / `capped` columns, so a later PR
shows the router's cost in work, not milliseconds. It changed no layout. Options A to E
wait for the owner's pick. The two follow-ups stay open, with this note's numbers.
