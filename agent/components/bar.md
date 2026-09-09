# bar

> Bars from a zero baseline that compare magnitude across categories — as columns, rows, side-by-side groups, or signed off a centered zero.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Bars, grid, axis, category labels and the printed values are one `<svg>`. A bar chart is a claim about LENGTH measured from a shared zero, so every mark and every label has to be placed in one coordinate system — assembled boxes would let the baseline drift and the comparison would quietly stop being true.

**Tags** `metric` · `ranking` · `contrast` · `board-deck`

Use when the claim is that these categories differ in size: revenue by region, headcount by team, spend by line item, variance against plan. Length from a common zero is the most accurately read encoding there is, so the bar is the default answer whenever the question is 'which is bigger, and by how much'. Values are printed on the bars and the value axis is dropped whenever that fits.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the takeaway, not the chart ('Growth is concentrated in EMEA', not 'Revenue by region'). |
| `categories` | `ul > li` | yes | One li per category, in the order they should read. Lead text is the category name, the trailing inline-code pill is the value — `EMEA \`4.2\``. Commas, currency symbols, units and magnitude suffixes are all read: `$4.2M` is 4 200 000 and the `$` and the magnitude carry onto the axis. A negative value hangs below (or left of) the zero rule. Three to eight categories read best. |
| `series` | `li > ul > li` | no | Nested items whose trailing pill is a NUMBER are the grouped form: each category gets one bar per series, side by side, and a key names them. Two to four series; past four the group gets too dense to compare across categories. |
| `detail` | `li > ul` | no | Nested items whose trailing pill is NOT a number (or that carry no pill) are per-category detail, not data. They render nowhere on the chart face: they drive the Present-mode reveal popover and fold into the slide's speaker note, so a chart with detail is pixel-identical to one without. This is the same detail-vs-data rule every Cartesian member shares. |

### Variant decision rule

- **default (no modifier).** Short category names — a quarter, a product, a region code. Columns read left-to-right as a sequence, which suits anything with a natural order.
- **`row`.** Category names are long, or there are more than about seven of them. A row label reads on one line in the gutter instead of wrapping into a narrow band, so nothing gets shortened. Reach for it the moment a name is longer than about fifteen characters.
- **`grouped`.** Two to four series measured on the same scale across the same categories — this year vs last, plan vs actual. Authored as a nested list; the nesting is what selects it.
- **`diverging`.** Values carry a sign and the direction is the point: variance to plan, sentiment, a tornado / sensitivity chart. Zero sits at the middle of the plot and the two sides share one scale.

### Common mistakes

- **Adding a `grouped` class and leaving the list flat.** The grouped form is selected by the DATA, not the class: nest the series under each category with numeric pills. A `grouped` token on a flat list draws the ordinary single-series chart rather than an empty one.
- **Expecting the value axis to appear on a small chart.** The chart prints each value on its own bar and drops the axis and gridlines whenever those labels fit — the number is right there, so a second way to read it is redundant chrome. The axis returns only when a label would no longer fit the room it has: its whole band in a single-series column chart, or just its own bar's slot when the bars are grouped. A row chart never needs it, because its values print into a gutter sized to hold them.
- **Writing values in mixed units, like `$4.2M` next to `3100000`.** Both parse to a number, but the axis affix is only adopted when EVERY value agrees on it — a mixed series gets a bare axis and loses the currency. Author one vocabulary for the whole list.
- **Reaching for `diverging` just because one value happens to be negative.** The ordinary form already hangs a negative bar below the zero rule with the axis extended to cover it. `diverging` is a stronger claim — it centers zero, gives both sides the same reach, and colors by sign — so use it when direction IS the story, not merely when a minus sign appears.

### Data shape

- The value pill is a number with optional currency prefix, thousands commas, magnitude suffix and unit: `$4.2M`, `12,400`, `68%`, `-3.1`. The magnitude suffix is SCALE, not decoration — `1.2M` is 1 200 000 — so `800k` and `1.2M` sit correctly on one axis.
- A negative value is legitimate in every form and hangs from the zero rule; the axis is widened to include it. Zero is legitimate too and draws no bar, with its value printed on the baseline.
- Bars are drawn in AUTHORED order, never re-sorted. Sort the list yourself when ranking is the story; leave it in natural order when the categories have one (quarters, stages, sizes).
- In the grouped form, a category that is missing one series simply draws fewer bars in that group rather than a zero — an absent measurement and a measured zero are different claims.
- A category name that will not fit its column band on two lines is not shortened: the chart switches itself to the row form, where the name reads in the gutter. How long is too long depends on how many categories share the width — about forty characters at four categories, about twenty at eight — so `row` is worth asking for outright whenever the names are business units, product lines or people.

## When to use

- **The claim is a difference in magnitude.** A bar earns its place when the audience should leave knowing which category is biggest and roughly by how much. Length from a shared zero is read more accurately than angle, area or color, which is why this beats a pie for anything that is not parts of one whole.
- **Three to eight categories.** Two categories is a ratio — say it as a `big-number` or a two-tile `stats`. Past eight the names crowd even in the row form and the reader stops comparing and starts scanning; consolidate the tail into 'Other'.
- **Long names mean `row`.** Column labels wrap into the width of one band, so a name past about fifteen characters is shortened or dropped. The row form puts the name in a wide left gutter where it reads on one line. When the names are business units, product lines or people, start from `row`.
- **One value per category, or two to four series.** The flat list is the single-series chart. Nesting numeric children turns it into the grouped form for a plan-vs-actual or year-over-year comparison. Past four series the bars inside a group get too thin to compare across groups — split the slide or switch to a small multiple.

## When NOT to use

- **Parts of one whole.** If the categories add up to a total and the split is the story, use `piechart` or `stacked-bar`. A plain bar says nothing about it.
- **A continuous series over time.** Twelve monthly bars ask a reader to compare twelve lengths when the claim is a trend. Use `line`, whose job is the movement.
- **A percentage against a target.** '68% of goal' is attainment, not magnitude across categories. `progress` shows attainment; `bullet` adds the target and the band.
- **A rainbow single series.** One series is one hue by design: the length carries the comparison. Color earns its place in `grouped`, where it names the series.

## Authoring

```markdown
<!-- _class: bar -->

## Which category is biggest.

- First `120`
- Second `86`
- Third `54`
- Fourth `31`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       Growth sits in two regions.       │
│                                         │
│              $4.2M  $3.1M               │
│           [####] [###]  $1.8M           │
│       [####] [###]  [##]   $0.6M        │
│        [####] [###]  [##]   [#]         │
│      -----------------------------      │
│       N.Am   EMEA   APAC   LATAM        │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `row`

Horizontal bars with the category name in a wide left gutter — the correct form whenever the names are long or numerous.

```markdown
<!-- _class: bar row -->

## Support load sits with two teams.

- Platform Engineering `1,240`
- Customer Success `980`
- Data & Analytics `410`
- Design Systems `260`
- Developer Relations `95`
```

### `grouped`

Two to four series side by side in each category, selected by nesting numeric children under each category.

```markdown
<!-- _class: bar grouped -->

## We beat plan everywhere but APAC.

- Americas
  - Plan `3.2`
  - Actual `3.9`
- EMEA
  - Plan `2.6`
  - Actual `3.1`
- APAC
  - Plan `1.9`
  - Actual `1.4`
```

### `diverging`

Signed values off a centered zero rule, both sides on one scale — the variance and tornado form.

```markdown
<!-- _class: bar diverging row -->

## What moves the forecast, and which way.

- Renewal rate `+2.4`
- Enterprise pipeline `+1.6`
- Price realization `+0.7`
- Services attach `-0.5`
- Churn in mid-market `-1.8`
- FX exposure `-2.9`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`progress`](./progress.md) — attainment against 100% rather than magnitude against each other
- [`piechart`](./piechart.md) — parts of a single whole, where the shares sum to one total
- [`funnel`](./funnel.md) — each stage is a subset of the one before and the drop-off is the story
- [`stats`](./stats.md) — a row of headline figures with no like-for-like comparison between them
- [`big-number`](./big-number.md) — one figure is the whole slide

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/bar>
