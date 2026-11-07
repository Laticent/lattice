# ep-curve

> An exceedance-probability curve: the loss to expect once every N years, with return periods across on a log scale and up to four curves (OEP and AEP, gross and net).

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — The curves, their points, the return-period and loss axes and the curve names are one `<svg>`. The return period runs across on a log scale, so 1-in-10, 1-in-100 and 1-in-1,000 are evenly spaced, and the loss climbs a linear axis from zero.

**Tags** `risk` · `metric` · `assessment` · `board-deck`

Use when the question is how big a loss to plan for: a reinsurance program's 1-in-100 and 1-in-250 losses, a cat model's output, a capital model's tail. Each point is `{return period, loss}`; a curve is a name with its points nested under it.

## Agent contract

**By venue** no count budget. A chart scales its marks to the box instead of clipping, so no count marks where it stops fitting.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the loss the audience should remember ('A 1-in-100 year costs $410M'), not 'EP curve'. |
| `axes` | `p > code` | no | Optional axis line, as ONE bracketed list in its own paragraph ABOVE the heading: the return-period axis, then the loss axis — `[{Return period, 10..250}, {Loss}]`. A return-period domain of at least 1 widens the axis past the points (a minimum below 1 is ignored); a loss domain raises the ceiling, while the floor stays zero or the lowest loss. The return-period axis is always log, so `log` changes nothing. Without the line the x axis is captioned 'Return period'. Same idiom as `scatter` and `histogram`. |
| `curves` | `ul > li` | yes | A flat list of point records draws one curve: `` `{100, $410M}` `` is a 1-in-100 year loss of $410M, return period first. For several curves, write each curve's name and nest its points under it: `- OEP` then `  - `{100, $410M}``. Up to four curves; a return period below 1 is not a point. |

### Common mistakes

- **Writing the loss first (`{$410M, 100}`).** The record is `{return period, loss}`: the return period runs across the bottom, the way the chart is drawn.

### Data shape

- Each point is `{return period, loss}`: the return period a number of years of at least 1, the loss any number Segno reads (`$410M`, `410`).
- A curve's points are drawn in return-period order whatever the order written; a return period given twice in one curve keeps the first.
- `lint:deck` names a point it cannot read (a thousands separator, `{1,000, $900M}`, is the commonest), a return period given twice in one curve, and a fifth curve.

## When to use

- **How big a loss to plan for.** An EP curve earns its slide when the question is the size of a rare loss: the 1-in-100 a program must cover, how much a reinsurance tower takes off the gross curve. For how often each loss band happens, use `histogram`.
- **Two to four curves.** OEP and AEP, or gross and net, read best together: the gap between the curves is the story. Past four, split the slide.

## When NOT to use

- **Return period written as a label.** `- 1-in-100 `$410M`` is a label and a value, which the chart cannot place. Write the point record, return period first: `` `{100, $410M}` ``; the axis prints `1-in-100` for you.
- **A probability instead of a return period.** Write the return period, not the annual probability: 1% is `{100, …}`, 0.4% is `{250, …}`.

## Authoring

```markdown
<!-- _class: ep-curve -->

## A 1-in-100 year costs $410M.

- `{10, $120M}`
- `{50, $300M}`
- `{100, $410M}`
- `{250, $560M}`
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

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`histogram`](./histogram.md) — how often each band of loss happens, rather than the loss at each return period
- [`tower`](./tower.md) — the reinsurance program the curve is priced against
- [`line`](./line.md) — a quantity over time, on an evenly spaced axis

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/ep-curve>
