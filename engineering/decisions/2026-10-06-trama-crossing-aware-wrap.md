---
status: shipped
summary: Crossing-aware placement for Trama's graph charts, judged on drawing quality. The 1,000-chart fuzz corpus behind CROSSING_BUDGET never wraps (every one of its 39 crossings is a dagre layout), so the follow-up's premise (the reading-order grid pays those crossings) was measured wrong, and the work split into two levers. On the dagre path, a layout that routes with a crossing is laid out again with dagre's two other rankers and the cleanest kept within 3% of the type (39 → 31). On the grid, a layout that crosses moves one line break by one shape, or turns to the other direction, and takes the move only if it routes spotless, keeping reading order (a new 100-machine wrap corpus 42 → 26; the shipped state-chart slides 9 → 4; the stress deck's real browser calls 5 → 0). The adversarial review caught a combinatorial blow-up in the first build (45 s for a 36-state chain), now linear and pinned by a work-count test. The cost: the stress deck's incident machine lays out in 93–152 ms instead of 47–66 ms. Coffman–Graham layering was not built.
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

B, C and D keep every existing rule: reading order, the hard-fault ranking, a candidate's
bound, and the direction choice. B swaps a layout only for one with fewer crossings at no worse
fault count. C and D swap a layout only for one that routes **spotless**: no fault and no
crossing. Each change stays within 3% of the type. A layout that routes clean pays nothing,
which is most of them. A needs the owner, because it changes what the grid means. Its payoff
should also be measured on the wrap corpus this work adds, against the 26 crossings left
there, before anyone builds it.

### What was built (`docs/src/lib/trama/kernel.ts`)

- **`reranked`** (B). When a direction's routed layout crosses, `layoutOnce` runs again with
  `ranker: 'tight-tree'` and `'longest-path'` (`LayoutOptions.ranker`, passed to dagre's
  graph). An alternative is kept when it is no worse on hard and soft faults, ranks better,
  and its scale is at least 97% of the base and at most `reach`, the scale the direction was
  already judged by. That ceiling keeps the direction choice and `dagreCeil`'s bound exactly
  as they were. Without it the corpus reads 28, not 31. The 3 crossings it costs buy the
  guarantee that a wrapped and an unwrapped call agree on the dagre candidate.
- **`unevenSplits` and `opts.breaks`** (C). `placeFixed` now places by a list of line lengths.
  With no list it places the even split exactly as before (the checker compared 122 grid
  layouts byte for byte against HEAD). A near-even split is the even split with **one break
  moved by one shape**, so a line count has at most 2 × (lines − 1) of them. A grid candidate
  routes its even split first. When that crosses or faults, up to `SPLIT_TRIES` (2) splits are
  routed, largest bound first, and one replaces it only when it routes spotless. Its scale is
  held at or under the candidate's bound, which the pick reads as a ceiling.
- **A line count the even split cannot draw**, because a line would hold a lone state, joins
  only through a spotless split. If it would set the pick's floor and has none, it is dropped
  before the floor is read, so it can never set a floor of 0. The first build let such a line
  count join through its least-bad split, and the incident machine then won on type with
  **three** crossings (3 lines at 1.05) where main had one (2 lines at 0.76).
- **`calm`** (D). When the picked grid crosses, the grid with as many lines the other way is
  routed and taken only if it routes spotless.

### What the adversarial review changed

The tier-2 trio (red team, Munger inversion, independent checker) reviewed the first build
and found real defects. All are fixed in this commit:

| Finding | First build | Fix and result |
|---|---|---|
| Split enumeration was combinatorial: every split within one shape of even, each bounded | 686,011 splits for 38 shapes; a 36-state chain took **45 s** (183 ms on main) for the same drawing | Move one break by one shape; bound the splits only when the even split routes badly. That chain now reads routed 2 / bounded 28 (main: 1 / 18), pinned by a work-count test |
| `placeFixed` checked the even split before reading `breaks`, so a lone-state line count never got a candidate | the path was dead | `breaks` is checked first and on its own terms |
| A split could route above its candidate's bound, which the pick treats as a ceiling | 11 of 300 held-out picks above their bound | The split is held at or under the bound |
| Partial wins (fewer crossings, not none) flipped the layout as a name grew | layout changes 1 → 23 in 600 one-character edits | Spotless only. See the next paragraph for what remains |

**Flips while typing.** As one state's name grows a character at a time, the layout's line
breaks or direction now change in 24 of 600 steps (main: 1). Counting crossings that appear
or vanish as changes too, main already changes 33 times in the same 600 steps, against 34 with
this change. So the change mostly turns "a crossing appears" into "a box moves so it does
not", rather than adding motion. A box moving is the bigger visual event, though. Holding the
previous pick between keystrokes would need state carried across kernel calls, which an export
from a fresh kernel would not share, so it is left as an open question for the owner.

## 4. Measured

Same machine, both arms built from this tree (`git stash` of the kernel):

| Corpus | Before | After |
|---|---|---|
| fuzz, 1,000 charts, crossings (`CROSSING_BUDGET`) | 39 | **31** |
| wrap corpus, 100 machines, grid only (`WRAP_CROSSING_BUDGET`, new) | 42 | **26** |
| the same generator, 200 machines, with dagre | 56 | 44 |
| the same generator, 200 machines, grid only | 79 | 45 |
| shipped state-chart slides, 100 layouts | 9 | **4** |
| stress deck, real browser calls (bench fixture) | 5 | **0** |
| hard faults, every corpus above | 0 | 0 |

The checker's held-out seeds put the gains in proportion. On wrap charts with other seeds, the
grid gains hold (94 → 53). The second ranker gained nothing on four held-out 1,000-chart seeds
(39 → 39), so `CROSSING_BUDGET`'s drop is real on its own corpus but should not be read as a
general rate.

On the rendered decks, only `examples/state-chart-stress.pdf` changes, on two slides. The
wizard ("escape hatches") breaks 4/2 rather than 3/3 and loses its crossing at the same type.
The incident machine goes from two cramped lines (scale 0.76–0.84) with a crossing to three
columns (0.92–1.03) with none. No flowchart slide moves; none of the shipped ones routed with
a crossing.

**What it costs.** Nothing on a layout that routes clean. On one that crosses, at most two
more dagre routings (B), two more grid routings per routed candidate (C), and the other
direction's (D). Bench (`npm run bench`, GRAPH LAYOUT tier; the work counts are re-blessed in
`test/benchmark/baseline.json`):

| Replay | routed before → after | bounded before → after | ms before → after |
|---|---|---|---|
| flowchart demo deck page (10 calls) | 12 → 12 | 41 → 45 | 184 → 183–217 (noise) |
| state chart stress deck page (17 calls) | 18 → 24 | 61 → 72 | 528 → 778–869 |

The state chart's extra time is almost all the incident machine. Its four calls take 93–152 ms
each in Node, against 47–66 ms on main. That is what proving its 3-column, crossing-free pick
costs: a larger-type candidate now exists, so the pick routes more of the others to rule them
out. `SPLIT_TRIES` does not move it (1, 2 and 3 tries time the same). On the live Studio,
expect that chart's key → drawn to grow by roughly the same 50–90 ms. **UNVERIFIED on the
real Studio**: `tools/graph-typing-bench.mjs` was not run for this change. The brief ranked
drawing quality above speed. Whether this trade is right for live typing is the owner's call.

## 5. What this does not do

- **A (Coffman–Graham) is not built.** It is still the bigger lever on dense machines,
  but it gives up reading order, which is the owner's call. The wrap ratchet is now the place
  to measure it.
- **The 31 dagre crossings left** are mostly charts already at the type cap (1.2), where
  `reach` leaves an alternative no room. The follow-up's other half, nudging shared runs
  apart rather than trading them for crossings, is not done. It is filed as
  `followups.d/2424-p3-trama-nudge-shared-runs.md`.
- **Speed.** The follow-up's original done-when also asked for a faster GRAPH LAYOUT. The
  brief replaced that with drawing quality, and §4 measures what this costs instead.
