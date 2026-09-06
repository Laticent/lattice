# scatter

> An XY plot with real units on both axes — one dot per entity, showing how two measures relate.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Grid, both tick ladders, the two axis captions, every dot, every point name and the bubble size key are one `<svg>`. The label engine tries eight positions around each dot against the marks, the plot bounds and the labels already placed, and draws a leader when a name still cannot sit against its dot — none of that works unless all of it shares one coordinate system.

**Tags** `metric` · `tradeoff` · `positioning` · `board-deck`

Use when the argument is that two measures move together (or against each other) and both numbers matter: cost against value, price against adoption, risk against return. Both axes carry a nice-number tick ladder in the author's own units, so a reader sees the shape of the relationship and can still take a value off the chart. For a unitless 2x2 scoring, use `quadrant`.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the relationship the dots show, not the chart type. |
| `axes` | `p > code + code` | yes | The axis captions, as TWO inline-code spans in ONE paragraph — x first, then y; a THIRD names the bubble size measure. The paragraph is consumed and painted on the axes, so it never prints twice. Two codes is the discriminator: a one-code paragraph is the ordinary chart eyebrow and is left alone, so a slide can carry both. Same idiom as `matrix-grid`. |
| `points` | `ul > li` | yes | One li per entity: the name, then TWO trailing value pills — ``Atlas `$420k` `18%` ``. The first pill is x, the second y; a third sizes the dot under `bubble`. Magnitude suffixes are scale (`1.2M` is 1 200 000) and the affix every value agrees on is carried onto that axis, so a series authored in `$` gets a `$` axis. |
| `detail` | `li > ul` | no | Optional nested sublist under a point. Drives two surfaces from one source (shared with pie/funnel/quadrant via the chart-family mark-detail substrate): the Present-mode reveal popover keyed on the dot's `data-mark`, and the PDF speaker note. Renders nowhere on the chart face — a scatter with detail bullets is pixel-identical to one without. |

### Variant decision rule

- **default (no modifier).** Two measures per entity — the plain XY plot.
- **`bubble`.** A third numeric measure (seats, headcount, revenue) should scale each dot's AREA. Keep it to about ten entities, and name the measure in the third inline-code span so the size key has a caption.
- **`trend`.** The claim is explicitly that the two measures move together, there are at least five points, and the audience will read the line as a summary rather than a forecast.

### Common mistakes

- **Splitting a point's two numbers into one comma-separated pill, `` `4.2, 8.1` ``, the way `quadrant` takes them.** A scatter takes TWO separate pills — `` `4.2` `8.1` `` — because each axis carries its own unit and its own affix (`$420k` on x, `18%` on y), which one shared pill cannot express. An item without two numeric pills is skipped rather than plotted, so the point disappears from the chart and from its description.
- **Expecting the axes to start at zero.** They do not, and that is deliberate. The domain is the data's own range plus about 8% of air. Two measures with narrow ranges — margin 38-44%, NPS 51-58 — forced to include zero collapse into one corner and the relationship disappears. A non-negative series still gets its air below zero — a bubble sitting at zero has to fit inside the plot — but its axis never prints a negative tick.
- **Writing the axis names as a normal one-pill eyebrow, `` `Cost vs value` ``.** That is the chart eyebrow and it stays in the masthead; the plot then has unlabeled axes, which is the one thing a scatter cannot survive. Write the two captions as two inline-code spans in one paragraph.
- **Assuming a name that does not appear on the plot was lost.** A name with nowhere left to sit is dropped rather than painted through its neighbor — two overprinted names are two names lost, not one. The name still rides `data-label` on its dot, the mark-detail popover, and the `<desc>` a screen reader reads. Fewer points, or shorter names, brings it back.
- **Encoding a third measure in the dot's RADIUS.** `bubble` scales AREA, never radius, because radius-encoding overstates by the square: double the number and a radius-scaled dot looks four times the quantity. The area runs linearly from a minimum visible size, so the smallest value is still a circle you can see, and a point with no third pill is drawn at that floor and flagged rather than given a magnitude nobody typed. It also needs a size key, which is why the third inline-code span on the axis line names the measure. Past about ten bubbles the areas stop being comparable at all — split the slide.

### Data shape

- A point is a name plus TWO trailing inline-code pills — `` Atlas `$420k` `18%` `` — x then y, in that order. A third pill is the bubble magnitude and is ignored without the `bubble` class. Fewer than two numeric pills and the item is skipped, not plotted at zero.
- Magnitude suffixes SCALE: `1.2M` is 1 200 000 and `800k` is 800 000, so the two can share one axis. `%` is not a magnitude, so `12%` is 12. A minus written outside the currency symbol (`-$400k`) is understood as negative.
- The affix is per axis and is adopted only when EVERY value on that axis agrees on it: six values in `$` give a `$` axis, and a mixed series (`$4M`, `12%`) gets a bare one, which is the honest read of an axis that cannot describe itself.
- Both axes are linear. There is no log scale, so a series spanning several orders of magnitude will pile up at one end — take the log yourself before authoring and say so in the axis caption.

## When to use

- **Two numeric measures, and the relationship is the point.** Cost against value, price against adoption, risk against return, effort against impact — with real numbers on both. The slide's claim is that the two move together, or that one entity sits off the pattern. If only one measure carries the argument you have a ranking, not a scatter: use `progress`.
- **The units matter and the reader may want to read a value off the chart.** This is the line between `scatter` and `quadrant`. A scatter prints a tick ladder and a gridline on BOTH axes, in the author's own affix — `$0 · $100k · $200k`, `20% · 40% · 60%` — so 'Atlas costs about $420k' is readable from the picture. A quadrant prints only the two extremes on a unitless canvas; you can say which box a thing is in and nothing more.
- **Five to ten entities, each with a short name.** Below four there is no pattern to see — state it in prose or a `stats` row. Past about ten the names start needing leaders and eventually get dropped rather than overprinted. Every dot carries its own name, so keep names to a word or two: a long one wraps to three lines and crowds its neighbors out of position.

## When NOT to use

- **A unitless 2x2 score.** If the axes are unitless 1-to-10 judgments and the read is which of four named zones an item lands in, use `quadrant`.
- **A trend line over a handful of points.** `scatter trend` refuses a least-squares line under five points. Even at eight it says 'these move together', not 'this predicts'.
- **Points closer together than the eye can separate.** Four tools within four points are four dots inside one dot's width: the ring keeps the overlap visible, but the names travel.
- **Time on the x axis.** A series measured at successive dates is a line, not a cloud — the reader needs the connection between points. Use `line`.

## Authoring

```markdown
<!-- _class: scatter -->

`X measure` `Y measure`

## Two measures, one relationship.

- First entity `4.2` `62`
- Second entity `2.1` `38`
- Third entity `6.8` `81`
- Fourth entity `3.4` `55`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│   What we pay most for, nobody uses.    │
│                                         │
│       80% |            (o) Ember        │
│              |      (o) Delta           │
│            40% |  (o) Cirrus            │
│          | (o) Borealis  (o) Atlas      │
│       0  +-----------------------       │
│           $0k     $200k    $400k        │
│                   ANNUAL COST           │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `bubble` — bubble

A third measure sizes each dot by area.

```markdown
<!-- _class: scatter bubble -->

`Annual cost` `Teams adopting` `Seats`

## bubble sizes each dot by a third measure.

- Atlas `$420k` `18%` `1200`
- Borealis `$310k` `24%` `640`
- Cardinal `$180k` `52%` `900`
- Dovetail `$95k` `61%` `310`
- Everline `$240k` `31%` `180`
- Fathom `$60k` `74%` `450`
```

### `trend` — trend

A least-squares line through the cloud.

```markdown
<!-- _class: scatter trend -->

`Annual cost` `Teams adopting`

## trend draws the least-squares line through the cloud.

- Atlas `$420k` `18%`
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`
- Juniper `$400k` `20%`
- Keystone `$88k` `66%`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`quadrant`](../../chart/quadrant/quadrant.docs.md) — the axes are unitless scores and the read is which of four named zones
- [`matrix-2x2`](../../comparison/matrix-2x2/matrix-2x2.docs.md) — items are placed by category, not by coordinate
- [`radar`](../../chart/radar/radar.docs.md) — each entity is rated on more than two measures
- [`progress`](../../chart/progress/progress.docs.md) — one measure per entity, compared as lengths
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — the exact numbers matter more than the shape of the relationship

## Demo deck

See [scatter.gallery.light.pdf](./scatter.gallery.light.pdf) for rendered examples of every variant.
