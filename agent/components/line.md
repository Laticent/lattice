# line

> A measure plotted across an ordered axis, so the movement is the read — one line or several, optionally filled, stacked, or stepped.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — The plot, the grid, the axis, every label and every series is one `<svg>`. A line is a claim about SHAPE — the reader compares the slope of one series against another and against the gridline behind both — so the marks and the scale they are read against have to live in one coordinate system, not in boxes that happen to line up.

**Tags** `metric` · `board-deck` · `takeaway` · `strategy`

Use when the claim is that something MOVED: revenue by quarter, headcount through a reorg, latency after a fix. Points sit on a shared value scale so the slope between them is comparable across series; each series is named at the end of its own line in that line's color, so the reader never travels to a key.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the movement, not the chart (‘Renewals recovered in the second half’, not ‘Revenue line chart’). |
| `points` | `ul > li` | yes | One li per point on the category axis, in order — the authored order IS the axis order and is never sorted. Lead text is the category label, and a trailing inline-code pill is its value: `Q1 2026 \`4.2\``. For several series, nest one li per series under each category: `- Q1 2026` then `  - Product \`2.4\``. Magnitude suffixes are scale, not decoration — `1.2M` is 1200000 — and an affix every value agrees on (`$`, `%`, `kg`) is carried onto the axis. |
| `detail` | `li > ul` | no | Optional nested bullet under a CATEGORY whose trailing pill is not a number — that is the whole disambiguation rule: a nested item ending in a numeric pill is a data point, anything else is detail. Drives the Present-mode reveal for that category's band and folds into the slide's speaker note; it paints nothing on the chart, so a deck with detail is pixel-identical to one without. |

### Variant decision rule

- **default (no modifier).** The value changes continuously between the points you plotted — revenue, headcount, latency. The slope between two points is a real quantity, so drawing it as a slope is honest.
- **`step`.** The value HOLDS and then JUMPS — a list price, a rate, a band, a seat count. A straight interpolation between two step values draws a change that did not happen.
- **`area`.** There is exactly ONE series and its magnitude matters as much as its shape. With more than one series the fill stops being honest and the kernel drops it back to plain lines.
- **`stacked-area`.** The series ADD UP to a total the audience cares about, and the story is how the mix shifted inside it. If they do not sum to a meaningful total, stacking invents one.

### Common mistakes

- **Adding `area` to a chart that has several series and expecting several filled regions.** `area` fills only when there is exactly one series; with more the kernel renders plain lines, because opaque overlapping regions hide each other. Use `stacked-area` if the series sum to a total you mean.
- **Assuming the value axis always starts at zero, as it does for a bar.** A plain `line` or `step` axis floats when the data sits well above zero (it starts at zero once the low point falls inside the bottom sixth of the range), because forcing zero flattens a real trend into a scratch at the top of the box. The tick column always prints where the axis actually starts. `area` and `stacked-area` always reach zero — the filled region is read as quantity.
- **Reordering the series under each category to ‘tidy’ a stacked area.** In `stacked-area` the authored order IS the stacking order, bottom-first, and it is never sorted for you. Author the largest and steadiest series first so the noisy one rides on a stable base; a series stacked on a jagged neighbor inherits the neighbor's wobble.
- **Leaving a series out of one category and expecting the line to bridge the gap.** A missing point BREAKS the line — a gap is drawn, because a straight bridge would invent a measurement. Author every series at every category, or accept the gap. The one exception is `stacked-area`, where a missing point has to contribute zero to keep the stack's baseline, which is a claim you may not mean.
- **Writing a nested bullet with a non-numeric pill under a category and expecting it to plot.** A nested item is a data point only when its trailing pill parses as a number; `- Best quarter in \`EMEA\`` is detail, not a series called ‘Best quarter in’. That rule is what keeps a note ending in inline code from being silently plotted at zero.
- **Reaching for `area` on a series whose movement is small relative to its own size.** An area chart's axis always reaches zero, so a four-percent move flattens into a line across the top of a filled block. Plot it as a plain `line`, whose axis floats, and let the tick labels say where it starts.
- **Mixing depths — giving one category its own value while the others carry a nested series list.** A flat category among nested ones belongs to no series, so every line breaks across it at once. Nest it like the rest (`- Q3` then `  - Product \`4.2\``), or make the whole chart flat and plot one series.

### Data shape

- Two points is the hard floor — below it the kernel leaves the list alone and renders no chart, because a single reading has no movement to draw. Four or more is where a shape starts to read.
- The authored order of the categories is the axis order — the kernel never sorts. Write them in the order they happened.
- Two to six series. Past six, `parseSeries` reports the overflow rather than truncating; consolidate the tail into one ‘Other’ series before it gets there.
- Series names are printed at the end of their own lines, so keep them under about twenty-five characters. A name too long for the right-hand column makes the chart fall back to a key, which is the weaker read.
- Use one unit across every series, and write it into the values (`$4.2M`, `12%`, `840kg`) — an affix every value agrees on is carried onto the axis, and a mixed series gets none.
- A magnitude suffix is scale, not decoration: `1.2M` is 1200000 and `800k` is 800000, so the two can sit on one axis. `%` is not a magnitude — `12%` is 12.
- A category that omits a series leaves a HOLE, and the line breaks across it. In `stacked-area` a hole is forced to contribute zero — the stack needs a baseline — so author every series at every category before stacking.
- `stacked-area` assumes non-negative values; a negative contribution makes the bands cross and the total stop reading as a total. Use plain `line` for a series that can go below zero.
- Four to twenty-four points. Dots appear per measurement while the points are far enough apart to read as measurements and are dropped once they would bead the line.
- Keep every category at the SAME depth. A category written flat (`- Q3 \`4.2\``) among nested ones carries no series, so it renders as a hole in every line at once — the parser reports the mix, and the fix is to nest that category like its neighbors.

## When to use

- **The axis is ordered and the order means something.** Quarters, months, sprints, release numbers, stages of a rollout. A line connects its points, and that connection is a claim that moving from one to the next is meaningful. Plot unordered categories — regions, products, teams — with `bar` instead, where nothing is joined.
- **Two to six series, named at the end of their own lines.** Past six the categorical palette repeats and the lines stop being distinguishable (Wong 2011). Each series is labeled at its right-hand end in its own color, so the chart carries no key to look away to — consolidate a long tail into ‘Other’ rather than adding a seventh line.
- **Four to about twenty-four points.** Below four there is no shape to read — say it with `big-number` or `stats`. The kernel prints a dot per measurement while the points stay far enough apart to read as measurements, and drops the dots once the series is dense enough that the shape is the story.
- **Values in one unit, on one scale.** Every series shares the value axis, so the comparison the chart invites is a comparison of magnitudes. Two series in different units (dollars and percent) on one plot is a chart that lies quietly; split them across two slides, or plot the one that matters and state the other.

## When NOT to use

- **Two points.** Two points are a slope, and `slope` draws it better. Note it is authored transposed: one bullet per entity, its two points nested.
- **Categories that are not ordered.** Joining 'Legal, Finance, Sales, Ops' asserts a progression that does not exist. Use `bar`, or `stacked-bar` if each one decomposes.
- **A filled area for several series.** Two opaque regions hide each other. Use `stacked-area` when the series sum to a total; the kernel drops the fill rather than lie.
- **A trend where the story is attainment against a target.** If the question is 'did we hit the number', the target is not on the line. `bullet` puts actual, target and a band on one row.

## Authoring

```markdown
<!-- _class: line -->

## The number moved, and here is the shape of it.

- Q1 `12`
- Q2 `18`
- Q3 `17`
- Q4 `26`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       Services grew into the gap.       │
│                                         │
│     6M |        .-*-.      Renewals     │
│              |   .-*-`    `*            │
│       3M | *-`     .-*--*    New        │
│                 |.--*--*-`              │
│          0 +-------------------         │
│             Q1  Q2  Q3  Q4  Q1          │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `area` — area

One series with the region under it filled — the fill reads as quantity, so it is honest for a single series only and the axis always reaches zero.

```markdown
<!-- _class: line area -->

## Cash on hand never dipped below one quarter of runway.

- Jan `8.2`
- Feb `7.6`
- Mar `6.9`
- Apr `7.4`
- May `8.8`
- Jun `9.6`
```

### `stacked-area` — stacked-area

Composition over time: the series stack to a total, in the order they were authored, largest and steadiest at the bottom.

```markdown
<!-- _class: line stacked-area -->

## The mix shifted; the total barely moved.

- FY23
  - License `6.2`
  - Support `2.8`
  - Services `1.4`
- FY24
  - License `5.6`
  - Support `3.4`
  - Services `2.0`
- FY25
  - License `4.9`
  - Support `3.9`
  - Services `2.7`
- FY26
  - License `4.1`
  - Support `4.4`
  - Services `3.4`
```

### `step` — step

A value that HOLDS and then JUMPS — a headcount, a price tier, a rate — drawn as a plateau per period rather than a slope between periods.

```markdown
<!-- _class: line step -->

## The list price held for three quarters, then moved twice.

- Q1 `1,200`
- Q2 `1,200`
- Q3 `1,200`
- Q4 `1,450`
- Q1 `1,450`
- Q2 `1,690`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`bar`](./bar.md) — the categories are unordered and the claim is magnitude, not movement
- [`slope`](./slope.md) — there are exactly two points and the story is which entities changed rank
- [`stacked-bar`](./stacked-bar.md) — each period decomposes into parts and the periods are compared, not connected
- [`bullet`](./bullet.md) — the number is read against a target and a qualitative band, not against its own past
- [`gantt`](./gantt.md) — the horizontal axis is real dates carrying durations rather than an ordered set of measurements

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/line>
