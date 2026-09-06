# waterfall

> A bridge from one total to another through signed contributions, each bar starting where the last one ended.

**Function** progression · **Form** canvas · **Substance** series

**Drawn with** `svg` — The bars, the connectors that carry the running total between them, the value axis and every printed delta are one `<svg>`. A waterfall is an arithmetic claim before it is a picture — each bar starts exactly where the previous one ended — so the whole walk has to be solved in one coordinate system rather than assembled from boxes that happen to line up.

**Tags** `board-deck` · `metric` · `transformation`

Use for a variance walk — budget to actual, an EBITDA bridge, price/volume/mix, a headcount reconciliation. Increases and decreases take the semantic pass/fail hues and float; totals anchor to zero in a neutral third register; a dashed connector carries the running total across each gap so the geometry does the arithmetic.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the movement, not the chart ('We ended the year 2.2M below plan'). |
| `steps` | `ul > li` | yes | One li per bar, in walk order. Lead text = label, trailing inline-code = the value. THE SIGN IS THE SYNTAX: a value written with an explicit `+` or `-` is a signed step and floats from the running total; a value written bare is a level and anchors to zero. The first and last items are levels whatever their sign, so a walk that closes in the red still anchors. A magnitude suffix scales (`1.4M` is 1 400 000) and the authored currency or unit is carried onto the axis. |
| `marker` | `li > code:last-child` | no | An optional SECOND inline-code pill that overrides the sign rule for one bar — `total` (also `subtotal`, `sum`, `level`) anchors it to zero, `step` (also `delta`, `change`) floats it. Needed only for the two shapes the sign cannot express: a walk that opens or closes on a step, and a mid-walk subtotal the author wants stated as a level. Follows the family's two-pill convention (see `progress`). |
| `detail` | `li > ul` | no | Optional nested sublist under a step. Drives two surfaces from one source, via the shared chart-family mark-detail substrate: the Present/Practice reveal popover on the bar, and the slide's speaker note in the static PDF. It renders NOWHERE on the chart face — a walk with detail bullets is pixel-identical to one without. |

### Common mistakes

- **Writing a driver's value bare — `Price \`1.4M\`` — when you meant a rise of 1.4M.** Sign it: `Price \`+1.4M\``. A bare value is a LEVEL and renders as a zero-anchored neutral bar, which is loud and obvious rather than a silent misread — but it is still not what you meant.
- **Expecting the default value axis to start somewhere other than zero so the small drivers read bigger.** It does not, and that is deliberate: the anchor bars are magnitudes, and a raised baseline would misstate them by whatever it was raised to. A step too small to see is floored to a visible sliver and always prints its exact figure. When the drivers genuinely ARE the slide, ask for it explicitly with `waterfall zoom`, which re-bases the axis on the walk and draws a torn edge across every anchor it clips — so the chart says out loud that it is not zero-based, instead of quietly pretending.
- **Assuming the `detail` sublist appears somewhere on the printed chart.** It renders nowhere on the chart face — it drives the on-screen reveal popover and folds into the PDF's speaker note. A walk with detail bullets is pixel-identical to one without.

### Data shape

- Values are signed by the author, not inferred: `+1.4M` rises, `-0.8M` falls, `1.4M` is a level. A pasted U+2212 minus sign is accepted and normalized, so a figure copied out of a spreadsheet or a PDF does not silently invert.
- The magnitude suffix is scale, not decoration — `1.4M` is 1 400 000 and `800k` is 800 000, so a walk may mix the two on one axis. `%` is not a magnitude: `12%` is 12.
- An affix every value agrees on is carried onto the value axis, so a walk authored in `$` gets an axis reading `$0M · $5M · $10M`. Only the affix is read off the sign-stripped text; mixing `$4M` with `12%` in one walk yields no affix, which is the honest read of an axis that cannot describe itself.
- The signed steps should sum from the opening level to the closing level. They are not forced to: each bar is drawn at the figure the author gave it, and a walk that does not reconcile shows the gap where the last connector meets the closing bar rather than silently absorbing it.

## When to use

- **The story is how a number MOVED.** A waterfall earns its shape when the audience already knows the opening and closing figures and needs to see which contributions got you from one to the other. Budget to actual, an EBITDA walk, price/volume/mix, headcount in to headcount out. If the bars do not sum to anything, you want `bar`.
- **Four to nine bars.** Two anchors plus two to seven drivers. Three bars is a subtraction with extra steps; past nine the category names crowd and the smaller drivers stop being separable — consolidate the tail into one 'Other' step, which is also the more honest read of a long tail nobody will discuss.
- **The drivers reconcile.** The signed steps between the opening and closing levels should sum to the difference between them. That is the promise the geometry makes; when it is broken the connector visibly misses the closing bar's corner, which is the chart telling on your data.

## When NOT to use

- **Independent magnitudes with no running total.** Revenue by region, spend by department, five metrics side by side — nothing accumulates, so the floating geometry is a lie. Use `bar`.
- **Parts of one total, all positive.** A decomposition where every contribution is a positive share of one whole is a stack, not a walk: use `stacked-bar`, or `piechart` if there is only one total. A waterfall's whole apparatus — the sign, the two semantic hues, the connectors — buys you nothing when nothing goes down.
- **A monotonic pipeline that narrows.** Visitors to signups to paid is a subset at every stage, not a set of signed contributions. Use `funnel`, whose taper IS the conversion rate.
- **Drivers that are 1% of the anchors.** A walk from 12.0M to 11.9M via steps of 20k gives you two full-height anchors and a row of hairlines. The chart is not wrong, but the picture says 'nothing happened' — which may be the finding, in which case say it in a `big-number`, or drop the anchors and plot the drivers alone as a diverging `bar`.

## Authoring

```markdown
<!-- _class: waterfall -->

## How the number moved.

- Opening `100`
- First driver `+18`
- Second driver `-7`
- Third driver `-11`
- Closing `100`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       Price paid for volume lost.       │
│                                         │
│                      +1.4               │
│          [####]  [##] .. -0.8           │
│      [####]   :   [##]  :  [####]       │
│      [####]   :    :    :  [####]       │
│      ----------------------------       │
│       Plan  Price Volume   Actual       │
│      12.0M                   9.8M       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `zoom`

Re-bases the axis on the walk itself and tears the anchors it clips. For a compressed bridge — a 12.0M to 9.8M walk moved by steps of a few hundred thousand — where the zero-based default spends most of the plot on the two anchors and renders every driver as a hairline. Opt-in, because a silently re-based axis is the truncated-axis lie; the tear is what makes it honest.

```markdown
<!-- _class: waterfall zoom -->

`FY26 · cash`

## The drivers are the story, so the anchors are cut.

- Opening cash `12.0M`
- Price `+0.3M`
- Volume `-0.4M`
- Mix `-0.2M`
- Cost base `-1.9M`
- Closing cash `9.8M`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`bar`](../../chart/bar/bar.docs.md) — the categories are independent magnitudes with no running total, or you want the drivers alone without the anchors
- [`stacked-bar`](../../chart/stacked-bar/stacked-bar.docs.md) — the contributions are all positive parts of one total rather than signed changes to it
- [`funnel`](../../chart/funnel/funnel.docs.md) — each stage is a subset of the one before and the drop-off rate is the story
- [`big-number`](../../statement/big-number/big-number.docs.md) — the net movement is the whole point and the drivers are not worth a slide
- [`line`](../../chart/line/line.docs.md) — the total moved over time and you want the shape of the path, not the attribution

## Demo deck

See [waterfall.gallery.light.pdf](./waterfall.gallery.light.pdf) for rendered examples of every variant.
