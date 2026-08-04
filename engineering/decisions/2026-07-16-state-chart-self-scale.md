---
status: shipped
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

- **The ~10-state ceiling — RESOLVED (2026-07-16, this branch's follow-up).** The "ceiling"
  was never a count limit: it was an *indentation* trap. The house convention is to author
  ordered items with the auto-number form (every marker `1.`) where the nested body clears
  the `1. ` marker with 3 spaces — robust for any count. But a state machine is naturally
  authored with *ascending* markers (`1. 2. … 10.`) because transitions point at targets by
  number (`=> 5`). At item 10 the marker widens (`10. ` starts its text at column 4), so the
  3-space nested transition no longer nests; markdown-it ejects it and restarts every later
  state as its own `<ol start="N">`. The old "first `<ol>` only" read then silently dropped
  every state past 9. Fixed in `state-chart.transform.js` §`extractStateList`, which
  reassembles the leaked `<ol start>` / orphan `<ul>` run into one logical list before
  parsing — so any state count works at any indentation, states identified by position and
  targeted by number exactly as authored. Gated by a unit block (real markdown-it split →
  14 states recovered) and the integration overflow gate (14-node render + self-scale, no
  overflow). Note this is orthogonal to the editorial guidance that a >8-state machine stops
  *reading* as a boardroom machine — the engine no longer *corrupts* a dense one; whether to
  author one is still the deck author's call.

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

---

## Follow-up (2026-08-04) — #1360: the mechanism reached four variants out of five

`examples/state-chart.md` p6 rendered its sixth state, "Archived", as a top sliver
with the label gone. The issue guessed the cause as the letterbox failing to account
for the status legend band. It was not that. **The letterbox never ran on that slide
at all.**

### Why `inline` was invisible to the fit

The fit is applied by `draw()`, and `draw()` is gated twice on the SVG edge payload:

```js
function draw(fig) {
  const raw = fig.getAttribute('data-sc-transitions');
  if (raw == null) return;                                    // gate 1
```
```js
const figs = doc.querySelectorAll('.state-chart-figure[data-sc-transitions]');  // gate 2
```

`renderInline` draws transitions as HTML chips rather than an SVG overlay, so it has
no edges to serialize and emits no `data-sc-transitions` — and it emitted no
`.state-chart-scale` box either. Both gates are about **edge routing**, which inline
genuinely does not need; neither is about **fitting**, which it needs exactly as much
as every other variant. So the one presentation that could not scroll, letterbox or
split was also the only one with no fit, and its rows sat in flow at natural height
inside a figure that flex-fills a fixed stage.

Measured on p6 at 1280×720: `.chart-body` client 406 / scroll 458 — **52px hidden**,
`ol.state-rows` 434px tall in a 358px figure. `probeSectionOverflow` reported
`over: false` throughout; the section and the cell both fit. The only channel that
saw it was `⚠ CONTENT CLIPPED`, because the loss never crossed the frame.

**This is a mechanism gap, not an authoring error**, which is why the fix is the
predicate rather than the deck: every inline machine past the stage height was
shearing, on every deck, silently.

### The fix

- `renderInline` emits the same `.state-chart-scale` box `buildDefault` does, so the
  row column is out of flow and its natural height can no longer flow into the flex
  basis.
- The letterbox is split out of `draw()` into `applyFit(fig, geo, natRect, maxK)`, so
  the two callers cannot drift. `draw()` passes the rect it had already measured —
  the default variant's behavior is untouched, byte for byte.
- `drawAll()` runs a fit-only pass over `.state-chart-figure:not([data-sc-transitions])`.
  Selected by **absence of the edge payload**, not by variant name, so the next
  presentation that draws no SVG is fitted by construction instead of being left out
  the way this one was.
- `readVis()` is likewise shared: both passes measure through `rectL()`, and a fit
  computed against an unnormalized rect collapses `k` to the host's own scale.

### Two things the first cut got wrong, both found by measuring

**`fit-content` was the wrong width.** Carried over from the default variant's scale
box, it let the box shrink-wrap to 342px — and an inline row's transition chips
*wrap*, so a narrower box is a **taller** one. Natural height went 434 → 520 and the
letterbox then paid for wrapping nobody asked for (`k` 0.688 instead of 0.823). The
inline scale box is `width: max-content`, which pins the rows unwrapped and lets the
fit letterbox both axes.

**The fit is shrink-only here, and that is a real difference rather than an
oversight.** Uncapped, a 3-row machine scaled *up* to own the stage — `k` 1.15–1.34 is
normal for the default variant, which draws a diagram. `inline` is the compact
presentation; its own gallery slide is captioned *"the chart sits beside its prose"*.
Letterboxing it up rendered chips at heading size and contradicted the variant's
reason to exist, so `applyFit` takes a `maxK` and `fitOnly` passes `1`. The cap is
declared at the call site with that reasoning attached, deliberately, because the
failure this whole note is about is a variant difference that was left **implicit**.
Nothing caps the shrink direction: `probeFigureLegibility`'s type floor is what
reports a scale that went too far.

### Verified

Real emulator renders, measured rather than eyeballed, then rasterized and looked at:

| | before | after |
|---|---|---|
| `.chart-body` hidden px, p6 | **52** | **0** |
| rows rendered whole | 5 of 6 | **6 of 6** |
| `k` applied to the row column | — (no fit ran) | **0.8233** = 358/434 |
| `overflow:check` on the deck | clips p6 | **clean** |

The state-chart gallery moved on exactly **one page in each mood** — the inline slide,
9.1% of pixels, entirely from the row column becoming vertically centred in the figure
now that it is out of flow. The chart *bucket* gallery did not move at all, and the
default variant's `k` is unchanged on every page (0.3486 / 1.1495 / 1.0426 / 1.3426).
Goldens re-blessed.

`test/integration/parity/chart-overflow-preserved.test.js` gains a seven-state inline
case. It asserts **hidden pixels and rendered rows**, not `over` — an `over`-only
assertion passes against the broken build, which is the trap this swimlane keeps
finding. Confirmed non-vacuous: with the scale box reverted it fails reporting 88px
hidden.

### Two stale comments corrected on the way

Both described this mechanism and both were false, which matters more than usual in a
file whose whole subject is a measurement:

- `state-chart.transform.js` said the fit was *"floored so an overstuffed machine still
  spills the stage and the probe catches it."* There is no floor; §Alternatives records
  one as considered and rejected.
- `state-chart.styles.css` said `.chart-body`'s column made *"the figure stack above the
  status legend band."* The legend is a **sibling of `.chart-body`** inside `.cell-stage`
  — `extractChartBody` wraps the figure alone — so the `gap` beside that comment never
  applied to it. The legend's band is still subtracted before the figure is sized, one
  level up.

### Still not fixed here

`examples/state-chart.md` **p3** trips the type floor at **2.8px** (0.39% of slide
height, against a 1.00% floor) — the default variant letterboxing a dense machine down
to `k = 0.349`. Verified **pre-existing and byte-identical at `8f19d2d`**, untouched by
this change, and off its path: it is the shrink direction of the default variant's fit,
which is what `Follow-ups` above already tracks. Recorded here rather than left for the
next reader to rediscover.
