# slope

> Two labeled columns joined by one line per entity, so a change in ranking reads as a crossing.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Lines, endpoint dots, entity names, both values, the leader lines and the two column headers are one `<svg>`. A slopegraph is a geometric claim — a change in ranking IS a crossing — so every element has to sit in one coordinate system rather than be assembled from boxes that happen to line up, and the de-collision pass that keeps two close names apart needs every label's box in those same units.

**Tags** `ranking` · `transformation` · `contrast` · `board-deck`

Use when the claim is that the ORDER changed between two points — market share before and after, unit cost at two dates, satisfaction across a program, headcount either side of a reorg. Each entity is one line from its first value to its second; a swap in rank draws itself as an X. The `dumbbell` variant redraws the same data as one row per entity when the question is how BIG each gap is rather than who overtook whom.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the change, not the chart ('Two suppliers swapped places on unit cost', not 'Slope chart'). |
| `entities` | `ul > li` | yes | One li per entity, and the entity's own name is the lead text. It carries NO value of its own — the values live in the nested sublist, so a slope is always authored two levels deep. |
| `points` | `li > ul > li` | yes | Two nested items per entity: lead text = the point's name, trailing inline-code = its value — `2024 \`31%\``. The point NAMES become the two column headers, so every entity must name its points the same way; name them differently and the chart falls back to reading them positionally. Commas, currency and magnitude suffixes are tolerated (`$1.2M` is 1 200 000). A third point renders as a third column, but past two, `line` is the better component. |
| `emphasis` | `li > code` | no | An optional status pill on the ENTITY's own lead — `- Northwind \`fail\`` — from the chart family's status vocabulary (`on-track` `done` `live` `at-risk` `warn` `blocked` `fail` `pilot` `decision` `deferred`). Mark one or two and every unmarked line recedes, so the author names the story rather than the chart guessing it. This is the emphasis register to use whenever UP IS BAD. |
| `detail` | `li > ul > li` | no | A nested item with NO numeric pill is per-mark detail, not a data point. It drives the Present-mode reveal popover and folds into the slide's speaker note (`Atlas 12 to 19: Won the Rhodes contract`); the printed chart is byte-identical with or without it. |

### Variant decision rule

- **default (no modifier).** The question is WHO OVERTOOK WHOM. Rank is the vertical position, so a swap is a visible crossing. Best at two to six entities.
- **`dumbbell`.** The question is HOW BIG each gap is. Gap becomes a length on one shared axis, which is the most precisely comparable encoding there is — and rows stay readable past six entities where crossings turn to spaghetti.
- **`signal`.** Rising is unambiguously GOOD for this metric (revenue, adoption, satisfaction). Never on a metric where up is bad — cost, churn, cycle time, defects — where a status pill on the entity says it honestly instead.

### Common mistakes

- **Putting the value on the entity's own line — `- Atlas \`12\`` — the way `funnel` and `bar` are authored.** A slope needs TWO values per entity, so they go in a nested sublist and the entity line carries only the name. A flat list has nothing to draw and the chart passes the list through untouched. A pill on the entity line is read as a status marker, not a value.
- **Naming the two points differently under different entities — `FY24`/`FY26` under one and `2024`/`2026` under the next.** The point names ARE the column headers, so they must agree. Where they do not, the chart falls back to reading the points positionally and takes the headers from the first entity — which draws the right picture but labels it with one author's vocabulary.
- **Expecting the printed values to appear exactly as authored.** Endpoint values are formatted so the WHOLE chart speaks one magnitude: a slope whose pills are `$800k` and `$3.4M` prints `$0.8M` and `$3.4M`, because two magnitudes on one chart is a comparison the reader has to do in their head. For the ordinary case — `31%`, `12`, `15.4` — the printed value is identical to the pill. The unit itself is only adopted when EVERY value agrees on it, so mixing `31%` with a bare `15.4` drops the `%` from both.
- **Assuming a de-collided name still sits exactly beside its dot.** Where two entities are within a point or two of each other their names are pushed apart to stay legible, and a hairline leader is drawn from each moved name back to its own dot. The order is preserved, so the names still read top-to-bottom in value order.

### Data shape

- Two values per entity, in a nested sublist, with the point names identical across every entity — those names become the two column headers.
- One metric across all entities: they share a single vertical scale, so mixing units makes a meaningless crossing.
- The scale is the data's own range and is deliberately NOT zero-based, because a zero baseline flattens a 60-to-75 slope to nothing. Vertical distance therefore reads as CHANGE, never as proportion — if the size of a gap relative to the whole is the claim, put it in the heading.
- A value that does not parse as a number is treated as detail, not as zero: the entity keeps its other point and renders as a lone dot in the column it belongs to, rather than sliding its remaining value into the wrong column.
- Magnitude suffixes are scale, not decoration — `$1.2M` positions at 1 200 000 and `12%` at 12 — so a series may legitimately mix `800k` and `1.2M`.
- An entity left FLAT (`- Atlas `12``) among nested ones has no second point and no column to sit in, so it is not drawn. Every entity needs the same two nested points.
- Six entities is the sweet spot and ten is the ceiling — past that the endpoint names de-collide into a column and the crossings stop being legible. This is a guidance number, not a split axis: like every chart in the family a slope is a GRAPHIC, so it never paginates. An overflowing slope rings the overflow warning and wants fewer entities, not a second slide.

## When to use

- **The order changed, and that is the point.** A slopegraph earns its shape when a reader should walk away knowing WHO OVERTOOK WHOM. Rank is the vertical position and a swap draws itself as a crossing, which no other chart in the family does. If nothing crosses and no gap is surprising, the numbers belong in `stats` or a sentence.
- **Exactly two points in time.** Two columns is the designed case. Three renders — a third column with its values placed inside the plot — but at that point the chart is a trend, and `line` reads it better with an axis, a grid and room for more points.
- **Two to six entities on the slopegraph, up to ten on the dumbbell.** Every entity is named at both endpoints, so the slopegraph is limited by label space rather than by palette: past six the crossings start to read as spaghetti. Switch to `dumbbell` — flat rows, no crossings, one shared axis — and ten fit comfortably. Below two, there is no ranking to change: a single line between two numbers is a delta, and `big-number` or a two-tile `stats` says it in less space.
- **Name the line you are talking about.** Put a status pill on the entity — `- Northwind \`fail\`` — and every other line recedes to a quiet gray while keeping its name and both values. This is the strongest register on the slide and the only one that stays honest when up is bad news.

## When NOT to use

- **A two-point line chart.** A two-point `line` chart draws the same two segments, then buries the crossing under a two-tick category axis, a grid and a legend. Three or more points is `line`'s job, not this one's.
- **Values that are not on one scale.** Every entity shares one vertical scale, so a revenue line crossing a headcount line means nothing. One metric per slope; if the metrics differ, use `stats` or one slope each.
- **`signal` on a metric where up is bad.** Rising unit cost painted green says the opposite of the truth. On cost, churn, cycle time or defects, mark the lines that matter with a status pill and leave the rest neutral.
- **Reading a gap against zero.** The scale is the data's own range, not zero-based — a zero baseline flattens a 60-to-75 slope to nothing. Vertical distance shows change, never proportion.

## Authoring

```markdown
<!-- _class: slope -->

## Two of them swapped places.

- First entity
  - Before `12`
  - After `19`
- Second entity
  - Before `18`
  - After `14`
```

## Variants (component-specific)

### `dumbbell` — Dumbbell

The same before/after model as one row per entity: two dots joined by a bar on a shared value axis, with the first point hollow and the last solid.

```markdown
<!-- _class: slope dumbbell -->

## Every team came in over plan except two.

- Platform
  - Plan `48`
  - Actual `55`
- Payments
  - Plan `52`
  - Actual `44`
- Identity
  - Plan `39`
  - Actual `47`
- Data
  - Plan `61`
  - Actual `59`
- Growth
  - Plan `47`
  - Actual `53`
```

### `signal` — Signal

Colors each line by direction — rising reads pass, falling reads fail. Opt-in, because the chart cannot know whether up is good news.

```markdown
<!-- _class: slope signal -->

## Adoption rose everywhere but the two legacy regions.

- APAC
  - 2024 `41%`
  - 2026 `58%`
- North America
  - 2024 `62%`
  - 2026 `71%`
- EMEA North
  - 2024 `55%`
  - 2026 `49%`
- LATAM
  - 2024 `28%`
  - 2026 `44%`
- EMEA South
  - 2024 `47%`
  - 2026 `39%`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`line`](../../chart/line/line.docs.md) — three or more points in time — a trend rather than a before/after
- [`bar`](../../chart/bar/bar.docs.md) — one point in time, comparing magnitudes across categories
- [`stats`](../../evidence/stats/stats.docs.md) — a row of headline figures with no ranking relationship between them
- [`big-number`](../../statement/big-number/big-number.docs.md) — one entity's change is the whole story
- [`piechart`](../../chart/piechart/piechart.docs.md) — the claim is share of a whole at one moment, not movement between two
- [`progress`](../../chart/progress/progress.docs.md) — attainment against a target per metric, with no before state

## Demo deck

See [slope.gallery.light.pdf](./slope.gallery.light.pdf) for rendered examples of every variant.
