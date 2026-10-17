# tower

> A reinsurance program as stacked layers, each written as its limit in excess of its attachment and split across the reinsurers who took a share of it.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Layers, shares, figures and the key are one `<svg>`. Every layer is the same height, not drawn to scale: its size is printed beside it in the market's notation (`$40M xs $50M`) and each boundary carries its figure on the right edge, so a $40M bottom layer stays as readable as a $200M top one.

**Tags** `risk` · `ownership` · `proportion` · `board-deck`

Use for a reinsurance or insurance tower — a catastrophe program, a casualty excess tower, a D&O program. The retention sits at the bottom, each layer above it is labeled in the market's notation (`$40M xs $50M`), and each layer is split into its reinsurers' shares, one color per reinsurer across every layer, with any unplaced share shown as `Open`.

## Agent contract

**By venue** no count budget. A chart scales its marks to the box instead of clipping, so no count marks where it stops fitting.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — say what the structure means for the client ('A $50M retention saves $3.7M'), not 'Program structure'. |
| `layers` | `ul > li` | yes | One li per layer: the layer name, then a trailing inline-code size in the market's notation — `Layer 2 \`$70M xs $90M\`` (limit, then `xs`, `x/s` or `excess of`, then attachment). A size with no `xs` is the retention, the band from zero to that figure. Any order: the chart sorts by attachment, lowest at the bottom. |
| `shares` | `li > ul > li` | no | Optional nested bullets under a layer, one per reinsurer: `Acme Re \`30%\``. Each reinsurer keeps one color across every layer. Shares that add up to less than 100% leave the rest as an `Open` segment; a layer with no shares is drawn plain. |

### Common mistakes

- **Writing the layer as attachment then limit (`$50M xs $40M` for a $40M layer sitting at $50M).** The market's order is LIMIT xs ATTACHMENT: `$40M xs $50M` is $40M of cover above $50M. The chart reads it that way, so the reversed form draws the wrong boundaries.

### Data shape

- A layer's size reads like every chart number (lib/core/chart-values.js), on both sides of `xs`: `$40M`, `USD 40mn`, `EUR 40 Mio.` and `40,000,000` all mean the same.
- Shares are percentages of the layer. Under 100% leaves an `Open` segment; over 100% is drawn scaled to the layer and the description says it is over-placed.

## When to use

- **The structure is the decision.** A tower earns its slide when the conversation is about the program's shape — where the retention sits, how the layers stack, which reinsurers carry which part. For the cost of each layer, use `stacked-bar` or `bar`; for how losses would hit it, use `waterfall`.
- **Two to six layers.** Every layer is the same height, so the bands thin as layers are added. Past six, merge the thin top layers or split the program across two slides.
- **Up to six reinsurers.** Each reinsurer keeps one color across every layer. A seventh and beyond fold into one `Others` color, summed per layer, so name the ones the client will ask about.

## When NOT to use

- **Reading the height as the size.** The layers are drawn at equal height on purpose, so a $40M layer and a $200M layer look the same size. When the audience needs to SEE the size difference, show the limits as a `bar` chart instead.
- **Shares that are dollars.** A share is a percentage of its layer. Write the reinsurer's line as `30%`, not `$12M`: a dollar figure reads as 12 million percent.

## Authoring

```markdown
<!-- _class: tower -->

## Who carries each layer of the program.

- Layer 2 `$100M xs $50M`
  - Reinsurer A `60%`
  - Reinsurer B `40%`
- Layer 1 `$40M xs $10M`
  - Reinsurer A `50%`
  - Reinsurer C `50%`
- Retention `$10M`
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

- [`stacked-bar`](../../chart/stacked-bar/stacked-bar.docs.md) — the premium or cost of each layer, compared on a scale
- [`waterfall`](../../chart/waterfall/waterfall.docs.md) — how a loss or a result walks from one total to another
- [`table`](../../comparison/table/table.docs.md) — the full placement slip, with every line and every term

## Demo deck

See [tower.gallery.light.pdf](./tower.gallery.light.pdf) for rendered examples of every variant.
