# funnel

> Tapering stages that show where a flow drops off, with the conversion rate between each.

**Function** evidence · **Form** canvas · **Substance** series

**Tags** `percentage` · `sequence` · `pitch`

Use for a pipeline that narrows — a sales / conversion funnel, a hiring or grant pipeline, an onboarding flow. Each stage's band width is proportional to its value; the stage-to-stage conversion % is printed in the gaps so the leak is the read.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the flow and, ideally, the takeaway (‘Where the pipeline leaks’). |
| `stages` | `ul > li` | yes | One li per stage, in flow order (widest first). Lead with the stage label, then a trailing inline-code value — `Signups \`4,800\``. Commas and units are tolerated; the largest value sets full width. Three to seven stages read best. |
| `detail` | `li > ul` | no | Optional nested sublist under a stage. Drives two surfaces from one source (shared with pie/map/quadrant via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the stage `<polygon>` with `data-mark` and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Label (value): item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. A funnel with no sublists emits no note and is unchanged. |

### Common mistakes

- **Assuming the `detail` sublist appears somewhere visible on the printed chart face.** Detail bullets render NOWHERE on the chart itself — they drive a hover/tap reveal popover on screen and fold into the PDF's speaker note; a funnel with detail bullets looks pixel-identical to one without on the printed page.

### Data shape

- Stage values must be monotonically non-increasing in authored order (top to bottom) — the taper and every printed conversion percentage assume each stage is a strict subset of the one before it.
- The trailing value is a single number tolerant of commas and units (`4,800`, `$12k`) — don't combine two figures or a range into one chip.

## When to use

- **The story is the drop-off.** A funnel earns its shape when each stage is a strict subset of the one above and the audience needs to see WHERE the flow narrows — the leaky step, not just the totals. If the stages aren't a shrinking pipeline, use `progress` or `stats`.
- **Three to seven stages.** Two stages is just a ratio (use `big-number` or `stats`); past seven the bands thin out and the conversion labels crowd. Most pipelines fit in four to six.
- **Values in flow order, widest first.** Author the stages top-to-bottom as the flow runs, largest count first. The widest value sets full width and every band scales to it; the conversion % is computed from each value to the next.

## When NOT to use

- **Stages that aren't a subset.** If a later stage can exceed an earlier one (it's a category breakdown, not a pipeline), the taper lies. Use `piechart` for parts of a whole or `progress` for independent metrics.
- **A funnel of two stages.** Two bands is a single conversion rate dressed up as a chart. State it as a `big-number` (‘18% convert’) or a two-tile `stats` instead.
- **Non-monotonic values.** Values that rise and fall make the trapezoids bulge and the conversion %s read oddly. A funnel assumes a monotonic narrowing; for an up-and-down series use a `progress` or a chart with an axis.

## Authoring

```markdown
<!-- _class: funnel -->

## Where the flow drops off.

- First stage `1000`
- Second stage `600`
- Third stage `320`
- Fourth stage `140`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│        Where the pipeline leaks.        │
│                                         │
│   Visitors    [============]   12,000   │
│     62%        [========]      4,800    │
│   Activated    [=====]         2,160    │
│     40%        [==]              864    │
│   Paid         [=]               670    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`progress`](../../chart/progress/progress.docs.md) — independent metrics as labeled bars, not a narrowing pipeline
- [`stats`](../../evidence/stats/stats.docs.md) — a row of headline figures with no drop-off relationship
- [`piechart`](../../chart/piechart/piechart.docs.md) — parts of a single whole rather than sequential stages
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — the stages are a process to walk through, not values to compare
- [`big-number`](../../statement/big-number/big-number.docs.md) — a single conversion rate is the whole story

## Demo deck

See [funnel.gallery.light.pdf](./funnel.gallery.light.pdf) for rendered examples of every variant.
