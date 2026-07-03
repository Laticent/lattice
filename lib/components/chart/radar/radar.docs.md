# radar

> Native radar / spider chart — items rated across multiple axes.

**Function** evidence · **Form** scatter · **Substance** series

**Tags** `spider` · `assessment` · `positioning`

Use to compare 2–4 options across the same 4–8 criteria. Each option becomes a polygon; overlap shows where strengths align.

## When to use

- **Same criteria, multiple options.** Competitive comparison, vendor evaluation, candidate scoring — anywhere two to four options need to be rated on the same four-to-eight criteria. The polygon shapes show the trade-off pattern at a glance.
- **Shape is the argument.** Radar charts are good at 'we are strong here and weak there' — the lopsided polygon is the message. If precise pairwise comparisons matter more than the silhouette, use a grouped bar chart or `verdict-grid`.
- **Shared zero-to-ten scale.** Every axis must use the same scale so the polygons are comparable. Mixed units (ms, $, count) collapse the chart's meaning — normalise to a shared 0–10 or 0–100 before authoring.

## When NOT to use

- **More than four series.** Five overlapping polygons become a tangle of edges. Trim to the two or three options the audience is actually choosing between; the rest belong in an appendix table.
- **Three or fewer axes.** Three axes makes a triangle — barely a shape. Below four criteria, the spider collapses and the slide should be a `cards-grid` or `verdict-grid` instead.
- **Mixed scales across axes.** If one axis is 0–10 and another is 0–10,000, the larger axis dominates the polygon and the comparison is misleading. Normalise everything to a shared scale first.

## Authoring

```markdown
<!-- _class: radar -->

`Scale · 0–10`

## How we stack up across the buying criteria.

- Lattice
  - Performance `9`
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
  - Security `9`
- Rival North
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `9`
  - Security `7`
- Rival West
  - Performance `6`
  - Pricing `9`
  - Support `7`
  - Ecosystem `8`
  - Security `8`
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `axes` | `p > code` | no | Optional eyebrow listing the axes. |
| `series` | `ul > li` | yes | One li per series (option). Format: `Label — v1, v2, v3, v4, …` one number per axis. |
| `detail` | `li > ul > li > ul` | no | Optional nested sublist under an AXIS in the first series (radar reveals per-axis — the mark is the axis). For the `quadrant` variant, one level deeper (under each axis within a group). Drives two surfaces from one source (shared with pie/funnel/map/quadrant via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the axis label `<text>` with `data-mark` and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail folds into the slide's speaker note (`Axis: item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. Detail sublists must use `-`/`*` bullets, not a numbered (`1.`) list. A radar with no sublists emits no note and is unchanged. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│           Radar chart heading           │
│                                         │
│                  A                      │
│                 /·\                     │
│              E ●───● B                  │
│                │   │                    │
│              D ●───● C                  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `target` — Target — actual vs reference ring

Reads the series named `Target` (or `Goal`/`Plan`) as a dashed reference polygon; each axis where the actual falls short gets a rose gap segment along the spoke, surplus a quiet green one. The shortfall is the read.

```markdown
<!-- _class: radar target -->

`Scale · 0–100`

## Where we are against the quarter plan.

- Actual
  - Hiring `72`
  - Runway `88`
  - Pipeline `54`
  - Retention `91`
  - Compliance `66`
  - Velocity `78`
- Target
  - Hiring `90`
  - Runway `85`
  - Pipeline `80`
  - Retention `90`
  - Compliance `95`
  - Velocity `75`
```

### `delta` — Delta — before vs after

Takes exactly two series — before, then after. The before polygon is muted; a change segment rides each spoke, green where the metric rose, rose where it fell. Built for the period-over-period QBR story.

```markdown
<!-- _class: radar delta -->

`Scale · 0–10`

## What moved over the half, and which way.

- H1
  - Velocity `5`
  - Quality `6`
  - Morale `4`
  - Coverage `5`
  - Onboarding `3`
- H2
  - Velocity `8`
  - Quality `7`
  - Morale `4`
  - Coverage `6`
  - Onboarding `7`
```

### `benchmark` — Benchmark — hero vs envelope

Draws the first series as the hero line and collapses every other series into a single min–max envelope band — one shape and your line instead of five tangled polygons. Strong where you clear the band, exposed where you sit inside it.

```markdown
<!-- _class: radar benchmark -->

`Scale · 0–10`

## Are we inside the pack, or outside it.

- Us
  - Performance `9`
  - Price `6`
  - Support `8`
  - Ecosystem `7`
  - Docs `9`
  - Security `8`
- Competitor A
  - Performance `7`
  - Price `8`
  - Support `6`
  - Ecosystem `9`
  - Docs `5`
  - Security `7`
- Competitor B
  - Performance `6`
  - Price `9`
  - Support `7`
  - Ecosystem `6`
  - Docs `6`
  - Security `6`
- Competitor C
  - Performance `8`
  - Price `5`
  - Support `5`
  - Ecosystem `8`
  - Docs `7`
  - Security `9`
```

### `quadrant` — Quadrant — axes grouped into sectors

Takes a three-level list (series → group → axis); each group becomes a tinted sector with its name on the rim and a dashed mean arc. For boards that think in themes, not twelve loose axes.

```markdown
<!-- _class: radar quadrant -->

`Scale · 0–5`

## Our capability profile, read by theme.

- Our capability
  - People
    - Hiring `4`
    - Retention `3`
    - Bench depth `2`
  - Process
    - Cadence `5`
    - Rigor `4`
  - Technology
    - Platform `4`
    - Tooling `3`
    - Automation `2`
  - Risk
    - Compliance `3`
    - Resilience `4`
```

### `small-multiples` — Small-multiples — one mini radar per series

Gives each series its own mini radar on a shared scale, laid out in a row — the honest read when an overlay of four-plus series would be mush. Scan the shapes, spot the outlier.

```markdown
<!-- _class: radar small-multiples -->

`Scale · 0–10`

## Four product lines, the same five criteria.

- Atlas
  - Adoption `8`
  - Margin `6`
  - NPS `7`
  - Velocity `9`
  - Risk `4`
- Beacon
  - Adoption `5`
  - Margin `9`
  - NPS `6`
  - Velocity `5`
  - Risk `7`
- Cinder
  - Adoption `7`
  - Margin `4`
  - NPS `8`
  - Velocity `6`
  - Risk `5`
- Drift
  - Adoption `6`
  - Margin `7`
  - NPS `5`
  - Velocity `7`
  - Risk `8`
```

### `minimal` — Minimal — stroke-only

Composable modifier: drops the polygon fills for a stroke-only read on a faint grid. Layers on the default or any radar variant when the fills would muddy the comparison.

```markdown
<!-- _class: radar minimal -->

`Scale · 0–10`

## The same comparison, fills dropped.

- Lattice
  - Performance `9`
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
  - Security `9`
- Rival North
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `9`
  - Security `7`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `loose`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`quadrant`](../../chart/quadrant/quadrant.docs.md) — two axes are enough — the other six dimensions drop out
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — the criteria are categorical (pass/fail), not graded
- [`kpi`](../../evidence/kpi/kpi.docs.md) — the comparison is one option's metrics, not multi-option
- [`compare-table`](../../comparison/compare-table/compare-table.docs.md) — a precise tabular comparison reads better than a shape
- [`piechart`](../../chart/piechart/piechart.docs.md) — the question is part-to-whole, not multi-criterion

## Demo deck

See [radar.gallery.light.pdf](./radar.gallery.light.pdf) for rendered examples of every variant.
