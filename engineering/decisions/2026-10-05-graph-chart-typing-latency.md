---
status: shipped
summary: Where a graph chart's live-typing time goes, measured on the real Studio (production build). A key reaches its first drawn layout in 70–101 ms (median), and the router is 23–38% of that; the rest is the Studio's render (~30%), forced style reads before the worker is asked (16–24%) and paint (11–15%). The router's work cap is not the problem it was recorded as (0 capped routings on either bench deck). Proposes cutting the main-thread reads and stale worker jobs first, with identical drawings, and holding crossing-aware placement until it is wanted for drawing quality. The owner picked C, then D. C shipped (the editor's thread before the worker post fell from 4–9 ms to 1–3 ms a key, with identical drawings); D was built, measured slower (a fresh worker runs the kernel cold), and not shipped.
---

# Graph charts: where the typing time goes, and what to cut first (2026-10-05)

**Status: shipped** (option C; D measured and dropped, see the last section). Origin: the continuation brief after #2424, priority P1, and two
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

## What was built (2026-10-05, the owner's pick: C, then D)

The owner picked **C, then D**. C shipped. D was built, measured slower, and reverted.
B and A were not picked; A stays with its own follow-up
(`followups.d/2424-p3-trama-wrap-aware-placement.md`), judged on drawing quality.

**The harness is committed this time:** `tools/graph-typing-bench.mjs`. It drives the
production-built Studio, types the tail of three charts one key at a time, and times each
stage from outside the preview frame, so it measures any build unchanged. Its stages are
defined a little differently from the first harness's. "before" is the time from a draw's
start to its first worker post, so it includes the measure, and so does neither table here
compare with the one above. The three charts: an 11-state chain (`chain11`), the 9-state
incident machine from `examples/state-chart-stress.md` (`incident`), and the four-party
payments flowchart from `examples/flowchart.md` (`flow`).

### C: no forced style pass before the post (`pipeline.ts`)

Three changes, none of which moves a drawing:

- **The pending signature is read after the post, not before.** `post` writes nothing and
  answers on a later task, so the value is the same; its style and layout pass no longer
  sits between a key and the worker's start.
- **A mid-chain paint reads no signature.** The next round rewrites the figure in the same
  task, so that signature could never match, and reading it forced a style and layout pass
  for nothing. The final paint still records one.
- **The declared type floor is read once per draw**, after the skip checks while the style
  is still clean, and a round reads the stage's scale (`readVis`) after its writes. The floor
  belongs to the figure and the port, and every write lands on the box inside them, so a
  draw's own writes cannot change it. Read per round, it forced a style pass after each
  round's writes. A settle runs after a pause, so it reads the floor again (the checker's
  finding: a floor that changed meanwhile must still reach the drawing at rest).

Real Studio, production build, headless Chromium, 3 runs a cell. Median / p90 in ms. Each
"after" cell is two separate runs:

| chart @ ms a key | before: draw start → post | after | before: key → drawn | after |
|---|---|---|---|---|
| chain11 @600 | 6 / 10 | 2 / 5 · 2 / 6 | 77 / 115 | 73 / 111 · 83 / 109 |
| chain11 @150 | 9 / 12 | 2 / 5 · 3 / 5 | 89 / 151 | 80 / 111 · 84 / 128 |
| incident @600 | 6 / 10 | 2 / 4 · 2 / 5 | 106 / 166 | 101 / 176 · 112 / 169 |
| incident @150 | 8 / 25 | 3 / 29 · 4 / 18 | 112 / 178 | 113 / 210 · 111 / 175 |
| flow @600 | 4 / 6 | 1 / 2 · 1 / 2 | 60 / 74 | 57 / 74 · 64 / 82 |
| flow @150 | 4 / 6 | 1 / 2 · 1 / 2 | 60 / 74 | 56 / 72 · 68 / 91 |

The editor's thread before the post drops by **3–7 ms a key (about two-thirds)** on every
chart. That is what C can buy, and it is smaller than the note's 10–15 ms estimate. The key →
drawn total moves by less than the spread between two runs of the same build, so C is a
measured cut to one stage, not a visible speed-up. (The second `flow @150` run overlapped
another browser job and reads high.) The p90 of `incident @150` is the wait behind a busy
worker, which D was meant to remove.

**Drawings are byte-identical.** With `CAPTURE`, the harness hashes every drawing painted
while typing at 600 ms a key (the SVG, its viewBox and the box's style). Over 6 runs per
build, the before and after builds paint the same set of distinct drawings for every chart
(11, 20 and 14), and the same settled drawing in every run. The kernel did not change, so
every recorded kernel call is unchanged by construction.
`test/unit/trama/pipeline-draw.test.js` pins the order: post, then signature; no signature for
a mid-chain paint; the figure's and the port's floor read once for a draw, however many
rounds it runs, and not at all by a pass that skips; a pass during the flight still skips;
and a settle that sees a changed floor ends as a fresh page does. Each fails with its piece
of the change reverted.

### D: a warm spare worker, measured and not shipped

A worker cannot be interrupted, so D kept a loaded spare: when a key arrived while the
chart's job was still running, the busy worker was terminated and the spare took the job at
once. It removed the stale wait and **made the incident chart slower**, because a fresh
worker runs the kernel cold, before the JIT has warmed it:

| incident @ ms a key | C only: key → drawn | C + D | C only: router | C + D: router |
|---|---|---|---|---|
| 150 | 113 / 210 | 173 / 199 | 60 / 147 | 103 / 144 |
| 80 | 109 / 275 | 402 / 832 | 37 / 159 | 160 / 202 |
| 40 | 268 / 477 | 429 / 756 | 92 / 171 | 191 / 314 |

`chain11` and `flow` were unchanged within noise (they rarely go stale). This is the
"restart costs more than the job it saves" the option warned about, and the cost is JIT
warm-up, not the dagre load. A version that keeps two workers warm, by spreading jobs
across both, could avoid that. At human typing speeds (150 ms a key and slower) the stale
share is small (0–9 stale answers of 39–105), so it is not worth a second resident worker yet.

### Where this leaves the follow-up

`followups.d/2385-p1-graph-chart-live-layout-latency.md` is closed. Both of its "done when"
measures are met: an 11-state chain lays out in 43 ms in Node (above), and on the real
Studio its key → drawn p90 is 105–128 ms at every speed from 600 down to 40 ms a key. B is still on the table if a
later profile shows the router dominating. E (the Studio's own render, now the largest share
at 30–42 ms a key) is the next lever, and it is not graph-chart work.
