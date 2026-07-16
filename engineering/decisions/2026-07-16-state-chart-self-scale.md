---
status: in-progress
summary: A normal state-chart lost its caption after `.viz-frame` (#1020) — the pin (`flex:0 0 auto`) couldn't shrink its tall bow-gutter node column into the caption-compressed `.cell-stage`, so it spilled and clipped the caption (and pushed the detail popover into that zone). Fix (owner's direction): the state-chart becomes a SELF-SCALING chart, exactly like the pie / SVG charts — `width:100%`, sized by the container, always fits. Its `.state-chart-figure` is a flex viewport that fills the stage; a new inner `.state-chart-scale` box (nodes + the absolute SVG overlay) is `position:absolute` so its natural height can't collapse the flex chain, and `draw()` letterbox-scales it — nodes and edges together — to fit the viewport (crisp ~400px→8K via the cqi node sizing + the S edge factor). No floor, no overflow branch: an over-stuffed machine just gets cramped (the author's stress test; the house rule is a simple boardroom chart, not an architect's diagram), so state-chart leaves the overflow-probe pin group and joins the self-scaling SVG group. chart-body/figure use `flex:1 1 0` (zero basis) so they fill by grow, not by the absolute content. Portrait keeps its `space-evenly` fill (the scale is a no-op there). The reveal tilt (on the figure) composes with the fit (on the inner box).
---

# State-chart self-scale — a self-scaling chart, like the pie

## Symptom

After `.viz-frame` (#1020, `2026-07-15-viz-frame-merge.md`) a **normal** state-chart
lost its caption: a 4-node machine with a `_Source: …_` line rendered with a red
overflow border and the caption clipped off the bottom. The interactive detail
popover, which anchored below the chart's disc, then landed in that clipped zone.

Only state-chart was affected — gantt / kanban / roadmap / timeline-list / progress
all fit with a caption.

## Root cause

`.viz-frame` pinned the content-height charts to natural height (`flex:0 0 auto`) so
an overstuffed chart spills the `.cell-stage` clip and the overflow probe catches it —
right for the simple list charts. But state-chart's node column carries a tall
**bow-gutter** padding (~100px, for routing the bowed back-edges + start/terminal
markers), so even a 4-node machine's natural body is ~484px. The new frame's masthead +
**caption** + footer left the stage ~432px. Pinned, the body couldn't shrink, so it
spilled up into the masthead and pushed the caption past the bottom clip.

## Decision — treat state-chart exactly like the pie

The owner's direction: a state-chart should be a **self-scaling chart**, in the pie /
SVG class, not a pinned list chart. `width:100%`, height sized by the parent container,
scalable from ~400px to 8K, and it **squeezes to fit** — always. Over-stuffing is the
author's stress test (a cramped chart), not an engine overflow: *the goal is a simple
boardroom chart that reads and looks good, not an architect's complex state diagram.*

It can't letterbox itself the way an `<svg>` viewBox does (its nodes are cqi-sized HTML),
so we give it the SVG shape by hand:

- **`.state-chart-figure`** is a flex viewport that fills the available stage height (the
  caption + status legend keep their space). It uses `flex: 1 1 0` — a **zero basis** —
  so it fills by grow; a `flex:…auto` (content) basis let the tall content collapse the
  flex chain.
- **`.state-chart-scale`** (new inner box) holds the natural-size geometry: the node
  column + the absolutely-placed SVG edge overlay. It is itself **`position:absolute`**
  (centred via `top/left:50%` + `translate(-50%,-50%)`), so the figure never inherits its
  (possibly huge) height — that is what previously collapsed the viewport to 0. `draw()`
  measures its natural box, routes the edges into it, then appends `scale(k)` to the
  centring transform, where `k = min(viewH/natH, viewW/natW)` — a plain letterbox, no
  floor, no cap. Nodes and edges ride the same box, so they stay aligned; and because the
  node sizing is cqi and the edge factor `S` tracks the section width, the whole diagram
  is crisp at any render size.
- **`chart-body`** also uses `flex: 1 1 0` so it fills the stage by grow.

Consequence: state-chart **never overflows** — it always scales to fit. So it leaves the
`flex:0 0 auto` pin group in `chart-family.css` and the overflow gate now asserts a dense
machine reports `over:false` (it scaled, it didn't spill).

## Portrait

The `@container lattice (aspect-ratio <= 0.9)` rule keeps its `space-evenly` fill (the
node column distributes down the tall slide) and now targets `.state-chart-scale`
(`height:100%`) so the fill has a definite box. There the natural column already ≈ the
viewport, so the landscape letterbox scale is a no-op (`k ≈ 1`): portrait fills by
distribution, landscape by letterbox, and they compose.

## Interaction

The reveal tilt (`chart-interact.js`) transforms the `.state-chart-figure`; the fit
transform is on the inner `.state-chart-scale`, so they compose (tilt outside, scale
inside). The mark-scan root stays the figure; `.chart-details` stays its sibling. `draw()`
still skips re-routing while the figure carries a live reveal transform.

## Follow-ups (tracked, off-path for this change)

- **The ~10-state ceiling.** A machine authored with more than ~10 states parses only the
  first ten; the surplus list items leak as siblings into the stage and overflow. This is
  a pre-existing upstream limit (the markdown ordered list splits), independent of the
  self-scale, and consistent with the docs' "a machine of >8 states stops reading as a
  machine." The self-scale contract is gated within the parseable range (≤10). Removing the
  ceiling — so an over-stuffed machine renders all states scaled tiny rather than leaking —
  is a separate parser change.

## Alternatives considered

- **A readability floor + overflow** (the first cut of this change): scale down only to a
  MIN_FIT, then spill so the probe catches an over-dense machine. Rejected on the owner's
  direction — a state-chart should always fit like the pie, and over-stuffing is the
  author's problem, not an engine flag.
- **Trim the bow-gutter** (adaptive padding per node count). Lower-risk but hand-tuned and
  doesn't generalize.
- **`zoom`** instead of a scale wrapper — affects layout (no wrapper needed) but is
  non-standard and unreliable in print-to-PDF.

## Files

- `lib/components/chart/state-chart/state-chart.transform.js` — emit the `.state-chart-scale`
  wrapper; `draw()` measures against it + applies the letterbox fit.
- `lib/components/chart/state-chart/state-chart.styles.css` — figure→flex viewport (zero
  basis), absolute scale box, portrait fill retargeted.
- `lib/components/chart/_chart-family/chart-family.css` — remove state-chart from the pin set.
- `test/integration/parity/chart-overflow-preserved.test.js` — state-chart is self-scaling:
  a fitting AND a dense machine both report `over:false`.
