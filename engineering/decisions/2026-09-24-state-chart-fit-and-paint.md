---
status: in-progress
summary: The state chart was janky three ways — it snapped after every edit and redrew forever while idle, it painted a plain slate stripe down every node and carried status on a corner sticker, and a long machine could only shrink (a 10-state chain set its names at 4.6px on 16:9). It now draws in the frame it appears and settles, lets a status paint the node in gantt's mark language, and picks direction and line count by fit — wrapping a long chain in reading order through one grid producer that every chain, and a branching machine that cannot fit, is drawn from.
---

# state-chart: fit, wrap, and paint

The owner's brief: the state chart "doesn't share the same look and feel as other
charts", "the plain spectrum to its left looks odd", "on the studio or playground
there is a delay and then it snaps", and "when there are more states it just
shrinks and becomes hard to read — maybe it should wrap nodes." Two design forks
were put to the owner and settled: **fit-driven direction + reading-order wrap**
(over a boustrophedon snake, or direction-only fit), and **gantt's mark language**
(over only dropping the stripe).

## 1. The jank was two defects, both measured on the real Playground

Filmed with a MutationObserver and a rAF counter inside the preview iframe
(`.scratch` harness; the method is in the PR body):

- **The snap.** After an edit, the new figure was inserted at frame 149 and drawn
  at frame 151. For two frames the hidden-until-drawn measuring column painted —
  labels floating beside empty boxes — and then the SVG replaced it. Nothing drew
  the new figure: the layout pass observed only the figures present at its FIRST
  call, and the draw that did happen came from the OLD figure's ResizeObserver as
  it collapsed on removal. **Fix:** the runtime's mutation microtask (which already
  replays Mermaid SVG before first paint) now draws any undrawn state chart that has
  a box, and the pass observes every figure on every call. After: inserted and drawn
  in the same frame.
- **The idle loop.** `draw()` rewrote `svg.innerHTML` and probed label lines by
  rewriting each label's `innerHTML`. The runtime answers any childList mutation
  under `<body>` with a debounced content pass, which calls `draw()`. So an idle
  slide redrew every ~160ms forever. **Fix:** skip the SVG write when the markup is
  identical, and cache the line probe by (text, width). After: three passes on an
  edit, then silence. A unit test pins it (it fails on the old pass).

## 2. Paint: a status paints the node

Before: every node neutral, a plain `--diagram-stroke` stripe down every node's
left edge, and status folded into a colored disc overhanging the corner. The stripe
carried no information and is exactly what gantt removed from its unstated bars
(`gantt.styles.css`, `.gantt-bar-accent:not([data-s])`). Now:

- A status tints the tile, inks its edge, and draws a leading accent (clipped to
  the tile's rounded corner). No status: a neutral tile, no accent. `deferred` is
  hollow and dashed, as on gantt.
- ONE status table in the stylesheet drives the HTML node, the inline row, the SVG
  tile, its accent and the legend chip — gantt's lesson about parallel tables
  drifting. The legend chip is a tiny node, not the retired pill disc.
- **Status tiles use the pill's stops (18/30 light, 42/54 dark), not the family's
  bar ramp.** Measured with `tools/composed-contrast.js`: the bar ramp (up to 64%
  hue into black) put the state name sub-AA on forty dark theme pairs. The pill
  stops are the family's AA-vetted recipe for text on a status tint. The tool now
  scores the name and ordinal on each status tile, pinned to the CSS.
- The ordinal is a quiet numeral on every node, taking the name's ink on a status
  tile (at `--text-body` it measured as low as 3.2:1 there), and set at the chart's
  text floor after the letterbox (below).

## 3. Layout: fit-driven direction, reading-order wrap

**The measurement that motivates it** (real Playground, 16:9, rendered label height):

| States | vertical (old default) | `lr` |
|---|---|---|
| 4 | 10.7px | 18.6px |
| 6 | 7.4px | 13.2px |
| 8 | 5.7px | 10.0px |
| 10 | 4.6px | 8.1px |

**`gridLayout`** lays a chain out on a grid in reading order — every line runs the
same way and a connector drops through the channel to the next line — and returns
the same `{pos, pts}` shape `dagrePositions` does. That is the whole integration:
the painter, arrowheads, label walk and `curved` already draw a routed polyline, so
this is a second producer and no second painter. Routes are orthogonal: straight to
the next state, loops (skips, back-edges) through the channel beside their line,
the adjacent line through the channel between, two or more lines via a side gutter.
Self-loops keep the column router's corner hook, in a lane the grid reserves.

**Every chain is drawn from the grid, one line included.** The column router drew
chain labels ON the line under a halo while dagre drew them BESIDE it, so the
component had three label styles and switched between two at an arbitrary state
count. The column router now draws only self-loop hooks and the unmeasurable-node
fallback.

**Choosing.** Candidates are each allowed direction × each line count (dagre in
each direction too, for a branching machine), scored by the letterbox factor `k`
they would get in the real figure viewport. The first candidate in preference order
(fewer lines, then the preferred direction — the stage's own aspect) that comes
within **12%** of the best wins. The score is **capped at 1.2× body size**: past
that, a wrap buys no legibility, and uncapped a four-state chain folded into a 2×2
square because the square letterboxed bigger. Measured on a bare 16:9 stage (no
subtitle or caption): 4 and 5 states stay a row; 6 wraps 3+3; 12 wraps into three
rows of four. The count follows the room the slide leaves: on the feature deck,
where a subtitle, caption and legend take their share, 12 states take two rows. With no direction token the
build stamps `data-sc-fit="auto"` and both directions compete; `lr` and the new
`tb` pin the direction and still wrap. `curved` is a stroke style and pins nothing.

**Branching machines** still go to dagre first, but the grid's wrapped layouts
compete by the same margin — dagre cannot wrap, and the stress deck's ten-step
pipeline with one fork sat on a single row at a fraction of body size. dagre's `lr`
rank gap also gained the grid's `labelMargin` air, so the two layouts agree.

**Routing quality, each rule bought with a failing test or a render:**

- Loops on one side NEST (the longer one outside) and loops heading opposite ways
  do not interleave. Sorted naturally, the wizard's four back-edges into one state
  crossed six times.
- Each loop takes the side (above/below its line) where it interleaves least — the
  column router's gutter balancing, for a grid. `3→5` beside `4→6` must cross on
  one side.
- The crossing channel is ORDERED: each run is inserted where it costs the fewest
  stub crossings, then runs share a lane only with runs they do not overlap.
- A label anchors on its route's longest run (below a horizontal one, right of a
  vertical one) and avoids other edges' runs. At the arc-length midpoint,
  `regression` floated between two runs and `block`/`unblock` lay across their own
  lines.

**Two CSS changes the fit needs.** `.state-node { flex-shrink: 0 }`, so a node's
box does not depend on which way its measuring column runs (the pass scores both
directions from one measurement). `.state-chart-scale { width: max-content }`:
`fit-content` capped the box at the figure's width, so a long row overflowed its
own box, clipped its end ring, and fitted against a box narrower than the drawing.

**The upscale ceiling.** The letterbox used to grow a small machine without limit
(the 2026-07-16 self-scale note: "fills UP when there's room"). Measured, a
three-state row set its names at 48px (2.2x body) and a portrait five-state column
at about 2.5x — boxes that read as a poster. The fit now stops at 1.6x body size
(`MAX_OVER_BODY`); the shrink direction is untouched.

**A node holds its longest word.** `max-width: 25cqi` caps a node on a narrow
stage and a single word cannot wrap, so on a portrait slide "Acknowledged" painted
wider than its tile — on `main` as well, just smaller. `min-width: min-content`
wins over the max-width when they disagree.

**The ordinal is sized and placed from its tile.** A wrapped machine letterboxes
below 1, and the ordinal went to 5.8px — the export's TYPE FLOOR warning named five
slides of the feature deck. A CSS floor on the counter-scaled `--chart-text-min`
fixed that and, at a low k, pushed the numeral out of its tile (the red team: 30 of
30 outside at k = 0.32). The pass now sizes it itself — the chart's text floor on screen at the chosen
layout's k, at most 30% of the tile's height — and anchors
it to the tile's corner rather than to the 9px HTML slot.

**The ordinal's size, after review.** The owner found the numeral small and crammed
into the corner. Two floors exist: the engine's hard floor (1% of slide height, 7.2px at
720, the export's TYPE FLOOR line) and the chart family's text floor (`--chart-text-min`,
11px at 1280, what every edge label paints at). The numeral had been sized just above the
first, and read as a speck. It now takes the second, on screen after the letterbox, with
one inset on both axes measured to the digit's ink. The node's side padding grew from
1.25cqi to 1.5625cqi so the name's last letter does not sit under it.

**The `inline` card list is one table.** Each card is a subgrid row of a three-column
grid: numeral, name, transitions. The flex rows it replaced pushed the chips right with
`space-between`, so a card with three chips started them after the name and a card with
one floated it to the far edge. Three other defects came out in the same look: the row's
neutral `--fill-hue` sat at the status table's specificity and later in the file, so a
status never tinted a card; the row's `border` shorthand reset the status accent; and the
end state's outline ring made the last card wider than the rest. The neutral default now
sits in a `:where()` rule, the card restates its accent, and the ring is an inset
`::after`. In `lr` the cards run in a row and lay their parts out in a line again.

## 4. What the adversarial trio found, and what changed

The red team, the inversion lens and the independent checker (HARD RULE #25) each
reproduced defects in the first cut. Every one below was fixed in this PR and has a
test or a re-run probe behind it.

- **Labels were budgeted at 11px and painted at 11px/k.** An edge label's CSS size
  is floored by `--chart-text-min`, which applyFit counter-scales by 1/k; every gap
  and label box assumed 11px. Labels landed on nodes (feature deck), past the
  canvas (a 30-state machine, CONTENT CLIPPED), across their own lines. The label
  geometry is now scaled by the size a label will paint at — per candidate, from
  that candidate's own k, re-laid-out once.
- **Two edges could draw one line.** A node's rising stub met the stub dropping
  out of the node above it end to end, so the headline machine read
  "Draft -> Approved". A side whose ports face ports across the channel slides
  half a step; a test asserts no two edges share a line at three viewports.
- **The label-line cache kept stale breaks after a font change** (keyed on text +
  width, and a clamped node's width does not move with its font). The resolved
  font and letter-spacing are in the key.
- **A fallback label spot could land on its own line.** Each spot now takes the
  side of the run it lands on, and a label touching its own run is a clash.
- **The edit-time microtask redrew every chart** (100–175ms on the 14-chart
  stress deck) and re-ran on every burst for a figure whose draw bailed. It now
  draws only never-painted figures, once each.
- **The layout could flip on a redraw** (a webfont landing, a resize). A redraw
  keeps the layout it drew last unless it has fallen 25% behind.
- **The hidden measuring column hung past a wide drawing,** and the export reported
  CONTENT CLIPPED for text no reader sees. While the box is pinned to the drawing
  the column is `display: none`; the pass lifts that before it measures.
- **Self-loop labels wrapped** though the hook router places them as one line; they
  no longer wrap, and the grid reserves their width.
- **`curved` was nearly invisible on a grid route;** its corner radius is generous.
- **The SVG tile's colors were unpinned** — the contrast gate watched only the CSS;
  it now pins the transform's literal stops too.
- **Copy:** "twelve states take three rows" held only on a bare stage (the feature
  deck renders two); captions with inline code split into blocks and ate the
  chart's stage (the branching deck's long-labels slide shrank to 40% of its `main`
  size for that reason alone — a pre-existing renderer behavior, logged as a
  follow-up). A test fixture that tripped the type floor by accident (the old
  state-chart gallery) was replaced with one that does so on purpose.

Put to the owner rather than decided here: whether the default-direction change
is marked **Breaking** in the changelog, and the upscale ceiling, which reverses
the "fills UP when there's room" rule of `2026-07-16-state-chart-self-scale.md`.

## 5. What did not change, and what is still open

- The `inline` variant is HTML chips and untouched beyond the status table.
- The Node export gate (`state-chart.adoption.js`) is unchanged: dagre is still
  needed exactly when a machine branches. Its test now reads the producer the pass
  stamps (`data-sc-layout`) instead of inferring it from moved nodes.
- Without dagre, a branching machine now falls back to the grid (each branch drawn
  as a skip), not to the numbered column; README, `architecture.md` and the runtime
  warning say so.
- **Open:** the grid has no crossing guarantee between a full-width wrap connector
  and an edge climbing back a line — that crossing is geometry. And a very dense
  channel (the stress deck's incident machine) is legible but busy; a real fix
  would reorder states, which the numbered authoring deliberately does not.
