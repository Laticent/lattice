# histogram

> One quantity cut into bands that join end to end: each bar is as wide as its band and its area is the band's share, with an optional log axis for bands that widen toward the tail.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — The bands, their values, the edge ticks and the axis captions are one `<svg>`. A band is as wide as its range on the x axis and as tall as its value per unit of range, so its area is its value; bands of one width draw exactly as a gapless bar chart would.

**Tags** `risk` · `proportion` · `metric` · `assessment`

Use when the question is how a quantity is spread: annual losses, claim sizes, deal sizes, response times. Each row is a band (`$1M..$10M`) and its share or count. The x axis is a number line, so bands of different widths draw honestly, and `log` in the axis line keeps a long tail readable.

## Agent contract

**By venue** no count budget. A chart scales its marks to the box instead of clipping, so no count marks where it stops fitting.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — say what the shape shows ('Most years stay under $10M; one in thirty tops $100M'), not 'Loss histogram'. |
| `axes` | `p > code` | no | Optional axis line, as ONE bracketed list in its own paragraph ABOVE the heading: x first, then y — `[{Annual loss, $1M..$250M, log}, {Share of years}]`. The x member is `{name, min..max, log}`: the domain is optional and derives from the bands, and `log` draws a log scale, which needs every band edge above zero. The y member is only a name; a histogram prints its values on the bars, not on a value axis. The paragraph is consumed and painted on the axes. Same idiom as `scatter` and `quadrant`. |
| `bands` | `ul > li` | yes | One li per band, in order along the axis: a range pill and a value pill, in either order — `` `$1M..$10M` `55%` ``. `..` is the only range delimiter. Optional lead text names the band (`Attritional `$0..$5M` `61%``); without it the band is named by its range. Bands should join end to end: a gap draws as empty space and an overlap draws two bars over the same stretch, and `lint:deck` names both. |
| `detail` | `li > ul` | no | Optional nested sublist under a band. It opens on hover or tap in Present, and folds into the speaker note in the PDF. |

### Common mistakes

- **Expecting equal-height bars for equal shares when the bands differ in width.** A bar's AREA is its share, so a band five times as wide with the same share is a fifth as tall. That is what keeps a wide tail band honest; the value printed on the bar is the share.

### Data shape

- Each row is a band `a..b`, with b above a, and a value. A row without both, or a band that does not climb (`$10M..$1M`), is left out.
- A value below zero draws with no height, because an area cannot be negative; `lint:deck` warns. For signed values use `bar`.
- `log` needs the whole axis above zero, the bands and any axis domain; otherwise the chart draws a linear axis, and `lint:deck` says so.

## When to use

- **The shape of a distribution.** A histogram earns its slide when the question is how a quantity is spread: where most of it sits and how long the tail is. To compare separate categories, use `bar`; for the chance of exceeding each loss, use `ep-curve`.
- **Bands that widen toward the tail.** Loss and claim bands usually widen ($1M, $10M, $50M, $250M). Write them as they are and add `log` to the axis line: each bar keeps its true area, and the tail stays readable.

## When NOT to use

- **Categories that are not a number line.** Regions, products or lines of business are separate things, not bands of one quantity. Use `bar`, which leaves gaps between them.
- **A dash for a range.** `$1M-$10M` is not a band: the dash reads two ways beside a negative number. Write `$1M..$10M`.

## Authoring

```markdown
<!-- _class: histogram -->

## Most values sit in the first band.

- `0..10` `45%`
- `10..20` `30%`
- `20..30` `15%`
- `30..40` `10%`
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

- [`bar`](./bar.md) — separate categories compared by size, not bands of one quantity
- [`ep-curve`](./ep-curve.md) — the chance of a loss above each amount, read as a return period
- [`line`](./line.md) — one quantity over time

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/histogram>
