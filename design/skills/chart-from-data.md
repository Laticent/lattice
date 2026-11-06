---
name: chart-from-data
description: "Use when the author has numbers (pasted rows, a CSV, a table) and needs the right chart on a slide: pick the kind from the question, author the data, write the claim."
kind: operate
studio: true
---

# Skill — Put data on a slide as the right chart

> Turn a pile of numbers into one slide whose heading states what the numbers
> prove and whose chart shows exactly that, and nothing else.

**Read this when** an author hands you rows, a CSV, a spreadsheet paste or a table and
asks for "a chart of this". **You'll produce** one slide (sometimes two, or none, when a
`big-number` or `table` serves better) in Lattice Markdown, with the data typed into a
chart kind's list. This skill does NOT build a new chart kind: that is `chart-component.md`.

---

## The 10/10 bar

- **The heading is the claim the data proves**, as a full sentence: *"North America
  still earns more than the other three regions combined."* Never the chart's subject
  (*"Revenue by region"*).
- **The chart kind matches the question.** A bar compares sizes, a line shows movement,
  a stack shows what a total is made of. The wrong kind makes the reader do the math.
- **One message per chart.** If the author wants two points, that is two slides.
- **Every number is the author's number, typed once and checked.** There is no CSV
  import, so every value is a transcription and a transcription error in a board deck
  is expensive. Read each pill back against the source.
- **A table or a single figure wins when it carries the point better.** Precise lookups
  are a table; one number that matters is a `big-number`.
- **Zero lint findings** from `npm run lint:deck`, and the rendered slide looked at.

Mediocre looks like: a pie with nine slices, a line through unordered categories, twelve
monthly bars when the point is the trend, mixed units (`$4.2M` beside `3100000`) and a
heading that names the chart type.

---

## Mental model

A Lattice chart is **a Markdown list with a value pill on each row**. The chart kernel
reads the list and draws one SVG in one coordinate system, in the deck's palette. You
never write colors, axes or sizes. You choose three things:

1. **The question the data answers.** That picks the kind (the table below).
2. **The shape of the list.** Flat (one value per row), nested (series or parts under
   each category), or a table (`heatmap`).
3. **The claim.** It goes in the `## ` heading and decides what order the rows go in.

Charts are the **Evidence** function. A chart scales its marks to its box, so it has no
item-count budget like a card layout does; the readable limits are in each kind's
`.docs.md` (bar: three to eight categories; piechart: three to six slices).

### Pick the kind from the question

| The question | Kind | Data shape |
|---|---|---|
| Which is bigger, and by how much? | `bar` (`bar row` for long names) | flat: `- Name \`value\`` |
| Same categories, two to four series (plan vs actual) | `bar grouped` | nested numeric children |
| Did it move over time? Three or more ordered points | `line` | flat, in axis order |
| Did the order change between two moments? | `slope` | entity, two nested points |
| What is the total made of, across categories? | `stacked-bar` | nested parts under each category |
| What share of one whole? Three to six parts | `piechart` | flat, shares of one total |
| How did we get from A to B? | `waterfall` | signed steps (`+18`, `-7`) between levels |
| Do two measures move together? | `scatter` | axis line, then `{x, y}` per point |
| How is one quantity spread? | `histogram` | `` `0..10` `45%` `` bands |
| Where does it concentrate across two categories? | `heatmap` | a Markdown table |
| Where on the map? | `map` (`map us` for states) | flat, region names |
| Are we on plan against a target? | `bullet` or `progress` | see their docs |
| How much do we lose at each stage? | `funnel` | flat, in stage order |

Other kinds exist for narrower jobs (`radar`, `quadrant`, `risk-matrix`, `tower`,
`ep-curve`, `gantt`, `word-cloud`). `ls lib/plugins/chart-family/kinds/` lists all 28.

---

## Where it lives

- **Chart kinds:** `lib/plugins/chart-family/kinds/<kind>/`. Each has
  `<kind>.docs.md` (slots, data shape, variants, mistakes) and `<kind>.gallery.md`
  (live examples). Read the docs before you author (HARD RULE #6).
- **Choosing:** `dist/docs/components.pick.md`. `grep -i "chart" dist/docs/components.pick.md`
  lists every kind with its purpose and its "see also" neighbors.
- **Non-chart answers:** `big-number` (`lib/components/statement/big-number/`), `stats`
  and `kpi` (`lib/components/evidence/`), `table` (`lib/components/comparison/table/`).
- **Commands:**
  - `npm run new:slide -- bar` prints a kind's skeleton.
  - `npm run lint:deck -- deck.md` catches malformed values and series typos.
  - `npx lattice deck.md deck.pdf` renders; then look at the slide.

---

## Recipe

1. **Ask what the data proves.** Write the heading first, as one sentence. If you
   cannot, the data has no message yet: ask the author which comparison matters.
2. **Name the question type** from the table above and pick the kind. Open its
   `.docs.md` and read "When NOT to use"; check the neighbor it names.
3. **Decide whether a chart is needed at all** (see "When a chart is the wrong answer"
   below). One figure: `big-number`. Exact values the reader will look up: `table`.
4. **Shape the data.** Cut to what supports the claim: three to eight bars, three to
   six slices. Fold a long tail into one "Other" row. Sort when ranking is the story;
   keep natural order (months, stages) when the categories have one. The kernel never
   re-sorts.
5. **Type the list.** Category name as the lead text, value as a trailing inline-code
   pill. Use one unit vocabulary for the whole list (`$4.2M`, `$1.6M`, never
   `$4.2M` beside `1600000`): the axis keeps a currency or `%` only when every value
   agrees on it.
6. **Add context as detail, not ink.** A nested bullet with no numeric pill under a
   category is detail: it opens on hover in Present and folds into the speaker note,
   and the chart face stays identical.
7. **Add an eyebrow** naming the dataset and period (`` `Revenue by region · Q2 2026` ``).
   That is where the chart's subject goes, so the heading can carry the claim.
8. **Lint, render, look.** `npm run lint:deck -- deck.md`, then render and check that
   the chart shows what the heading says. Read every value back against the source.

---

## The contract / skeleton

**Comparison (long names, so `row`):**

```markdown
<!-- _class: bar row -->

`Revenue by region · Q2 2026`

## North America still earns more than the other three regions combined.

- North America `$4.2M`
- Europe, Middle East and Africa `$1.6M`
- Asia Pacific `$1.1M`
- Latin America `$0.6M`
```

**Trend, with one detail note that paints nothing:**

```markdown
<!-- _class: line -->

`On-time delivery · monthly`

## On-time delivery recovered after the April carrier switch.

- Jan `91%`
- Feb `89%`
- Mar `84%`
- Apr `86%`
- May `92%`
- Jun `95%`
  - New carrier contract live from June 1
```

**Part-to-whole across categories:**

```markdown
<!-- _class: stacked-bar -->

`Cost per shipment · by component`

## Fuel is now the largest part of every shipment's cost.

- Q1
  - Fuel `$41`
  - Labor `$38`
  - Tolls `$9`
- Q2
  - Fuel `$52`
  - Labor `$39`
  - Tolls `$9`
```

**Value syntax every Cartesian kind reads:** currency prefix, thousands commas,
magnitude suffix and unit (`$4.2M`, `12,400`, `68%`, `-3.1`). The suffix is scale, so
`800k` and `1.2M` sit correctly on one axis. A pill that is not one number (`--5`,
`(5`, `1,2,3`) draws nothing and lint reports it.

**Other shapes, one line each** (full form in each kind's docs):

- `scatter`: `` `[Annual cost, Teams adopting]` `` paragraph above the heading, then
  ``- Atlas `{4.2, 62}` ``.
- `waterfall`: a bare value is a level, a signed value (`+18`, `-7`) is a step.
- `slope`: each entity carries two nested points named the same way (`2024`, `2026`).
- `histogram`: bands use `..`, never a dash: `` `$1M..$10M` `55%` ``.
- `heatmap`: a Markdown table; the header row names the columns, a blank cell is
  "not measured".

### When a chart is the wrong answer

| The data | Use | Why |
|---|---|---|
| One number that matters | `big-number` | A one-bar chart is a number with decoration. Give it a referent ("up from 6%"). |
| Two numbers | `big-number` or a two-tile `stats` | Two bars, or a two-slice pie, is a ratio with extra steps. |
| Three to six headline figures, unrelated | `stats` or `kpi` | They share no axis, so a chart implies a comparison that is not there. |
| Exact values the reader will look up | `table` | A chart shows shape; a table shows the digits. Its budget is 4/6/8 rows. |
| Several measures per option | `table` | Mixed units cannot share an axis. |

```markdown
<!-- _class: big-number -->

`Peak-week capacity gap`

- 18%
  - short of booked volume in peak week, up from 6% last year
```

---

## What good looks like

- The heading states a finding a skeptic could check against the chart.
- The kind fits the question: a line for "did it move", a bar for "which is bigger".
- Four to six categories, sorted when ranking is the point, with a named "Other".
- One unit vocabulary, so the axis carries the `$` or `%`.
- The eyebrow names the dataset and period; detail lives in nested non-numeric bullets
  (and so in the speaker note), not on the face.
- A `bar row` wherever names run past about fifteen characters.

## What bad looks like

- `## Revenue by region` over a bar chart. Fix: say what the bars prove.
- A `piechart` of independent metrics that do not sum to a whole. Fix: `bar` or `stats`.
- A `line` joining Legal, Finance, Sales and Ops. Unordered categories have no trend.
  Fix: `bar`.
- Twelve monthly bars when the point is the recovery. Fix: `line`.
- A grouped bar where one group spells the series `Actual` and another `Actuals`. The
  chart matches series by text and draws a fifth series. Lint warns.
- Two pies side by side to compare years. Fix: `bar grouped` or `slope`.
- A 2% sliver in a stacked bar. Fix: fold the tail into "Other".

---

## Ship checklist

- [ ] The heading is one complete sentence stating what the data proves.
- [ ] The kind matches the question type; its `.docs.md` "When NOT to use" was read.
- [ ] A `big-number`, `stats` or `table` was considered and rejected for a reason.
- [ ] Every value was read back against the source after typing.
- [ ] One unit vocabulary across the list; no malformed pills.
- [ ] Series names are spelled the same under every category.
- [ ] Category count is inside the kind's readable range; the tail is folded.
- [ ] `npm run lint:deck -- deck.md` reports no errors or warnings.
- [ ] The slide was rendered and looked at, in the deck's theme.

---

## Common mistakes

1. **Naming the chart, not the finding.** `review-core` suggests `chart-no-takeaway`
   on a chart slide whose heading names a topic. Put the conclusion in the `## `.
2. **Mixed units or malformed values.** `chart-value-malformed` names a pill that is
   not one number; mixed affixes silently drop the `$` from the axis.
3. **Inconsistent series names.** `chart-series-name-inconsistent` catches `Actual`
   vs `Actuals` and offers the fix.
4. **Adding `grouped` to a flat list.** The nesting selects grouped, not the class.
5. **Expecting the chart to sort.** It draws in authored order. Sort the list.
6. **A dash in a histogram range.** `histogram-dash-range` drops the row. Use `..`.
7. **Bands that gap or overlap.** `histogram-bands-join` names both.
8. **Treating a map region typo as fine.** `unknown-map-region` names a place the
   basemap cannot resolve and suggests the nearest name.
9. **Using a pie for two values, or for values that do not sum to a whole.** Two
   values are a `big-number`; unrelated measures are `bar` or `stats`.
10. **Inventing a CSV import.** None exists. Type the values, then check them.

---

## Canonical sources

- `lib/plugins/chart-family/kinds/<kind>/<kind>.docs.md` — each kind's slots, data
  shape, variants and "When NOT to use". Start with `bar`, `line`, `stacked-bar`,
  `piechart`, `slope`, `waterfall`, `scatter`, `histogram`, `heatmap`, `map`.
- `lib/plugins/chart-family/chart-family.docs.md` — what the chart-family plugin
  contributes.
- `dist/docs/components.pick.md` — the pick list, with capacity and "see also".
- `lib/components/statement/big-number/big-number.docs.md`,
  `lib/components/evidence/stats/stats.docs.md`,
  `lib/components/comparison/table/table.docs.md` — the non-chart answers.
- `engineering/chart-styling.md` — chart color and finishes, for when a chart
  looks wrong rather than says the wrong thing.
- `design/editorial.md` — headings are complete sentences; claim and deliver.
- `design/skills/chart-component.md` — building a NEW chart kind, not this job.
- `engineering/decisions/2026-10-15-business-deck-gaps.md` §4 — why there is no
  data-file ingest yet.
