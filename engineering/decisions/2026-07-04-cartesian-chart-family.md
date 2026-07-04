---
status: proposed
summary: Cartesian chart family — barchart, linechart, xychart, slopechart, waterfall, bullet — sharing one axis kernel, authored in the existing list-of-pills grammar
---

# Cartesian chart family — bar, line, xy, slope, waterfall, bullet

**Status:** proposed 2026-07-04 (approved direction; implementation staged below).
**Scope:** six new chart-family members that plot values on a numeric axis —
`barchart`, `linechart`, `xychart`, `slopechart`, `waterfall`, `bullet` — plus
the shared axis kernel they extract from `quadrant`. No implementation lands
with this note; it is the design record the PRs build against.

## The ask

> "Introduce additional charts like bar chart, line chart, xy chart with
> authoring that feels familiar and aligned with how we author other charts.
> I might be missing other charts one might want to use."

## The insight — we already have the grammar and the engine

Lattice charts are authored one way: a Marp `_class` directive, an `h2`, an
optional inline-code eyebrow, and a **plain markdown list whose values ride as
trailing inline-code pills**. The data list already comes in two shapes:

| Shape | Looks like | Today's members | Means |
|---|---|---|---|
| **Flat** | `- Label \`value\`` | `progress`, `piechart`, `funnel` | one series |
| **Nested** | `- Series` → `  - Category \`value\`` | `radar`, `quadrant` | many series over shared categories |

And a real cartesian scale engine already lives in
`lib/components/chart/quadrant/quadrant.transform.js`: eyebrow-declared per-axis
ranges (`Effort 0–10 → Reach 0–100`), `niceCeil` auto-fit when a range is
omitted, `viewBox` plotting via `plotPoint`, and √-scaled `bubble` sizing from a
third value. Multi-series colour comes from the 8-slot `--chart-cat-1..8`
palette; the SVG-native key comes from `_chart-family/svg-legend.js`.

So the six new charts need **no new authoring concept**. They reuse the two list
shapes, the eyebrow axis grammar, the `--chart-cat-*` palette, and the SVG key.
The only new engine code is the mark geometry (a rect, a polyline, a slope) —
everything else is shared substrate. This follows the house pattern: **native
SVG kernels, never Mermaid** (`diagram.docs.md` already redirects "quantitative
datapoints across two axes" to the native charts).

## Naming

Explicit `-chart` names for the axis charts, matching `piechart`/`state-chart`:
**`barchart`**, **`linechart`**, **`xychart`**. The two already-unambiguous
names stay bare: **`slopechart`** reads fine and pairs with the family, while
**`waterfall`** and **`bullet`** are established chart names on their own — a
`-chart` suffix on them would be noise. Orientation and fill are **modifiers**,
not separate classes (`horizontal`, `stacked`, `area`, `smooth`, `bubble`).

## The six charts

### 1. `barchart` — categorical values on a numeric axis

Fills the real gap: `progress` is a single-series **percent-complete meter** with
status pills; it can't do grouped columns or a free value axis. `barchart` is the
value-axis categorical chart. Data shape = `radar`'s.

Single series (flat):
```markdown
<!-- _class: barchart -->

`Revenue $M`

## Q2 was the inflection.

- Q1 `4.2`
- Q2 `5.0`
- Q3 `6.1`
- Q4 `7.4`
```

Grouped / multi-series (nested — categories shared across series):
```markdown
<!-- _class: barchart -->

`Revenue $M · by region`

## North America pulled ahead in Q2.

- Q1
  - North `4.2`
  - South `3.1`
- Q2
  - North `5.0`
  - South `3.8`
```

- **Default: vertical columns** (differentiates from horizontal `progress`, and
  is what most decks mean by "bar chart" for a time series). Modifier
  `horizontal` lays them flat.
- Modifiers: `grouped` (default for multi-series), `stacked`, `stacked-100`
  (percent-stacked). Multi-series → SVG-native key; single series self-labels.

### 2. `linechart` — a trend over an ordered categorical axis

Same nested shape as `barchart`; drawn as connected polylines over an **ordinal**
x-axis (months, quarters, steps). Natural home for time series.

```markdown
<!-- _class: linechart -->

`Weekly active users (k)`

## Organic finally crossed paid.

- Organic
  - Jan `12`
  - Feb `19`
  - Mar `31`
- Paid
  - Jan `8`
  - Feb `14`
  - Mar `16`
```

- Modifiers: `area` (fill under a single/last series), `stacked-area`, `smooth`
  (spline), `points` (show markers), `step`. `area` gives us area charts for free.

### 3. `xychart` — two numeric axes (scatter / bubble)

New component, but its kernel is **quadrant's scale/plot core** — reused, not
re-implemented (HARD RULE #1). `xychart` is quadrant *without* the 2×2 fill and
corner labels: bare axes, gridlines, dots. The clean split from `linechart`:
**`linechart` has a categorical x; `xychart` has a numeric x** (both axes
continuous).

```markdown
<!-- _class: xychart -->

`Spend $k 0–50 → Conversions 0–400`

## Diminishing returns set in past $30k.

- Paid search
  - Brand `12, 210`
  - Non-brand `28, 340`
- Display
  - Prospecting `40, 180`
  - Retargeting `9, 150`
```

- Eyebrow declares both axes (reuses quadrant's grammar). Modifiers: `bubble`
  (third value = size, `x, y, size`), `connected` (join a series' points in
  order — a continuous-x line), `trend` (fit line). Multi-series → SVG key.

### 4. `slopechart` — before → after across items

The chart `piechart.docs.md` already tells authors to reach for. Two columns; one
sloped line per item connects its left and right value; up/down coloured.

```markdown
<!-- _class: slopechart -->

`Share of pipeline · FY24 → FY25`

## Enterprise overtook mid-market.

- Enterprise `28, 41`
- Mid-market `39, 33`
- SMB `33, 26`
```

- Flat list, two values per item (`left, right`). Eyebrow's `→` names the two
  columns. Self-labelling (item labels at the ends), no key. Modifiers:
  `highlight` (emphasize the crossers), `rank` (label rank change).

### 5. `waterfall` — a running total bridge

The board "revenue bridge": a start, signed deltas, an end. Signs drive
direction and colour; `=` marks a computed subtotal/total bar.

```markdown
<!-- _class: waterfall -->

`ARR bridge $M · FY25`

## Net new landed us at 133.

- Opening `120`
- New business `+24`
- Expansion `+11`
- Churn `-14`
- Contraction `-8`
- Closing `=`
```

- Flat list. A leading `+`/`-` is a delta (rise/fall); a bare first value is the
  start; `=` computes the running total to that point (or a bare trailing value
  asserts it). Increase/decrease/total map to `--state-pass/-fail/-mute` (or
  cat tokens). Self-labelling. Modifier: `horizontal`.

### 6. `bullet` — a measure against target and qualitative bands

The KPI meter `progress` can't be: an actual bar, a target tick, and 2–3
qualitative background bands. One row per KPI (stacks like `progress`).

```markdown
<!-- _class: bullet -->

`Q2 KPIs vs target`

## Two of three cleared the bar.

- Revenue $M `74` `80`
- NPS `61` `55`
- Churn % `4.2` `3.0`
```

- Flat list: `actual` then `target` pill. Bands default to thirds of the axis
  (auto-fit or eyebrow-scaled); an optional nested bullet can name explicit band
  edges. A value past target reads pass, short reads warn — self-labelling, no
  key. Modifier: `compact`.

## Shared kernel — extract quadrant's axis core

To keep one source of truth (HARD RULE #1), the reusable primitives move out of
`quadrant.transform.js` into a shared module,
`lib/components/chart/_chart-family/cartesian.js`:

- `parseAxes(eyebrow)` — the `<X> min–max → <Y> min–max` grammar.
- `buildScale(data, axes)` — `niceCeil` auto-fit, per-axis min/max, zero-baseline.
- `plotPoint` / `plotBand` — viewBox mapping; `bubbleR` — √-area sizing.
- axis chrome (gridlines, tick labels, axis names) as a shared SVG emitter.

`quadrant` then imports these instead of owning them (its 2×2 fill, cohort hull,
and MQ chrome stay local). New members register in `CHART_LAYOUTS` and ship a
delegated `<name>.transform.js` (the preferred pattern per the chart-family
"future refactor" note). Each new member reuses `_chart-family/svg-legend.js`
for its key and `mark-detail.js` for the reveal/speaker-note substrate, so all
six read as one family and honour three-renderer parity.

## `barchart` vs `progress` — the boundary (documented in both docs)

- **`progress`** — single series, values are **percent-complete**, each row
  carries a **status pill** (`on-track`/`at-risk`/`blocked`). It's a status
  meter, not a value chart.
- **`barchart`** — one or many series, values are **any measure on a shared
  numeric axis**, grouped/stacked. It's the comparison chart.

A "which do I use?" note lands in both `progress.docs.md` and
`barchart.docs.md`.

## Staging — sequential PRs, never stacked (HARD RULES #17, #8, #9)

The broad set is too large for one PR. Each lands as its own branch → PR off a
fresh `main`, so nothing stacks:

1. **Kernel + `barchart` + `linechart`** — one feature ("cartesian value charts"):
   extract `cartesian.js`, refit `quadrant` onto it (maker–checker this refactor —
   real blast radius), ship both categorical-axis charts + a demo deck.
2. **`xychart`** — numeric axes; thin consumer of the shared kernel + quadrant core.
3. **`slopechart`.**
4. **`waterfall`.**
5. **`bullet`.**

Each PR ships its `examples/<slug>.md` demo deck (+ committed PDFs), keeps the
six long-running galleries isolated until a post-review graduation commit
(#8), records its `CHANGELOG` `### Added` entry, and drives CI green before the
merge gate.

## Open questions deferred to build time

- **Combo / dual-axis** (bars + overlaid line on a secondary axis) — genuinely
  harder (two y-scales); flagged for a follow-up, not in this set.
- **Vertical-vs-horizontal default** for `barchart` — proposed vertical; revisit
  against the gallery once rendered.
- Lower-priority members if demand appears: histogram, dot-plot/lollipop,
  heatmap-matrix, inline sparkline treatment.
