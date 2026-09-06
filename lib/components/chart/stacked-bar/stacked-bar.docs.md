# stacked-bar

> Bars split into parts, so one chart carries both the total for each category and the mix inside it.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Plot, stack and key are one `<svg>` in one viewBox. A stack is a cumulative geometry — every segment's position depends on the ones below it and on the value axis both bars share — so it has to be drawn in one coordinate system rather than assembled from boxes that happen to line up, and the key has to scale with the plot it names.

**Tags** `proportion` · `board-deck` · `metric` · `summary`

Use when the claim is that a total DECOMPOSES — revenue by product line across quarters, cost by function across years, headcount by team across sites. The bar length is the total, each segment is a part, and the segments hold the same order in every bar so a part can be tracked across categories. `share` normalizes every bar to 100 % when only the mix matters; `row` runs horizontally for long category names.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name what the decomposition shows (‘Services is carrying the growth’), not the chart type. |
| `categories` | `ul > li` | yes | One li per category, in the order they should read left to right (or top to bottom under `row`). Lead text is the category label. Optionally a trailing inline-code value — the authored TOTAL, printed instead of the computed sum when the two agree. |
| `parts` | `li > ul > li` | yes | The nested sublist under each category: one li per part, lead text = the series name, trailing inline-code = its value (`Product \`2.4\``). Series order is taken from the FIRST category that names each one and is then held identical in every bar. A part a category does not name is simply absent from that bar, and a part valued zero draws nothing; nothing is inferred. |
| `detail` | `li > ul > li` | no | A nested item whose trailing inline-code pill is NOT a number is per-category detail, not a part — the chart-family mark-detail payload. It drives the Present-mode reveal on the whole bar and folds into the slide's speaker note; it paints nothing, so a chart with detail is pixel-identical to one without. |

### Variant decision rule

- **default (no modifier).** The totals differ and that difference is part of the claim — segment length is the value, so the bar height and the mix are both read off one axis.
- **`share`.** Only the mix matters, or the totals are so unequal that the smaller bars' segments collapse to a few units. Every bar fills the axis; the absolute total is printed above it so the scale is not lost.
- **`row`.** Category names are long enough to wrap or collide under the bars — the bars run horizontally and the names take a left column.

### Common mistakes

- **Authoring a flat list (one value per category, no nested parts).** A flat list has nothing to decompose; it renders as a single-part stack, which is just a bar chart. Nest the parts under each category, or switch the slide to `bar`.
- **Expecting the parts to keep each category's own order.** Series order is the AUTHOR's order, taken from the first category that names each part, and it is then identical in every bar. That is deliberate — a stack whose order changes between bars cannot be compared at all. Reorder the first category's sublist to reorder the stack.
- **Putting a total on the category line that does not equal the parts.** The authored total is printed only when it agrees with the sum of the parts to within 0.5 %; otherwise the computed sum is printed, because the drawn bar IS the sum and a caption contradicting the mark is worse than a rounded one.
- **Reading the named figures beside the chart as though they described every bar.** That column is the LAST bar's own mix — its parts named and valued at the height of the band each one names — and it is headed by that category's name for exactly this reason. Every other bar is read off the value axis. When a part name is too long for the column the chart falls back to the family's key, which carries the same reading under the same heading.
- **Expecting a per-segment number on every part.** Only the last bar's parts are numbered. A number on every segment was built and rendered: it needs the gutter between bars, that gutter narrows as categories are added, and past four categories the figures print over the next bar. Rather than crowd or truncate, the chart gives one bar's exact figures and the axis for the rest. Every value is in the accessible description and in the hover payload regardless.

### Data shape

- Two to six parts per category, and two to six categories. A seventh part is not dropped: the kernel keeps the first five named and sums everything after them into one 'Other' part, so the total stays exact and the folded names are listed in the accessible description. Author the consolidation yourself rather than leaving it to the chart — you know which tail belongs together.
- A part below about 3 % of the bar renders as a sliver roughly one unit high, unlabeled. Nothing is done to rescue it: a minimum visible height would make the picture lie about the value, and every part above it would shift to pay for the lie. Fold slivers into 'Other' before authoring.
- Values are the shared Cartesian pills, so a magnitude suffix is SCALE, not decoration: `1.2M` is 1 200 000 and `800k` is 800 000, and the two sit correctly on one axis. `%` is not a magnitude — `12%` is 12. An affix every value agrees on (`$`, `kg`) is carried onto the axis; a mixed series gets a bare axis. A computed total is printed to the number of decimals you typed, so author every part to the same precision.
- Part names are set beside the last bar, so keep them short — about twenty characters fits the column. A longer name is not truncated; the whole chart falls back to the family's key instead, which costs the plot about a third of its width.
- Negative parts are drawn below the zero rule and the total is the net sum, which is honest but hard to read — the parts above zero no longer sum to the bar. If contributions are signed, `waterfall` tells that story properly.
- Under `share` the denominator is the sum of each category's ABSOLUTE part values, so every bar fills exactly 100 % of the axis and the printed percentages sum to 100 (largest-remainder rounding, never three 33s adding to 99). The absolute total is printed above each bar so normalization does not destroy the scale — unless every total is the same, in which case it says nothing and is dropped.

## When to use

- **The total AND the mix are both the story.** A stacked bar is the only chart in the family that answers ‘how big’ and ‘made of what’ in one mark. If only the total matters, use `bar`; if only the mix matters and there is a single total, use `piechart`.
- **Two to six categories, two to six parts.** Six is the categorical palette's perceptual cap (Wong 2011), and a stack is harder than a pie because the parts do not share a baseline. Four parts across five categories is the comfortable middle.
- **Reach for `share` when the totals are wildly unequal.** If one bar is five times another, the small bars' mix collapses into a few units of height and cannot be read. `share` normalizes every bar to 100 % and prints the absolute total above it, so the mix becomes readable without losing the scale.

## When NOT to use

- **Tracking a part that is not at the bottom.** Only the bottom segment shares a baseline across bars. Every segment above it floats on the ones below, so a reader cannot see whether ‘Services’ grew — they can only see where its band sits. If ONE part is the story, put it at the bottom of the stack, or use `line` to plot it directly.
- **Parts that are not parts.** Stacking independent metrics — revenue, headcount, NPS — produces a bar whose height means nothing. The parts must sum to something a reader would name. Use `bar` for independent magnitudes.
- **A long tail of slivers.** A 2 % part is about one unit of bar height: too thin to see, impossible to label, and it pushes everything above it around. Consolidate the tail into one ‘Other’ part before authoring, or drop to the four parts that carry the claim.
- **One category.** A single stacked bar is a pie chart drawn as a column, and a pie reads proportions better. Use `piechart` for one total; this chart earns its shape from the comparison ACROSS bars.

## Authoring

```markdown
<!-- _class: stacked-bar -->

## What the total is made of.

- First category
  - Part one `40`
  - Part two `25`
  - Part three `15`
- Second category
  - Part one `46`
  - Part two `31`
  - Part three `12`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│     A total, and the mix inside it.     │
│                                         │
│                             FY25        │
│   [///] [///] [///]    Support   5.2    │
│   [###] [###] [###]    Licenses 19.6    │
│            -----------------            │
│            FY23  FY24  FY25             │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `share` — share

Every bar normalized to 100 %, so only the mix is comparable — the absolute total moves to a caption above the bar.

```markdown
<!-- _class: stacked-bar share -->

## share normalizes every bar, so only the mix is compared.

- FY23
  - Licenses `18.4`
  - Services `6.2`
  - Support `4.1`
- FY24
  - Licenses `19.1`
  - Services `9.8`
  - Support `4.6`
- FY25
  - Licenses `19.6`
  - Services `15.4`
  - Support `5.2`
```

### `row` — row

The stack runs horizontally, so long category names sit in a left column instead of wrapping under a bar.

```markdown
<!-- _class: stacked-bar row -->

## row turns the stack on its side for long category names.

- Professional services
  - Delivery `4.2`
  - Training `1.6`
  - Advisory `0.9`
- Platform subscriptions
  - Delivery `11.8`
  - Training `2.1`
  - Advisory `1.4`
- Managed operations
  - Delivery `6.4`
  - Training `0.8`
  - Advisory `2.2`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`piechart`](../../chart/piechart/piechart.docs.md) — one total to decompose, with no comparison across categories
- [`progress`](../../chart/progress/progress.docs.md) — independent attainment bars with no parts and no shared value axis
- [`funnel`](../../chart/funnel/funnel.docs.md) — the stages are a narrowing pipeline, not parts of a total
- [`matrix-grid`](../../chart/matrix-grid/matrix-grid.docs.md) — the cells are qualitative judgments rather than values that sum

## Demo deck

See [stacked-bar.gallery.light.pdf](./stacked-bar.gallery.light.pdf) for rendered examples of every variant.
