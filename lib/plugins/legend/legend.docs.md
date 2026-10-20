# legend

One model for every key, value label and callout a chart draws. A **legend** is a group of
**labels**; a label is text with an optional **mark** (a swatch or a stroke) and an optional
**plate** (a pill's shape). A bare label, with no mark and no plate, is the default.

```markdown
<!-- _class: heatmap -->

## Retention decays fastest in month two.

| Cohort   | M0  | M1 | M2 | M3 |
| -------- | --: | -: | -: | -: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |

`@legend{{Onboarding change, tag, c4, row="Feb 2026", col=M2, detail="Shipped mid-month"}}`
```

Design and migration plan: `engineering/decisions/2026-10-19-universal-legend.md`. The notation is
Segno's (`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

The plugin is **on by default** and an author can turn it off:

| Where | Write | Effect |
|---|---|---|
| The whole deck | `legend: off` in the front matter | Callouts are hidden on every slide |
| One slide | `legend-off` in the slide's class | Callouts are hidden on that slide |
| One slide, in a deck that is off | `legend-on` in the slide's class | That slide shows its callouts again |
| A host | `--disable-plugin legend` | The same as `legend: off`, for every deck it renders |

A hidden callout is not drawn, not described and not read aloud, so the slide reads as if the line
were not there. Its `detail` still joins the cell's hover card and the speaker note, and `lint:deck`
notes it (rule `legend-off`, info). The register is in
[`base.registers.docs.md`](../../base/base.registers.docs.md) § `legend:`.

## The author's contract

Write a legend as a paragraph holding one code span, `@legend{…}`. Inside, each label is a record
in braces; several go in a list.

| You write | You get |
|---|---|
| `` `@legend{{Peak, row="Jan 2026", col=M0}}` `` | A label anchored to that cell, tied to it by a numbered circle in its number's color |
| `` `@legend{{Drop-off, tag, c4, row=Feb, col=M2}}` `` | Its number on a tag in color 4 |
| `` `@legend{{Drop-off, c4, for=14}}` `` | Its number on a circle in color 4, anchored to mark 14 (the short form) |
| `` `@legend{{Drop-off, row=Feb, col=M2, detail="Shipped mid-month"}}` `` | The detail joins that cell's card and the speaker note |
| `` `@legend{[{Poor, c1, mark=swatch}, {Good, c3, mark=swatch}], key}` `` | A key: a swatch and a name per label |

**A label** is the pill's record plus its named words:

- the **text** comes first, and is the only part you must write;
- **plate** shape: `pill`, `chip`, `tag`, `tag-bordered`, `circle`, `chevron-right`,
  `chevron-left`, `diamond` (the pill's words; no shape word means no plate);
- **color**: `c1` to `c12`; **size**: `sm`, `md`, `lg`;
- `row=` and `col=` name the cell the label is anchored to, by the labels the chart prints; `for=`
  is the short form, the mark's index (`for=14`) or `Row/Column` (`for=Feb/M2`);
- `detail="…"` is the longer line a reader gets on hover, in the speaker note and in the PDF;
- `mark=` draws a mark beside the text: `swatch`, `outline`, `line`, `heavy`, `dashed`, `dotted`.

Quote any text holding a comma, `=`, `|`, a bracket or a brace: `{"Peak, then flat", row="Jan 2026", col=M0}`.

**The layout** is `anchored` (labels at the marks they name), `key` (labels apart from the figure)
or `along-path` (a label riding a line; not drawn yet). Name it as a bare word after the labels
(`@legend{[…], key}`) or leave it out: a legend whose labels name a mark (`row=`/`col=` or `for=`) is anchored,
any other is a key.

**A keyed pair** — `{1, Cold}`, a key followed by its name — is the label-set form the charts already
read, and it still reads as one: when a record does not read as a label, it is read as a pair. One
shape reads the wrong way without an error: a number followed by a style word, `{1, lg}`, is the
label "1" in size lg. `lint:deck` warns on it; quote the word to keep the pair, `{1, "lg"}`.

## Where it draws today (Wave 0)

| Component | Reads | How a label names its mark |
|---|---|---|
| `heatmap` | `anchored` | A cell, by its row and column labels as the chart prints them, `row="Feb 2026", col=M2` (case and extra spaces do not matter); or the short form `for=`, its index counted row by row from 0 (`for=14`) or `Row/Column` (`for=Feb 2026/M2`) |

On a heatmap an anchored label sits in a lane to the right of the grid, level with its cell, and a
**number** ties the two: the cell is ringed and carries a numbered marker in its top-left corner, and
the same marker leads the label's words in the lane. No line crosses the grid, so no value is
covered and two labels on one row stay apart. The label's pill words shape and color its marker
while the words stay in plain ink. With none, the marker is a `circle` in the color slot of its
number (1 is `c1`, 2 is `c2`), so the markers differ by color as well as by digit. Every marker sits
on a ring of the canvas color so it reads on any cell. The marker on a cell is sized from the cell,
so a dense grid gets small markers and a roomy one larger, within a legible floor; the one in the
lane is sized from the words beside it, as a pill is from its text. The marker on a cell goes in the first spot that covers
nothing: inside one of the cell's corners, else on a corner, at full size and then at its smallest.
It never covers a printed value, a row or column name, or another marker. On a grid whose values
fill their cells there may be no such spot; then the cell keeps its ring alone, and its label still
sits level with its row. That happens from about 8 rows of four-digit values; a marker small enough
to fit there would print below the type floor (design note § 18). Numbers run row by row, then left to right,
and the lane lists the labels in that order; one the lane cannot hold is dropped rather than drawn
over another, with its marker, and the chart's description lists it as not drawn. A heatmap draws only
`anchored` legends today: a `key` legend on one is not drawn, and is reported the same way.

A row or column whose name holds `/` cannot be named by the `for=Row/Column` short form, because the
slash separates the two; `row=` and `col=` name it whatever it holds. Two rows with the same name
resolve to the first.

On every other slide a `@legend{…}` span still renders as code, and `lint:deck` says that no component
on the slide reads it. The other charts' keys move onto this plugin one at a time (the design note's
§ 10).

## Narration, the PDF and screen readers

- Narration reads each anchored label after the rows: "Callout at Feb 2026, M2: Onboarding change."
  A `detail` is read after it.
- The `detail` joins the named mark's card (hover and tap) and the slide's speaker note, so the PDF
  carries it.
- An SVG label sits inside the chart's hidden marks, so a screen reader gets it from the chart's
  description, with its detail.
- Hover or tap a label to open its mark's card: the label carries `data-mark-for`, the hook pie and
  map key rows already use.

## Diagnostics

`lint:deck` rule `legend-span` reports, as warnings:

- a span that opens `@legend{` and does not read (it stays code on the slide);
- a label with no target in an anchored legend, a label with only one of `row=` and `col=`, and a
  label that names its cell twice (`row=`/`col=` and `for=`);
- on a heatmap, a target that names no cell of the slide's table (the message lists the rows and
  columns it can use), and a `key` legend, which it does not draw yet;
- the `{1, lg}` shape above;
- a legend on a slide where no component reads one yet.

It also notes, as info, a callout the author switched off (rule `legend-off`).

Whatever a heatmap does not draw — a target that names no cell, a `key` legend, a label the lane
cannot hold — its description lists under "Not drawn".

## For components

The model and reader are `lib/core/legend.js`; the HTML key is `lib/core/legend-key.js` (a
component's own classes) and `lib/core/legend-html.js` (the legend's own); the mark slot is
`lib/core/legend-mark.js`; the SVG emitter is `lib/components/chart/_chart-family/legend-svg.js`
(beside the placement pass it uses, since `lib/core` may not import a component). A component lifts
the slide's legend paragraphs with `liftLegends` (`lib/core/lift-label-set.js`), resolves each
target (`gridTarget` for a grid) to its own mark index, and hands the entries to an emitter. The emitters write classes and a
`data-c` color slot and never a color; this plugin's stylesheet paints them.
