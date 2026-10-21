# callout

A **callout** is a note pinned to one mark on a chart: a cell, a bar, a point. The chart draws a
marker on the mark and the note beside the figure, and one shape and one color tie the two. The key,
what each color means, is the legend plugin's (`legend.docs.md`).

```markdown
<!-- _class: heatmap -->

## Retention decays fastest in month two.

| Cohort   | M0  | M1 | M2 | M3 |
| -------- | --: | -: | -: | -: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 31 | 29 |

`@callout{{Onboarding change, tag, c4, row="Feb 2026", col=M2, detail="Shipped mid-month"}}`
```

Design: `engineering/decisions/2026-10-19-universal-legend.md`, and the split into two plugins,
`2026-10-20-callout-placement.md`. The notation is
Segno's (`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

The plugin is **on by default** and an author can turn it off:

| Where | Write | Effect |
|---|---|---|
| The whole deck | `callout: off` in the front matter | Callouts are hidden on every slide |
| One slide | `callout-off` in the slide's class | Callouts are hidden on that slide |
| One slide, in a deck that is off | `callout-on` in the slide's class | That slide shows its callouts again |
| A host | `--disable-plugin callout` | The same as `callout: off`, for every deck it renders |

The switches from before the split, `legend: off`, `legend-off`, `legend-on` and
`--disable-plugin legend`, no longer switch callouts: write the `callout` ones. `lint:deck` flags
`legend:` as an unknown setting.

A hidden callout is not drawn, not described and not read aloud, so the slide reads as if the line
were not there. Its `detail` still joins the cell's hover card and the speaker note, and `lint:deck`
notes it (rule `legend-off`, info). The register is in
[`base.registers.docs.md`](../../base/base.registers.docs.md) § `callout:`.

## The author's contract

Write callouts as a paragraph holding one code span, `@callout{…}`. Inside, each callout is a record
in braces; several go in a list. Before the split callouts were written `@legend{…}`; a `@legend`
span whose labels pin a mark still draws them, and `lint:deck` suggests `@callout`.

| You write | You get |
|---|---|
| `` `@callout{{Peak, row="Jan 2026", col=M0}}` `` | A callout at that cell, tied to it by a numbered circle in its number's color |
| `` `@callout{{Drop-off, tag, c4, row=Feb, col=M2}}` `` | Its number on a square in color 4 |
| `` `@callout{{Drop-off, c4, for=14}}` `` | Its number on a circle in color 4, at mark 14 (the short form) |
| `` `@callout{{Drop-off, row=Feb, col=M2, detail="Shipped mid-month"}}` `` | The detail joins that cell's card and the speaker note |

**A callout** is the pill's record plus its named words:

- the **text** comes first, and is the only part you must write;
- **plate** shape: `pill`, `chip`, `tag`, `tag-bordered`, `circle`, `chevron-right`,
  `chevron-left`, `diamond` (the pill's words; no shape word means no plate);
- **color**: `c1` to `c12`; **size**: `sm`, `md`, `lg`;
- `row=` and `col=` name the cell the label is anchored to, by the labels the chart prints; `for=`
  is the short form, the mark's index (`for=14`) or `Row/Column` (`for=Feb/M2`);
- `detail="…"` is the longer line a reader gets on hover, in the speaker note and in the PDF.

Quote any text holding a comma, `=`, `|`, a bracket or a brace: `{"Peak, then flat", row="Jan 2026", col=M0}`.

A callout is always anchored to the mark it names; a layout word in a `@callout` span is reported
and ignored.

One shape reads the wrong way without an error: a number followed by a style word, `{1, lg}`, is the
callout "1" in size lg. `lint:deck` warns on it; quote the word to keep it as text, `{1, "lg"}`.

## Where it draws today

| Component | Reads | How a label names its mark |
|---|---|---|
| `heatmap` | `anchored` | A cell, by its row and column labels as the chart prints them, `row="Feb 2026", col=M2` (case and extra spaces do not matter); or the short form `for=`, its index counted row by row from 0 (`for=14`) or `Row/Column` (`for=Feb 2026/M2`) |

On a heatmap a callout sits in a lane to the right of the grid, level with its cell, and a
**marker** ties the two: the cell is ringed and carries a marker on its corner, and the same marker
leads the label's words in the lane. A marker is a **shape and a color**: callouts take six shapes in
reading order, one each (circle, square, triangle, diamond, hexagon, star), and a color slot each, so
a reader matches a cell to its label by shape as well as by color, never by color or position alone.
The digit, the callout's number, rides inside the shape when the cell has room for it, and always in
the lane. No line crosses the grid, so no value is covered and two labels on one row stay apart.

The label's pill words choose its marker: `circle`, `tag` (the square) and `diamond` pick that shape
when no earlier callout has it, and a color word (`c4`) picks the color; the words themselves stay in
plain ink. With no words, a callout takes the next free shape and the color slot of its number (1 is
`c1`, 2 is `c2`). Every marker sits on a ring of the canvas color so it reads on any cell.

The marker on a cell is sized from the cell: its height is a share of the cell's shorter side, so a
dense grid gets small markers and a roomy one larger, never larger than the marker in the lane. The
marker in the lane carries a digit, centered on the digit's own height.

**A callout row is styled like a key row**, so the two read as one family beside a chart. The marker
in the lane is the key's swatch size, 1.45 times the label, and its digit is about four-fifths of the
label. The words take the key's typeface (the label face), weight and size; the digit inside a
marker stays in the body face, whose figures center in a shape. Where every word would not set
whole at the key's size, the words step down until they do.

The cell's ring takes its callout's color too, over a thin halo of the canvas color, so the ring, its
marker and the label's marker read as one color on any cell.

Every marker on one chart shares **one size and one place**, so no marker jumps or shrinks against
its neighbors: whole inside its cell's top-left corner, or, where that would cover a value, a badge
up and to the left of that corner, or centered where the gutters cross there. A marker never sits on
another corner or along an edge. It carries its digit where the digit stays readable; where it would
not, as on a grid whose four-digit values fill their cells, every marker on the chart is the shape
alone, filled solid in its color. It never covers a printed value, a row or column name, or another
marker. Only where even the smallest shape finds no clear spot does a cell keep its ring alone
(design note § 18).

**Six callouts at most on one chart.** Six shapes are about as many as a reader tells apart at a
glance, and a chart with more callouts than that is making more points than one slide should. The
chart draws the first six as written; the rest are not drawn, its description lists them as not
drawn, their details still reach the cell's hover card and the speaker note, and `lint:deck` warns on
each one. Numbers run row by row, then left to right, and the lane lists the labels in that order; one
the lane cannot hold is dropped rather than drawn over another, with its marker, and the chart's
description lists it as not drawn. A `@legend{…}` key on a
heatmap is not drawn, and is reported the same way.

A row or column whose name holds `/` cannot be named by the `for=Row/Column` short form, because the
slash separates the two; `row=` and `col=` name it whatever it holds. Two rows with the same name
resolve to the first.

On every other slide a `@callout{…}` span still renders as code, and `lint:deck` says that no
component on the slide reads it. Callouts reach the other charts one family at a time
(`2026-10-20-callout-placement.md` § 7).

## Narration, the PDF and screen readers

- Narration reads each callout after the rows: "Callout at Feb 2026, M2: Onboarding change."
  A `detail` is read after it. Past six callouts it stops, as the chart does.
- The `detail` joins the named mark's card (hover and tap) and the slide's speaker note, so the PDF
  carries it.
- A callout sits inside the chart's hidden marks, so a screen reader gets it from the chart's
  description, with its detail.
- Hover or tap a callout to open its mark's card: the callout carries `data-mark-for`, the hook pie and
  map key rows already use.

## Diagnostics

`lint:deck` rule `legend-span` reports, as warnings:

- a span that opens `@callout{` or `@legend{` and does not read (it stays code on the slide);
- a callout with no target, a callout with only one of `row=` and `col=`, and a callout that names
  its cell twice (`row=`/`col=` and `for=`);
- on a heatmap, a target that names no cell of the slide's table (the message lists the rows and
  columns it can use), and a `key` legend, which it does not draw yet;
- the `{1, lg}` shape above;
- a seventh callout on one chart, and each one after it, which the chart does not draw;
- a callout on a slide where no component reads one yet.

It also notes, as info, a callout the author switched off (rule `legend-off`), and a callout written
in the pre-split `@legend{…}` spelling (rule `callout-spelling`).

Whatever a heatmap does not draw — a target that names no cell, a `key` legend, a label the lane
cannot hold, a callout past the sixth — its description lists under "Not drawn".

## For components

Callouts and the key share one model and reader, `lib/core/legend.js` (`readLegend`; `spanKind`
says which prefix a span was written with). The SVG emitter is `laneSvg` in
`lib/components/chart/_chart-family/legend-svg.js`, beside the placement pass it uses, since
`lib/core` may not import a component. A component lifts the slide's callout paragraphs with
`liftLegends` (`lib/core/lift-label-set.js`), resolves each target (`gridTarget` for a grid) to its
own mark index, and hands the entries to the emitter. Off is one reading, `calloutsOff`. The emitter
writes classes and a `data-c` color slot and never a color; this plugin's stylesheet paints them.
