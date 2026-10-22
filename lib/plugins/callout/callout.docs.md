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

| Component | How a label names its mark | What the ring and marker land on |
|---|---|---|
| `heatmap` | A cell, by its row and column labels as the chart prints them, `row="Feb 2026", col=M2` (case and extra spaces do not matter); or the short form `for=`, its index counted row by row from 0 (`for=14`) or `Row/Column` (`for=Feb 2026/M2`) | The cell, ringed, with the marker on its corner |
| `bar` | `for=Q2`, a category by name or index; in a grouped chart one bar as `for=Q2/North` | The bar, or the category's group of bars, ringed |
| `stacked-bar` | `for=Q2`, a bar by name or index; one segment as `for=Q2/Services` | The whole stack, or the one segment, ringed |
| `line` | `for=Q3`, a category (the first series with a reading there); `for=Q3/Enterprise` with several series | The dot, ringed, with the marker beside it and clear of the line |
| `histogram` | `for=Q3`, a band by its label or index | The band, ringed |
| `ep-curve` | `for=1-in-100`, or `for=100`; `for=1-in-100/Gross` with several curves | The dot, ringed |
| `waterfall` | `for=Volume`, a step by its label or index | The bar, ringed |
| `bullet` | `for=New ARR`, a KPI row by its name or index | The row's track, ringed |
| `scatter` | `for=Atlas`, a point by its label or index | The dot or bubble, ringed |
| `slope` | `for=Kestrel Group`, an entity by its label or index | A slopegraph: the marker beside the middle of the line. A `dumbbell`: its bar, ringed |
| `tower` | `for=Layer 2`, a layer by its label or index | The layer's band, ringed |
| `piechart` | `for=Deck production`, a slice by its label or index | The wedge, ringed along its outline, with the marker at its middle |
| `funnel` | `for=Activated`, a stage by its label or index | The band, ringed along its outline |
| `map` | `for=Nigeria`, a row of the list by its name or index (a region, or a group of them) | The outline, ringed, with the marker at the middle of its largest piece |
| `quadrant` | `for=Slack intake bot`, an item by its label, or its index counted through the groups from 0 | The dot, ringed, with the marker beside it (every variant, `cohort` included) |
| `radar` | `for=Pricing`, an axis by its name or index | The tip of the axis's spoke, ringed. Not drawn in a pane (a split slide) |
| `gantt` | `for=Scoring model v2`, a task by its label | The bar or milestone, ringed |
| `hub-spoke` | `for=Core platform migration`, a spoke by its label (a branch or a leaf in a `tiered` figure) | The disc, ringed |
| `risk-matrix` | `for=Hurricane season`, a risk by its label or index | The risk's marker on the grid, ringed. The note's number is its own, a shape and color apart from the risk's number |
| `journey` | `for=Book demo`, a task by its label or index | The task's chip, ringed in the note's color, with the note's marker on its corner. The notes are an HTML list under the board (the board is CSS layout the browser measures, so there is no side to choose); a `detail="…"` prints under its note |

`flowchart` and `state-chart` do not read callouts yet: the browser lays them out (the server half writes only
the measuring harness), so a callout there belongs to the browser half. `kanban`, `timeline-list`, `progress`,
Mermaid diagrams and `word-cloud` are ruled out in the design note: their marks are already text rows, or the
chart owns the layout and has no stable mark to point at.

On every chart a `for=` is matched by name without regard to case or extra spaces, or by index counted from 0 in
the order the chart draws its marks. A `for=` that names no mark is not drawn, and the chart's description lists
it under "Not drawn" and says why; `lint:deck` names the marks it could have used.

**The placement rule is one rule.** On each of these charts the engine lays the figure out both ways, the notes
beside it and under it, and with a key the key's two sides too, and keeps the one that leaves the plot largest at
the slide's real shape (`data-aspect`, § Placement below). A chart that has no callout on its slide renders as it
always did, byte for byte. The shared pieces are `lib/components/chart/_chart-family/callout-layer.js`.

On a heatmap the notes sit in a lane to the right of the grid, each level with its cell, or in a
column under the grid, whichever leaves the grid larger (see **Placement** below), and a
**marker** ties a note to its cell: the cell is ringed and carries a marker on its corner, and the same marker
leads the label's words in the lane. A marker is a **shape and a color**: callouts take six shapes in
reading order, one each (circle, square, triangle, diamond, hexagon, star), and a color slot each, so
a reader matches a cell to its label by shape as well as by color, never by color or position alone.
The digit, the callout's number, rides inside the shape when the cell has room for it, and always in
the lane. No line crosses the grid, so no value is covered and two labels on one row stay apart.

**Notes under a chart are a group, not a column.** On every chart but the heatmap, the notes set under the figure side by side, each as wide as its words (up to half the width), and wrap to a new row when the width runs out. A narrow slide (9:16) gets one row; a narrower pane, more rows. A lane beside the chart stays a column, level with its marks.

**Placement.** The engine lays the heatmap out both ways, with the notes beside the grid and under
it, and keeps the one that leaves the grid larger at the slide's shape. Where a band key is also on
the slide, the key's two sides are tried with each: four layouts in all. A wide slide (16:9) keeps the notes beside the grid unless
the key makes the figure wide and the notes are few, when it may set them under it; a squarer one (1:1, 4:5) usually sets them under it, where each runs
the grid's width and sets whole. A layout that would drop a note never beats one that draws it, and a
challenger must keep at least 10% more of the grid, because a taller figure also scales its type down.
Ties keep the notes beside the grid. When the notes and the key are both under the grid, the key's own
rule parts them. Notes under the grid read in the same order and set in the key's size.
(`engineering/decisions/2026-10-20-callout-placement.md` § 5.)

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
each one. Numbers run row by row, then left to right, and the lane lists the labels in that order.
Under the grid the column grows to hold every note, so the engine prefers it to dropping one. A `@legend{…}` key on a
heatmap is not drawn, and is reported the same way.

A row or column whose name holds `/` cannot be named by the `for=Row/Column` short form, because the
slash separates the two; `row=` and `col=` name it whatever it holds. Two rows with the same name
resolve to the first.

On every other slide a `@callout{…}` span still renders as code, and `lint:deck` says that no
component on the slide reads it. Callouts reach the remaining charts one family at a time
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
  columns it can use), and on every other chart a `for=` that names none of the list's marks (the
  message lists the names it can use); and a `key` legend, which these charts do not draw yet;
- the `{1, lg}` shape above;
- a seventh callout on one chart, and each one after it, which the chart does not draw;
- a callout on a slide where no component reads one yet.

It also notes, as info, a callout the author switched off (rule `legend-off`), and a callout written
in the pre-split `@legend{…}` spelling (rule `callout-spelling`).

Whatever a chart does not draw — a target that names no mark, a `key` legend, a label the lane
cannot hold, a callout past the sixth — its description lists under "Not drawn".

## For components

Callouts and the key share one model and reader, `lib/core/legend.js` (`readLegend`; `spanKind`
says which prefix a span was written with). The SVG emitter is `laneSvg` in
`lib/components/chart/_chart-family/legend-svg.js`, beside the placement pass it uses, since
`lib/core` may not import a component. The family's shared layer is
`lib/components/chart/_chart-family/callout-layer.js`, which a chart adopts in five steps:

1. `around(html, ctx, run)` takes the slide's callout paragraphs off the section (`lift`), runs the chart's
   own splice, and puts the section back untouched when the chart declines it;
2. `resolve(legends, { off, find })` ties each note to a mark through the chart's `find(target)`, which
   answers `{ mark, box }` (the `data-mark` index and the mark's box in the figure's coordinates; `pin:
   'beside'` for a point, `ring: 'path'` with `d` for an outline, `ring: 'circle'` for a round mark), and
   caps the drawn notes at six;
3. `place` / `placeUnkeyed` / `choose` lay the notes out beside and under the figure, and a chart with a
   key hands `choose` an `attempt(place)` that builds its key around each unit; the winner is the layout
   that leaves the plot largest at the slide's shape, by the rule in the design note § 5;
4. `mergeDetail` adds each note's `detail` to its mark's card and the speaker note;
5. `describe` writes the notes, and the ones not drawn, into the chart's `<desc>`.

A chart whose figure is finished before callouts are considered (a gantt, a hub and spokes, the quadrant's
variants) reads it back instead: `fromSvg` finds every marked shape and printed word, and `onSvg` ties the
notes to the shapes by name and lays them out. A mark that is a shape in the figure's own markup is found
this way without the chart keeping its geometry a second time.

Off is one reading, `calloutsOff`. The emitter writes classes and a `data-c` color slot and never a color;
this plugin's stylesheet paints them. The slide classes that read a callout are the one list
`CALLOUT_READERS` (`lib/core/legend.js`); the linter and the narrator both read it, and a chart is added to
it when its kernel adopts `around`. The narrator says each callout after the chart, bound to the mark the
narrator already bound by that label (`withCallouts`, `lib/core/chart-narration.js`).
