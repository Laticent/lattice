# stats

> Row of 3–5 stat tiles, each with a big number and a label.

**Function** evidence · **Form** stack · **Substance** structure

**Tags** `dashboard` · `metric` · `percentage`

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, kpi / split across slides.

**Density** aim ~8 words per item; past ~14 it reads as a wall of text — a metric label, not a sentence.

Use for at-a-glance metric rows — quarterly results, headline KPIs. Each tile reads as Big Number + caption.

## When to use

- **Three to five headline metrics.** Quarterly results, pilot outcomes, year-end summary — anywhere a small set of independent numbers tells the story together. Each tile reads as a `big-number` in miniature.
- **Numbers are the headline.** Lead with the number, follow with a one-line caption. The tile is for the metric and a label, not for explanation; if the caption wants a sentence, use `kpi` or `split-panel metric` instead.
- **Independent metrics, not parts of a whole.** Stats rows are for headline KPIs that don't sum to anything — close rate, recall rate, dollars saved, days cut. For part-to-whole breakdowns reach for `piechart`.

## When NOT to use

- **Six or more tiles.** Past five tiles the row compresses and the numbers shrink below boardroom legibility. Split into two rows or move to `kpi` where the dashboard grid gives each metric its own card.
- **Tiles with no number.** If a tile is mostly prose with a small number, the visual hierarchy inverts and the row reads as a list. Stats is for **bold-number + caption** — anything more belongs in `cards-grid`.
- **Status framing without pills.** If each metric needs a target, a trend, and a status indicator, you're authoring a dashboard, not a stats row. Move to `kpi`, which carries that vocabulary.

## Authoring

```markdown
<!-- _class: stats -->

`Impact · Pilot Results`

## Six months of results across four product teams.

`Measured against pre-framework baseline, same teams, same market conditions.`

1. 73%
   - faster close
2. 4.2×
   - signal recall
3. $1.2M
   - prevented losses
4. −18d
   - avg cycle time
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the metrics. |
| `subtitle` | `p > code` | no | Optional inline-code paragraph (eyebrow before the h2, or caption after it). Styled by the generic `> p`/`> em` rule, not a dedicated `p > code` rule. |
| `tiles` | `ol > li` | yes | One li per stat tile, authored as an ordered list (`1.`). The lead is the number (it renders in display type automatically — no `**…**` needed); the caption is a nested bullet beneath it:     1. 73%        - faster close A bare number with no nested caption won't render as the big number. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│            Stats row heading            │
│                                         │
│    42×          87%          3.2k       │
│   growth      uptake        users       │
│                                         │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`big-number`](../../statement/big-number/big-number.docs.md) — one number is enough to carry the slide
- [`kpi`](../../evidence/kpi/kpi.docs.md) — metrics need targets, trends, and status pills
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — one focal KPI with a paragraph of supporting prose
- [`piechart`](../../chart/piechart/piechart.docs.md) — the numbers are parts of a whole, not independent
- [`progress`](../../chart/progress/progress.docs.md) — the metrics are completion percentages across workstreams

## Demo deck

See [stats.gallery.light.pdf](./stats.gallery.light.pdf) for rendered examples of every variant.
