# quadrant

> Native 2×2 scatter chart — items plotted on two continuous axes.

**Function** evidence · **Form** scatter · **Substance** series

**Tags** `two-by-two` · `positioning` · `prioritize` · `risk`

Use to position items by two numeric attributes (cost × value, effort × impact). Data-driven; for static categorical 2×2 grids, use matrix-2x2.

## When to use

- **Two numeric axes carry the analysis.** Effort × impact, cost × value, probability × severity, reach × confidence. Both axes are continuous and the position on each genuinely matters — that's the argument quadrant is built to make.
- **Categorical grouping clusters the dots.** Items grouped under list headings (`Strategic Bets`, `Quick Wins`, `Defer`, `Time Sinks`) share a colour, so the eye can read the cluster before the individual point. The grouping is editorial, not derived from coordinates.
- **Six to twelve items.** Below six the chart wastes the canvas — write it as prose. Past twelve the labels overlap and the quadrant becomes a constellation. Trim the long tail or break it across two slides.

## When NOT to use

- **Static categorical 2×2.** If the quadrants are fixed labels (Important × Urgent, Build × Buy × Partner × Defer) and items are placed by category not coordinate, use `matrix-2x2`. `quadrant` is data-driven; `matrix-2x2` is conceptual.
- **Single axis matters.** If one axis is decorative and only the other carries meaning, you have a ranking, not a scatter. Use `progress` for percent-complete or `kpi` for ranked metrics with status.
- **Coordinates without an audience-shared scale.** If `8, 80` requires a footnote to interpret, the slide doesn't pay off. Either label the axis units in the eyebrow (`Effort 0–10 → Reach 0–100`) or normalise to a familiar scale before authoring.

## Authoring

```markdown
<!-- _class: quadrant -->

`Effort 0–10 → Reach 0–100`

## Where to put the next dollar, having spent the last one on a workshop.

Effort estimated in story-points; reach as percent of addressable teams.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
  - Snapshot exports `9, 55`
- Defer
  - Vendor scoping `2, 30`
  - Manual recalibration `1, 22`
- Time Sinks
  - Custom audit log UI `7, 18`
  - Bespoke board export `9, 28`
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the analysis. |
| `axes` | `p > code` | no | Optional axis-label eyebrow (inline-code paragraph). |
| `items` | `ul > li` | yes | One li per item. Format: `Label — x, y[, size]`. |
| `detail` | `li > ul > li > ul` | no | Optional 3rd-level nested sublist under an item (the x,y are inline pills, so this level is free). Drives two surfaces from one source (shared with pie/funnel/map via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the item's `<circle>`/bubble with `data-mark` (a stable global index across all variants) and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Label: item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. A quadrant with no sublists emits no note and is unchanged. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│         Quadrant chart heading          │
│                                         │
│    high ▲    ◆       ◆                  │
│         │ ◆    ●                        │
│         │       ●  ◆                    │
│         │  ●         ●                  │
│     low └──────────────►                │
│           low        high               │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `bubble` — Bubble — third value sizes the dot

A third number in each pill (`x, y, size`) scales the dot by honest √-area. Use when a magnitude — revenue, headcount, spend — rides alongside the two positioning axes.

```markdown
<!-- _class: quadrant bubble -->

`Effort 0–10 → Reach 0–100`

## Where to put the next dollar — sized by revenue nobody has booked yet.

- Strategic Bets
  - Scoring model v2 `3, 70, 2.4`
  - Per-team calibration `5, 85, 4.1`
- Quick Wins
  - Weekly signal brief `8, 80, 0.9`
  - Snapshot exports `9, 55, 0.6`
- Defer
  - Vendor scoping `2, 30, 0.4`
- Time Sinks
  - Custom audit log UI `7, 18, 1.3`
```

### `trail` — Trail — before → after

Two coordinate pills per item (`x, y` then `x2, y2`) draw a trail from the old position to the new one. Use to show how initiatives moved across a period.

```markdown
<!-- _class: quadrant trail -->

`Effort 0–10 → Reach 0–100`

## How each bet moved after one quarter — mostly to the left, where the work is cheaper to describe.

- Strategic Bets
  - Scoring model v2 `5, 60` `3, 78`
  - Per-team calibration `7, 70` `5, 88`
- Quick Wins
  - Snapshot exports `9, 45` `8, 62`
- Time Sinks
  - Custom audit log UI `6, 25` `7, 16`
```

### `cohort` — Cohort — convex-hull tint per group

Tints a convex hull behind each top-level group so the clusters read as cohorts, not just loose dots. Use when group membership is part of the argument.

```markdown
<!-- _class: quadrant cohort -->

`Effort 0–10 → Reach 0–100`

## Where to put the next dollar — clustered by theme, themed by whoever owns the slide.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
  - Snapshot exports `9, 55`
- Defer
  - Vendor scoping `2, 30`
  - Manual recalibration `1, 22`
- Time Sinks
  - Custom audit log UI `7, 18`
  - Bespoke board export `9, 28`
```

### `threshold` — Threshold — target lines + zones

Replaces the centre midlines with target lines declared in the eyebrow (`· targets tx, ty`) and labels the resulting zones. Use for go/no-go reads against an explicit bar.

```markdown
<!-- _class: quadrant threshold -->

`Effort 0–10 → Reach 0–100 · targets 5, 50`

## Against the go/no-go thresholds nobody has agreed to enforce.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
- Defer
  - Vendor scoping `2, 30`
- Time Sinks
  - Custom audit log UI `7, 18`
```

### `magic` — Magic — MQ tribute

A Gartner-style Magic Quadrant tribute: vendor labels and the iconic Leaders / Challengers / Visionaries / Niche Players quadrant names. Order the groups TL → TR → BL → BR.

```markdown
<!-- _class: quadrant magic -->

`Completeness of vision 0–100 → Ability to execute 0–100`

## The decision-tooling Magic Quadrant, in which the tool we built is a Leader.

- Challengers
  - Productboard `30, 82`
- Leaders
  - Sprig + Log `85, 88`
  - Chorus `72, 76`
- Niche Players
  - Notion build-out `25, 28`
- Visionaries
  - Spreadsheet `82, 34`
```

### `minimal` — Minimal — no fill, faint grid

Composable modifier: drops the quadrant fills for a faint grid and bare dots. Layers on the default or any quadrant variant when the tinting would compete with the dots.

```markdown
<!-- _class: quadrant minimal -->

`Effort 0–10 → Reach 0–100`

## Where to put the next dollar — unadorned, like the budget that funds it.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
  - Snapshot exports `9, 55`
- Defer
  - Vendor scoping `2, 30`
- Time Sinks
  - Custom audit log UI `7, 18`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`matrix-2x2`](../../comparison/matrix-2x2/matrix-2x2.docs.md) — the 2×2 is categorical, not coordinate-based
- [`radar`](../../chart/radar/radar.docs.md) — items rated across more than two criteria
- [`progress`](../../chart/progress/progress.docs.md) — percent-complete on a single axis
- [`piechart`](../../chart/piechart/piechart.docs.md) — part-to-whole, not bivariate position
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — comparing options against shared categorical criteria

## Demo deck

See [quadrant.gallery.light.pdf](./quadrant.gallery.light.pdf) for rendered examples of every variant.
