---
status: shipped
summary: Crossing-aware placement for Trama's graph charts, judged on drawing quality. The 1,000-chart fuzz corpus behind CROSSING_BUDGET never wraps (every one of its 39 crossings is a dagre layout), so the follow-up's premise (the reading-order grid pays those crossings) was measured wrong, and the work split into two levers. On the dagre path, a layout that routes with a crossing is laid out again with dagre's two other rankers and the cleanest kept within 3% of the type (39 → 31). On the grid the pick is unchanged; a picked grid that crosses tries moving one line break by one shape, then the other direction, and takes either only if it routes spotless (a new 100-machine wrap corpus 42 → 24; the shipped state-chart slides 9 → 4). Two review rounds and the real-Studio typing bench shaped it: the first build was combinatorial (45 s on a 36-state chain) and admitted new line counts; the shipped one calms only the pick, pins its line breaks while typing, and types level with main on the same machine. Coffman–Graham layering was not built.
---

# Trama: crossing-aware placement, measured where the crossings are (2026-10-06)

**Status: shipped.** Origin: `followups.d/2424-p3-trama-wrap-aware-placement.md`, P1 of the
continuation brief after #2527. The brief judged this item on drawing quality (fewer
crossings), not speed, and asked for a design note with the owner's pick. The owner was
away and had pre-authorized decide-and-proceed, so this note records the pick I made, why
I made it, and what I measured. Every option it did not build stays open.

## 1. The premise did not reproduce

The follow-up said the reading-order grid "places boxes blind to the lines" and that the
fuzz corpus "went from 10 to 39 crossings" because of it. The 39 are real, but **none of
them is on the grid.** The corpus in `test/unit/components/graph-layout.test.js` never
passes `wrap`. With `wrap: true` added it still wraps **0 of 1,000** charts: half hold a
group, which the grid cannot lay out, and the rest fit on one line. Every one of the 39
crossings (on 35 charts) is a dagre layout.

So "CROSSING_BUDGET lower" and "crossing-aware wrap placement" are two pieces of work. A
change to the grid alone could not have moved the budget the follow-up named. The grid's own
crossings were counted nowhere:

| Corpus | Layouts | Wrapped | Crossings on main |
|---|---|---|---|
| fuzz, 1,000 charts (`CROSSING_BUDGET`) | 1,000 | 0 | 39 |
| shipped state-chart slides, two stages (`state-chart.test.js`) | 100 | 34 | 9, all wrapped |
| stress deck, real Chromium calls (bench fixture) | 17 | most | 5 |

Seen on the slides, the wrapped crossings share one cause. Reading order puts a side state
(`Blocked`, `Escalated`) on the line where the even split happens to land it, and its two
lines back to its anchor then cut across the run between.

## 2. The options

- **A. Coffman–Graham rows** (the follow-up's own proposal). Layer the graph with a width
  bound and order each row by barycenter, so placement settles the crossings. It
  **rewrites the grid's contract**: shapes stop being in reading order, and reading order
  is the state chart's rule, kept from v1. It is large, and nothing measured its payoff.
- **B. Re-rank a crossing dagre layout.** dagre minimizes crossings among *its* edges,
  but the router draws its own orthogonal lines, so a placement dagre scored clean can still
  route with a crossing. When one does, try dagre's other two rankers and keep the
  cleanest. This targets the 39.
- **C. Move the grid's line breaks.** Keep reading order and keep each line within one
  shape of the even length, but let a break move, so a side state lands beside its anchor
  rather than under the run. This targets the grid.
- **D. Crossings in the grid's direction tie-break.** The pick prefers the stage's own
  direction. When that direction's grid crosses, try the same line count the other way.

## 3. The pick: B + C + D, and not A

B, C and D keep every existing rule: reading order, the hard-fault ranking, every
candidate's bound, the direction choice and **the wrap pick itself**. B swaps a dagre layout
only for one with fewer crossings at no worse fault count. C and D refine only the grid the
pick already chose, and only to one that routes **spotless** (no fault, no crossing). Each
stays within 3% of the type, and a layout that routes clean pays nothing. A needs the owner,
because it changes what the grid means. Its payoff should be measured on the wrap corpus this
work adds, against the 24 crossings left there, before anyone builds it.

### What was built (`docs/src/lib/trama/kernel.ts`, `pipeline.ts`)

- **`reranked`** (B). When a direction's routed layout crosses, `layoutOnce` runs again with
  `ranker: 'tight-tree'` and `'longest-path'` (`LayoutOptions.ranker`, passed to dagre's
  graph). An alternative is kept when it is no worse on hard and soft faults, ranks better,
  and its scale is at least 97% of the base and at most `reach`, the scale the direction was
  already judged by. That ceiling keeps the direction choice and `dagreCeil`'s bound exactly
  as they were. Without it the corpus reads 28, not 31. The 3 crossings it costs buy the
  guarantee that a wrapped and an unwrapped call agree on the dagre candidate. A fixed
  placement (a grid, or the caller's positions) is never reranked, because dagre does not
  place it.
- **`calm`** (C + D), at the pick's two return points only. When the picked grid crosses or
  faults, `calm` bounds the near-even splits of that line count (`unevenSplits`: the even split
  with **one break moved by one shape**, at most 2 × (lines − 1) of them). It routes the
  largest one (`SPLIT_TRIES` = 1), then the grid with as many lines the other way, and returns
  the first that routes spotless at 97% of the type or more. Otherwise the pick stands.
- **`opts.breaks` and `Geometry.breaks`.** `placeFixed` places by a list of line lengths, and
  places the even split exactly as before when the list is unset. A calmed pick names its
  breaks.
- **The live pin carries the breaks** (`pipeline.ts`). While the author types, the pipeline
  does not search: it pins the last search's grid and lays that out. The pin held only lines
  and direction, so a moved break drew the even split while typing and jumped back at every
  pause. It now holds the breaks too, and a test checks that the pinned call reproduces the
  searched drawing byte for byte, in one routing.
  **Seen on the real Studio, with a control.** I instrumented two production builds (the
  pipeline logged each key's pin) and typed into the stress deck's wizard one key at a time.
  The builds include the runtime bundle (`dist/lattice-runtime.js`), which carries its own copy
  of the pipeline; an earlier control that rebuilt only the docs site never ran its change.
  Every key consulted the pin, `{ lines: 2, dir: 'lr', breaks: [4, 2] }`. With the breaks
  passed on, the drawing held 4/2 through every key and at rest. With them dropped (the
  control), it jumped to 3/3 on the first key and back to 4/2 at the pause.

### How review and measurement shaped it

| Round | Found | Changed |
|---|---|---|
| Trio (red team, inversion, checker) on build 1 | Split enumeration was combinatorial: 686,011 splits for 38 shapes, **45 s** for a 36-state chain (183 ms on main). `placeFixed` checked the even split before reading `breaks`. A split could route above its candidate's bound. Partial wins flipped the layout while typing (1 → 23 per 600 one-character edits) | One break moved by one shape; `breaks` read first; a split held under the bound; spotless only |
| Checker on build 2 | Long chains with markers still took 1.3–1.5 s (main: 0.5 s): every live candidate that crossed routed splits that never came out spotless | Calm only the pick |
| Real-Studio typing bench on build 2 | The incident machine's 3-line pick, a line count the even split cannot draw admitted through a split, typed at 244 / 305 ms. Its pin could not hold the uneven split, so every key searched | No new line counts; the pin carries breaks; no rerank of a fixed grid |

**Flips while typing.** The pin holds the pick between keystrokes, and the search runs on the
settle after a pause, as it did on main. So a calmed pick moves the drawing only where a settle
on main would have moved it anyway, on a new search. The first round's harness ran every key
as a fresh search, which the Studio never does. Counted that way, main already changes its
drawing in 33 of 600 steps once a crossing appearing counts as a change.

## 4. Measured

Same machine, both arms built from this tree:

| Corpus | Before | After |
|---|---|---|
| fuzz, 1,000 charts, crossings (`CROSSING_BUDGET`) | 39 | **31** |
| wrap corpus, 100 machines, grid only (`WRAP_CROSSING_BUDGET`, new) | 42 | **24** |
| the same generator, 200 machines, with dagre | 56 | 43 |
| the same generator, 200 machines, grid only | 79 | 50 |
| shipped state-chart slides, 100 layouts | 9 | **4** |
| stress deck, real browser calls (bench fixture) | 5 | **4** |
| hard faults, every corpus above | 0 | 0 |

The red team's held-out seeds put the gains in proportion. The grid gains held there, but the
second ranker gained nothing on four other 1,000-chart seeds (39 → 39). So `CROSSING_BUDGET`'s
drop is real on its own corpus, but it is not a general rate.

**On the decks.** Every committed PDF that holds a graph chart was re-rendered and diffed.
Only `examples/state-chart-stress.pdf` moves, on one slide: the wizard ("escape hatches")
breaks 4/2 rather than 3/3 and loses its crossing at the same type, in light and dark. Its
incident machine keeps main's layout: two lines, one crossing. Build 1 drew it in three
crossing-free columns at larger type, which is what made it type at 244 ms (above). It is
the case to take up again with A.

**Live typing on the real Studio** (`tools/graph-typing-bench.mjs`, production build, headless
Chromium, 3 runs a cell, median / p90 ms from key to drawn, both arms on this machine):

| chart @ ms a key | main | this change |
|---|---|---|
| chain11 @600 | 77 / 114 | 80 / 105 |
| chain11 @150 | 83 / 115 | 76 / 105 |
| incident @600 | 221 / 287 | 233 / 294 |
| incident @150 | 287 / 699 | 266 / 662 |
| flow @600 | 63 / 98 | 58 / 75 |
| flow @150 | 63 / 129 | 61 / 70 |

Level with main, within the spread between runs. This machine is slower than the one the
2026-10-05 note measured on, so compare within a table, not across notes.

**The search's cost** (`npm run bench`, GRAPH LAYOUT; work counts re-blessed in
`test/benchmark/baseline.json`). The replay runs every call as a full search, which the
Studio does only on a settle or an export:

| Replay | routed before → after | bounded before → after | ms before → after |
|---|---|---|---|
| flowchart demo deck page (10 calls) | 12 → 12 | 41 → 41 | noise |
| state chart stress deck page (17 calls) | 18 → 23 | 61 → 70 | 528 → 771–835 |

The extra routings are `calm` on the incident machine, which crosses and has no spotless
alternative. A 36-state chain reads routed 2, bounded 26 (main: 1, 18), and a test pins it.

## 5. What this does not do

- **A (Coffman–Graham) is not built.** It is still the bigger lever on dense machines,
  but it gives up reading order, which is the owner's call. The wrap ratchet is now the place
  to measure it.
- **The 31 dagre crossings left** are mostly charts already at the type cap (1.2), where
  `reach` leaves an alternative no room. The follow-up's other half, nudging shared runs
  apart rather than trading them for crossings, is not done. It is filed as
  `followups.d/2424-p3-trama-nudge-shared-runs.md`.
- **Speed.** The follow-up's original done-when also asked for a faster GRAPH LAYOUT. The
  brief replaced that with drawing quality. §4 measures the cost instead: none on live typing,
  and five more routings on the stress deck's search replay.

## 6. Amendment: A as an opt-in, `rearrange` (2026-10-06, the owner's call)

The owner's pick on A: **an option an author enables, never the default.** Kernel option
`order: 'graph'`; the author's word is the `rearrange` modifier on `state-chart` and
`flowchart` (`data-sc-order` / `data-fc-order` on the figure). Off, every result is the
same as before, byte for byte.

**What it does.** `graphOrder` orders the shapes by the graph. It runs Coffman–Graham on the
reversed graph, so the layers fill from the sources down, and it orders each layer by the
mean position of the shapes it comes from. A side state written last (Blocked) lands in
the layer after the state it leaves (In Progress), beside that state's other successor (Code
Review). The textbook run from the sinks up sank every sink, Blocked included, to the end
ring's layer, so it was reversed. A chain comes back in its own order, so it draws as written.

**Where it applies, and why there.** The graph order is not the order of every grid candidate.
Measured that way, it crossed MORE than the written order: on the wrap generator's 200 charts,
50 → 74 grid only and 43 → 64 with dagre, because layers did not line up with the grid's lines.
So the pick is still made in written order, and `calm` adds one alternative: the same line
count in the graph's order. It is kept when it has fewer faults and then fewer crossings, which
is a lower bar than the spotless one the default holds, because the author asked for the
states to move. The written-order alternatives (`calm` above) still run after it. So turning
`rearrange` on never adds a fault, and never adds a crossing to a chart with the same faults.
A test holds this chart by chart on the wrap corpus. Across faults it can add crossings: the
checker found one machine in 290 (19 states, no dagre) where the graph's order removed two lines
through shapes at the cost of 13 → 22 crossings. That follows the kernel's ranking everywhere, where
a line through a shape outranks any number of crossings.

A pin is checked against the chart's direction only. An author who adds or removes `rearrange`
while typing keeps the old order on screen until the settle after the pause, which searches
again, as for any other edit that leaves the direction alone. This was reasoned from the code and
not driven in the Studio.

| Corpus | off | `rearrange` |
|---|---|---|
| wrap ratchet, 100 machines, grid only | 24 | **12** (`WRAP_GRAPH_BUDGET`) |
| wrap generator, 200 machines, with dagre | 43 | 28 |
| wrap generator, 200 machines, grid only | 50 | 34 |
| shipped state-chart slides, 100 layouts | 4 | **2** |
| hard faults | 0 | 0 |

**The pin carries the order.** `Geometry.seq` names the order a drawing used, and the live
pin replays it (`pipeline.ts`), as it does `breaks`. A `seq` that does not name every shape
exactly once is refused (`placeFixed` returns null), and the pipeline's existing branch for a
stale pin searches again.

**Seen on the real export** (`examples/graph-chart-rearrange.md`, light and dark): the stress
deck's ten-step pipeline goes from Blocked at the end to Blocked beside Code Review. An
eight-step sales flowchart with a trial and a legal detour goes from 2 crossings to 0 at the
same type size. A chain with `rearrange` draws exactly as without it. The badges keep
numbering states by their place in the list, so a rearranged chart still shows the written
order.

