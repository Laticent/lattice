---
status: shipped
summary: >
  Retires `--chart-inset-top` / `--chart-inset-bottom` and takes `.chart-body` to
  `padding: 0` on both axes, closing the half #1598 left open. #1598 kept the block
  pair as a CLIP MARGIN on the evidence that removing it clipped nine decks — but
  that experiment MOVED the padding to the stage, which collapses the clip box onto
  the layout box, while ZEROING it grows the content box and leaves the clip
  boundary untouched. Opposite sign, so the evidence never applied. Re-measured
  zeroed: `overflow:check` over all 268 committed decks identical to baseline (7
  clipped slides / 4 decks, zero newly-clipping pages) and `check-chart-fit` 3 clips
  to 1, the survivor shrinking 55.5px to 10.9px — because the padding was CAUSING
  the overflow on bodies pinned to natural height, where it is part of that height.
  Charts gain the reclaimed 64px as drawing size: a quadrant grows 17.8-20.0% in
  both dimensions. One regression found by LOOKING, not by a gate: the `.canvas`
  glass panel had been borrowing the retired pair for its vertical berth and ran
  flush to the card edge; it gets `--chart-panel-y`, the block twin of the token
  `--chart-panel-x` that already exists for exactly this reason. The gate widens
  from inline-only to both axes, so the invariant is enforced rather than asserted.
---

# A chart body's block padding was never a clip margin

**Date:** 2026-08-12
**Area:** forms / charts / gates
**Issue:** #1629 — the block half #1598 left open

## 1. What was believed

`2026-08-11-stage-owns-the-outer-inset.md` (#1598) states the Forms invariant as:

> The stage owns the outer inset. A body owns only the spacing between its own
> elements — `gap` between its children, **a CLIP MARGIN** where its overflow must
> not cut at the layout edge, and whatever padding is genuinely required by a thing
> that paints its own surface.

and applied it to the inline axis only. §7 is explicit about why:

> the first cut, **with the block padding moved to the stage**, made nine decks clip
> pages that had never clipped

The reading was that `overflow` cuts at the padding box, so `.chart-body`'s
`padding-block` is the slack a chart paints into — with three named dependents:
journey's mood legend (21px past its column), matrix-grid's rows, radar's rim
labels "by design". That reading was carried into `check-ownership.js`, whose
body-padding check ran on the inline axis and cited the nine decks in a comment,
and into `design/forms.md` §6.1.

## 2. Why the evidence did not apply

**Moving the padding to the stage and setting it to zero are different changes
with opposite signs on available height.** `.chart-body` is `flex: 1` inside
`.cell-stage`, so its border box is the stage height regardless of its own padding,
and `overflow` cuts at the padding box — which, with no padding, *is* the border box.

| | body border box | body content box | clip boundary |
|---|---|---|---|
| as shipped | stage | stage − 64 | stage |
| moved to the stage (#1598's cut) | stage − 64 | stage − 64 | **stage − 64** — slack gone |
| **zeroed (this change)** | stage | **stage** — content grows | stage — unmoved |

The nine-deck experiment removed slack. This one adds content room and does not
move the clip boundary at all.

## 3. Re-measured, zeroed rather than moved

| gate | `main` | zeroed |
|---|---|---|
| `overflow:check` — 268 committed decks | 7 clips / 4 decks (at baseline) | **7 clips / 4 decks — identical** |
| `check-chart-fit` — 3 deck shapes | **3 clips** | **1 clip** |

Zero newly-clipping pages, and chart-fit *improved*: portrait `progress` (+15px)
and portrait `timeline-list` (+12.3px) disappeared outright, and square `progress`
went +55.5px to +10.9px.

## 4. The padding was causing the overflow, not absorbing it

Measured on `progress` at square, whose `.chart-body` is `flex: 0 0 auto`:

```
stage                 666.9
content               677.8   ← 10.9 too tall on its own (pre-existing)

with 32/32 padding:   body 741.8, content shoved down 32px  → overshoot 42.9
zeroed:               body 677.8, content at the stage top  → overshoot 10.9
```

The family already splits its bodies in two, for an unrelated reason (whether an
overstuffed chart spills the stage clip where the overflow probe can see it). That
same split decides what the block padding does:

- **Fill-height bodies** (`flex: 1 1 auto` — the SVG charts). The `<svg>` sizes to
  the *content* box and can paint out into the padding. Here it genuinely was slack,
  and this is where the three named dependents live.
- **Pinned bodies** (`flex: 0 0 auto` — progress, kanban, timeline-list, roadmap).
  Natural height *includes* the padding, so it can only push the box out of the
  stage. Here it was never slack; it was 64px of guaranteed spill plus a 32px shove.

The three fill-height dependents were checked on the render rather than trusted:
radar's rim labels, journey's mood legend and matrix-grid's rows all paint complete
without the padding.

## 5. What charts gain

The reclaimed 64px goes to drawing size. Measured on `quadrant.gallery.md` at
landscape, the `<svg>` border box and the resulting paint scale:

```
variant       svgH before → after     gain
quadrant       323.3  →  387.3       +19.8%
q bubble       359.7  →  423.7       +17.8%
q accent       319.3  →  383.3       +20.0%
q compact      353.3  →  401.3       +13.6%
```

A height-bound SVG chart is uniformly scaled by its box, so this is a gain on
**both** axes, not just the block one — which is also why #1598's inline reclaim
did nothing for these charts: at landscape and square the quadrant binds on height,
and it had ~750px of unused width already.

## 6. The regression a gate could not see

`.canvas`, the opt-in glass panel, sets only `padding-inline: var(--chart-panel-x)`.
Its **vertical** berth had been borrowing the body's block padding. Zeroing that
took the card's internal top and bottom inset with it, and the `quadrant canvas`
fixture rendered with the chart flush against the glass edge — against that rule's
own stated contract, *"content must not touch a visible edge"*.

Nothing failed. It is not a clip, so `overflow:check`, `check-chart-fit` and the
overflow probe are all structurally blind to it; it was caught by rasterizing the
fixture and looking, which is the QUALITY BAR earning its keep for the second time
in this rule's history (#1598 §7 found its first clip the same way).

The fix is the one the token design already anticipated. `--chart-panel-x` exists
because the panel's berth and the frame's inset are different quantities that must
not share a token; `--chart-panel-y` is its block twin, and `timeline-list`'s
narrow-box arm restates it for the same reason it restates the inline one.

## 7. The gate widens

`offendingBodyPadding` in `tools/check-ownership.js` now matches `padding-block`
and the per-side block properties, so the invariant is enforced rather than
asserted in a comment. The exits are unchanged and are the whole of the exception:
a body that PAINTS a surface (`.canvas`) or has no stage to own anything (the
Read·Article `figure` projection).

Widening it resurrects the one entry `SANCTIONED_STAGE_INSETS` briefly carried —
`padding-bottom` on `.mermaid:has(+ .mermaid-error)` — and this time it is correct
rather than incidental. It is the seam between a failed diagram and its parser-error
block, and it cannot be spelled any other way: not a `margin-top` on the error block
(HARD RULE #20, and that block is bordered and filled, so a margin bleeds its fill
and cannot be measured), and not the container's `gap` (the container is the stage,
whose gap is one value shared by every seam in the column).

## 8. What this does not settle

- **`progress` at square still clips 10.9px**, and that is a pre-existing capacity
  defect this change did not cause and does not fix — its content is 677.8 in a
  666.9 stage with its `data-family="square"` arm already applied. `check-chart-fit`
  was red on `main` with three clips and is red here with one. Off the path of this
  change (it is a capacity tuning in another component), so it is recorded rather
  than pulled into the diff — HARD RULE #18's find-vs-cause boundary, and #17's.
- **The marp-vscode webview is UNVERIFIED**, as it was for #1598. It cannot be
  driven from this sandbox. What is known is that this change only ever *removes*
  padding, so a body there gets more room and its clip boundary does not move.
