# piechart

> Pie or donut chart with legend — proportional wedges.

**Function** evidence · **Form** canvas · **Substance** series

**Tags** `donut` · `proportion` · `percentage`

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the breakdown. |
| `slices` | `ul > li` | yes | One li per slice: label text then a trailing inline-code value pill, e.g. - Marketing `40%` (slices are drawn proportionally to the values). |
| `detail` | `li > ul` | no | Optional nested sublist under a slice. Drives two surfaces from one source via the shared chart-family detail substrate (identical to funnel/map/quadrant/radar): (1) Present/Practice — the kernel keeps the label/value as-is, tags each wedge `<path>` with `data-mark`, and emits the sublist as an inert `<template class="chart-detail">` (inside a `.chart-details` wrapper) the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Label (value): item · item`) as a Marp-faithful comment, which notes-core lifts into the per-slide note channel (a PDF text annotation + the hidden `aside`). The note rides the existing channel, so the chart pixels stay byte-identical. A pie with no sublists emits no note and is unchanged. Detail sublists must be bullet (`-`/`*`) lists, not numbered. |

### Variant decision rule

- **default.** Analyst or working-session decks, or a low slice count (3-4) where the full disc reads cleanly without competing for the center.
- **donut.** Board/investor decks by default, or whenever a `detail` sublist under a slice needs somewhere for its context to visually land — the open center is where that annotation reads.

### Common mistakes

- **Slice values mix formats, e.g. some as `40%` and others as `120 hrs` in the same chart.** Every slice pill in one chart shares the same unit/format. Mixing formats breaks the part-to-whole read the wedges are supposed to communicate.
- **Slices authored in a random order instead of largest-to-smallest.** piechart does not auto-sort — author order is wedge draw order. List slices in descending value (or another deliberate narrative order); a shuffled list scatters the visual hierarchy the wedges carry.
- **A `detail` sublist under a slice authored as a numbered list.** Detail sublists must be bullet (`-`/`*`) lists, not numbered — the shared chart-family detail substrate (funnel/map/quadrant/radar too) only picks up bullet lists.

### Data shape

- Values should sum to a meaningful whole (ideally ~100%, or one consistent unit like person-hours) — the wedge angles are only meaningful as a partition, not as independent metrics.
- Author slices in descending value order; the engine draws wedges in source order and never auto-sorts.
- Keep every slice label to 1-3 words — the legend sits beside the wedges and long labels wrap and crowd it.
- Stay at 3-6 slices for the sweet spot; past ~8 the legend and wedges both degrade, and past 11 (the stress-tested ceiling) individual slices stop being readable — collapse the long tail into a single `Other` slice instead.

Use for part-to-whole breakdowns with three to six slices. Add the `donut` modifier for a hole in the middle — visually cleaner for executive decks.

## When to use

- **Three to six parts of a whole.** Time allocation, budget breakdown, mix-of-business. Past six slices the wedges become unreadable and the legend overwhelms — split or pick the top five plus an `Other` slice.
- **Proportions matter more than precision.** Pie charts are good at 'roughly a third', bad at 'is it 28% or 31%?'. If exact differences are the argument, reach for a bar chart (`progress`) where the eye can compare lengths directly.
- **Donut for executive decks.** The `donut` modifier hollows the centre — cleaner, less crowded, and the hole reads as composed rather than as a missing slice. Default to donut for board / investor decks; reserve solid pies for analyst working sessions.

## When NOT to use

- **Slices that don't sum to a whole.** A pie of unrelated metrics is meaningless — the visual implies parts of a whole. If your values are independent measures, use stats or a bar chart instead.
- **Two slices.** A two-slice pie is just a percentage with extra steps. Use big-number or split-panel metric — the audience can read '38% / 62%' faster than they can decode a half-and-half disc.
- **Comparing two pies.** Side-by-side pies force the audience to compare wedge angles across two figures — humans are bad at this. Use grouped bars or a slope chart to land the comparison cleanly.

## Authoring

```markdown
<!-- _class: piechart donut -->

`Eyebrow · context`

## What the breakdown shows.

- First slice `40%`
- Second slice `30%`
- Third slice `20%`
- Fourth slice `10%`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│          Distribution heading           │
│                                         │
│                  ╭──────╮               │
│                 │▓▓▓░░░░│               │
│             │▓▓░░░░░│  ◆ 40%            │
│             │░░░▓▓▓░│  ◇ 35%            │
│              ╰──────╯   ○ 25%           │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `donut` — donut

The center carries the total.

```markdown
<!-- _class: piechart donut -->

`H1 2026 · 1,840 person-hours`

## donut opens the center for the total.

The toil-and-on-call slice is the one nobody put in the roadmap.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Explaining the framework to stakeholders `9%`
- Toil and on-call `5%`

Refreshed weekly · figures from the time-tracking export
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`progress`](../../chart/progress/progress.docs.md) — comparable parts but precise differences matter
- [`stats`](../../evidence/stats/stats.docs.md) — the values are independent metrics, not a partition
- [`big-number`](../../statement/big-number/big-number.docs.md) — the headline is one slice, not the breakdown
- [`kpi`](../../evidence/kpi/kpi.docs.md) — the slices need status framing and targets

## Demo deck

See [piechart.gallery.light.pdf](./piechart.gallery.light.pdf) for rendered examples of every variant.
