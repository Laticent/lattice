# heatmap

> A numeric matrix read as intensity — where the value concentrates across two dimensions.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — One SVG because the grid is one scale: every cell's intensity is only readable against the same minimum and maximum, so the cells, the row names and the column heads have to be laid out and measured together. Split across two elements and a row name drifts from the row it names the moment the box changes shape.

**Tags** `metric` · `percentage` · `assessment` · `positioning`

Use when the question is 'where does this concentrate', not 'how do these compare'. Every row-by-column crossing carries a number, and one sequential ramp turns the whole grid into a shape a reader takes in at once — a retention cliff, a risk cluster, a quiet quarter.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name what the grid shows ('Retention decays fastest in month two'), not the chart type. |
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the title — the dataset and its period. |
| `rows` | `table > tbody > tr` | yes | One table row per ROW of the matrix, leading with its label. The header row names the columns; a blank cell is a crossing nobody measured. |

### Common mistakes

- **Putting every value in one column.** A heatmap needs two dimensions. The header row names the columns and each body row leads with its label; one value column is a comparison, not a matrix, and renders nothing deliberately.
- **Padding a ragged matrix with zeros so every cell is filled.** Leave the cell blank. A zero states a measurement; an absent cell states that none was taken, and the chart paints the two differently.
- **Mixing units down a column — `62%` in one row and `0.62` in the next.** One measure, one unit, across the whole grid. The ramp is a single scale and cannot describe two.

### Data shape

- A markdown table: the header names the columns, each body row leads with its label.
- A blank cell is a crossing nobody measured, and paints as one. That is the normal case for a ragged matrix, not an authoring error.
- Up to 12 columns and 10 rows. Past that the cells stop carrying a readable value; consolidate a long tail rather than shrinking the grid.
- One unit across the whole matrix. The affix is read from the values and printed once in the description.
- **Values are binned into five tones, so near-equal cells share one.** The ramp is quantized rather than continuous — that is what lets the printed value keep AA contrast on every palette. The bands are cut at the matrix's own quantiles, so a skewed table still uses the whole ramp, but tone is not linear in value: the number in the cell is exact, the tone is a band. If a reader has to tell two close values apart by color, the comparison belongs on an axis.

## When to use

- **Two dimensions, one measure.** A number exists at every crossing of two categorical axes — cohort by month, region by quarter, hour by weekday — and the finding is a PATTERN across the grid rather than any single value.
- **The shape is the story.** You want the reader to see a cliff, a diagonal or a cluster before they read a single number. Intensity carries that pre-attentively; a table of the same numbers does not.
- **A ragged matrix is honest.** Newer cohorts genuinely have no month-six value yet. A heatmap paints those crossings as unmeasured rather than as zero, so the gap is visible instead of being read as a collapse.

## When NOT to use

- **One row of numbers.** A single series is not a matrix — it is a comparison, and a reader judges length far more precisely than intensity. Use `bar`. The kernel declines a one-column table for this reason rather than painting a single strip.
- **Qualitative cells.** If the cells are verbs, owners or statuses rather than numbers, the ramp has nothing to encode. Use `matrix-grid`, whose cells are tagged at parse time.
- **Precise comparison.** Asking a reader which of two similar cells is larger spends the one thing intensity is bad at, and the five-tone binning above makes it stricter: two cells in the same band are the same color by design. If the comparison has to be exact, the value belongs on an axis — `bar` or `line`.
- **Geography.** A value per country or region belongs on the `map` choropleth, which shares this ramp but places the cells where the reader expects them.

## Authoring

```markdown
<!-- _class: heatmap -->

## Where it concentrates.

- First row
  - Col A `12`
  - Col B `34`
- Second row
  - Col A `21`
  - Col B `43`
```

## Variants (component-specific)

### `scale`

Renders the band key beside the grid, naming each ramp step by the range of values it covers — reach for it when a reader has to know why two cells share a tone.

```markdown
<!-- _class: heatmap scale -->

`Retention · 2026 cohorts`

## The chart names its own bands.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`matrix-grid`](../../chart/matrix-grid/matrix-grid.docs.md) — the cells are qualitative — a verb, an owner, a status — rather than a number
- [`map`](../../chart/map/map.docs.md) — the two dimensions are geographic; same ramp, spatial placement
- [`bar`](../../chart/bar/bar.docs.md) — one dimension, and the comparison has to be exact
- [`quadrant`](../../chart/quadrant/quadrant.docs.md) — two CONTINUOUS axes with items placed on them, rather than two categorical axes with a value at each crossing

## Demo deck

See [heatmap.gallery.light.pdf](./heatmap.gallery.light.pdf) for rendered examples of every variant.
