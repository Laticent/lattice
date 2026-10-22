---
status: in-progress
summary: >
  The owner split the legend plugin in two, `@callout` for notes pinned to a mark and `@legend`
  for the key, and asked for both on every chart where they fit, placed responsively. An audit
  measured every chart gallery slide at five slide shapes (1,163 measurements) and mocked four
  placements on 22 charts at four shapes. No fixed layout wins: notes on the right keep 99% of the
  plot at 16:9 but 60% at 9:16, and notes below keep 100% at 9:16 but 46% at 16:9. So the engine
  picks each chart's placement by measure, keeping the plot largest, with a hairline only where
  notes and key stack below. Journey gains task callouts; risk-matrix's numbered list moves onto
  the callout plugin.
builds-on: 2026-10-19-universal-legend.md
---

# Callouts and the key: two plugins, placed by measure

**2026-10-20.** Status: in progress. The owner's rulings are in § 2; the audit behind the
placement rule is in §§ 3 and 4. The split (P1) is built; § 6 records the owner's one row style for
the key and the callouts. The placement rule (P2) is built on the heatmap and measured in § 5; the
work plan is § 7.

## 1. The ask

After #2816 the owner asked for four things:

1. Make callouts and the key independent plugins.
2. Give callouts to every chart where they make sense, and the key to every component where it
   makes sense.
3. Move components that hand-roll callout-like notes onto the callout plugin. The owner named
   journey.
4. Make charts with callouts, with a key, and with both responsive and refined, and decide
   whether a divider belongs between them.

## 2. The owner's rulings

| # | Question | Ruling |
|---|---|---|
| 1 | What authors type | `@callout{…}` for a note pinned to a mark, `@legend{…}` for the key. Old `@legend{…}` spans that pin a mark (`row=`/`col=`/`for=`) are callouts written the old way. |
| 2 | Journey's callouts | Add task callouts: an author pins a note to a task. Mood and actor stay encodings, and their keys move onto the key plugin. |
| 3 | Risk-matrix's numbered list | Port it onto the callout plugin. This reverses decision 3 of the universal-legend note (§ 14). |
| 4 | Where callouts and the key go | The engine picks, by measure (§ 5), after the audit in §§ 3 and 4. |

Ruling 1 keeps the name `legend` for the key. That contradicts § 4 of the universal-legend note,
which made a plain label "a one-entry legend in `anchored`" with "no second plugin for it". The
owner's split supersedes that sentence. The rest of that note's model (label, mark, plate, tone,
`for`) stays.

**Old spellings.** Every heatmap deck written since Wave 0 uses `@legend{{…, row=…, col=…}}` for
a callout. Breaking them is not on the table. The callout reader keeps accepting a pinned
`@legend` span, and `lint:deck` suggests `@callout`. An unpinned `@legend` span is a key.

**The old switches are dropped (owner, 2026-10-21).** P1 first kept `legend: off`, the
`legend-off` and `legend-on` classes and `--disable-plugin legend` working as callout switches,
through two manifest fields (`aliasOf` on a register, `alsoDisables` on a plugin). That added about
0.3KB gzipped to the preview runtime, and the `getting-started` route's engine bundle sat 0.1KB under
its hard ceiling (313.7KB). The owner chose to drop the old switches rather than raise the ceiling
or hunt for bytes elsewhere. No release ever shipped them (the fragment that introduced them was
still in `changelog.d/`), so no released deck breaks. What stays: a pinned `@legend{…}` span still
draws a callout (it costs a regex), and the legend plugin still `requires` callout, which costs no
runtime bytes, so a host or deck that loads `legend` gets callouts.

## 3. Today, measured

`audit.js` (in `2026-10-20-callout-placement/`) renders every chart gallery at 16:9, 4:3, 1:1,
4:5 and 9:16 and measures each chart slide in Chromium. Full table:
`2026-10-20-callout-placement/today.txt`. Findings:

- **SVG charts draw in only two shapes.** Every SVG chart has a landscape viewBox (about 1.8:1)
  and a portrait one (about 1.07:1). The CLI's `portrait` size is 4:5 (1080 × 1350); 9:16 is
  `story`. Both use the portrait shape, and 4:3 and 1:1 use the landscape one.
- **At 16:9 a typical chart leaves a third of the stage's width empty.** bar, line, heatmap,
  histogram, waterfall, ep-curve, bullet and scatter leave 33 to 38% free at the sides; pie,
  radar and slope leave 41 to 42%; quadrant 57%.
- **At 9:16 the free space moves below,** 15 to 22% of the stage height for those same charts.
- **Some charts are wide at every shape** and leave almost no room at the sides: gantt (5.2:1),
  flowchart (6.2:1 at 16:9), journey, kanban, roadmap, matrix-grid, progress, timeline-list.
  Map, hub-spoke and word-cloud fill most of the width too.
- **Where keys sit today:** on the right in landscape and below in portrait (bar, heatmap, map,
  pie, radar, stacked-bar, tower, word-cloud). Risk-matrix and scatter keep theirs on the right in
  both. Gantt, flowchart, state-chart, matrix-grid, journey and roadmap put theirs below in both.

## 4. Four placements, mocked and measured

`mock.js` adds three callouts to a rendered chart inside its own SVG: real marker shapes pinned to
real data marks, a callout column, and the key moved. `mockrun.js` screenshots each and measures
how much plot area survives against the same chart with no callouts. Full table:
`2026-10-20-callout-placement/plot-kept.txt`.

| Option | What it is |
|---|---|
| B | Notes on the right; the key stays where it is |
| A | Notes on the right; the key as a caption row below |
| C | One right column: a NOTES heading, a hairline, a KEY heading |
| D | Notes, a hairline, then the key, all below |

Median plot area kept, 20 charts (line and word-cloud gave the mock no target):

| Slide | B | A | C | D | Best |
|---|---|---|---|---|---|
| 16:9 | **99%** | 80% | 75% | 46% | B on 18 of 20 |
| 1:1 | 65% | 75% | 80% | **98%** | D on 15 of 20 |
| 4:5 | 73% | 75% | 66% | 72% | B 7, A 5, D 8 |
| 9:16 | 60% | 61% | 42% | **100%** | D on 20 of 20 |

- No single option wins everywhere. Each loses 35 to 55% of the plot at some shape.
- C never wins and costs the most at most shapes. It is dropped.
- At 4:5 the winner depends on the chart. A fixed table by slide shape would give up as much
  as 25% of the plot on the charts where the other side wins.
- A pie's key carries its values. Moving it below at 16:9 leaves 32% of the plot.
- Gantt, flowchart, state-chart and hub-spoke lose 20 to 55% under every option: they have no
  free space. They are the charts where six callouts cost most.

**Limits.** The mock approximates the layout: the real lane wraps labels with the shared
kernels, the real key reflows through `keySvg`, and font sizes follow the figure. The plot-area
numbers are good for ranking options, not as final figures. The shipped placement is measured
again on the real engine (§ 7, P2).

## 5. The rule: the engine picks by measure

For each chart with callouts, a key or both, the engine tries the callouts on the right or
below, and the key on the right or below, and keeps the combination that leaves the plot largest
at the slide's real stage size. Ties put callouts on the right, beside the marks they name.

- **A hairline only where they stack.** When callouts and the key both go below, something parts
  them. As built, that is the key's own portrait rule (the accent fade the family already draws
  between a diagram and a key below it), which sits between the notes and the key, so no second
  `--border` hairline is added: two rules in a row read as clutter. Side by side, the key's own
  spine already separates them.
- **SVG-native.** The callouts, markers, hairline and key are drawn inside the chart's SVG, so
  every export carries them: PDF, PPTX, PNG, and the HTML player.
- **The same rule with one part.** A chart with only callouts or only a key runs the same
  choice.
- **HTML charts.** Journey, roadmap and matrix-grid run the same choice with CSS layout.

**As built on the heatmap (P2).** `buildHeatmap` lays the figure out once per candidate
(`layoutHeatmap`), in a trial that restores the render's id sequences (`trialIds`, `lib/core/render-ids.js`)
and swallows the label-drop report, so the losing layouts leave no trace and a winner's ids match a
single render's. Four details the rule above leaves open:

1. **The score is the plot's area once the whole viewBox is fitted into the chart's box.** The box's
   shape is not the slide's: it is the chart area under the title, measured in Chromium as 2.72 wide
   at 16:9, 1.74 at 4:3, 1.26 at 1:1, 1.09 at 4:5 and 0.67 at 9:16.
2. **The transform is told the slide's shape.** An orientation name covers shapes that want different
   layouts (`landscape` is 16:9 and 4:3, `portrait` is 4:5 and 9:16; on the demo deck's notes-and-key slide the
   best layout at 16:9 has the key beside the grid and at 4:3 it has the key below). The engine
   (`lib/engine/slides.js`) and the runtime (`stampOrientation`) now stamp each section's `data-aspect`
   (`aspectStamp`, `lib/adaptive/families.js`; absent at 16:9 so the common deck's markup does not move),
   `transformChartSection` hands it to the kernel as `ctx.aspect`, and the runtime's rebuild key includes it. The heatmap
   reads the chart box's aspect off the slide's by interpolating the five measured points (`chartBoxAspect`)
   and scores every layout at that one shape. `STAGE_ASPECTS` (landscape 16:9; portrait scored at both 4:5
   and 9:16) is the fallback for a caller that passes only an orientation name.
3. **A challenger must keep 10% more plot** (`PLACEMENT_MARGIN`). A layout that grows the figure's
   height also scales its type down, so on a 3 by 2 grid at 16:9 notes below keep 5% more plot than
   notes beside and set every label 10% smaller. Ties keep today's layout.
4. **A note is never dropped for a bigger grid.** Among layouts, only those that draw the most
   callouts compete. Beside the grid the lane cannot hold a long stack and drops from the bottom; under
   the grid the figure grows to hold every note, so six long notes at 4:5 now draw all six where the
   lane drew five.

**Measured on the real engine** (`2026-10-20-callout-placement/real.js`; the grid's area in pixels,
this branch as a share of `main`, on `examples/callout-placement.md`):

| Slide | 16:9 | 4:3 | 1:1 | 4:5 | 9:16 |
|---|---|---|---|---|---|
| 3 notes | 100% | 100% | 140% | 82% | 143% |
| 3 notes + key | 100% | 100% | 237% | 100% | 100% |
| key only | 100% | 100% | 246% | 100% | 100% |
| 6 long notes | 100% | 100% | 100% | 100% | 100% |
| 6 long notes + key | 100% | 100% | 206% | 62% | 78% |

Nothing moves at 16:9 or 4:3 on this deck: the lane there already keeps the plot. It is not true of every
slide: a keyed heatmap with one short note (`examples/legend-anchored.md`, slide 6) moves its note under the
grid at 16:9, because the grid then keeps 11% more plot (the type scales down about 10%; the margin in item 3 is
what stops smaller gains). The wins are at 1:1 (the key and
the notes under the grid, 1.4 to 2.5 times the grid) and at 9:16. The two losses are the price of the
rules above: at 4:5, three notes under the grid keep 82% of the grid `main` kept with notes beside it,
because the pick is the one that gives up least across 4:5 and 9:16 (it wins 143% at 9:16); and six
long notes with a key keep 62% at 4:5, because `main` drew only five of them there. These are the
cases the real aspect settles (§ 5, item 2): with the stamp, the grid's area against the tree before it:

| Slide | 16:9 | 4:3 | 1:1 | 4:5 | 9:16 |
|---|---|---|---|---|---|
| 3 notes | 100% | 100% | 100% | 122% | 116% |
| 3 notes + key | 100% | 146% | 100% | 100% | 141% |
| key only | 100% | 146% | 100% | 100% | 100% |
| 6 long notes | 100% | 100% | 100% | 100% | 100% |
| 6 long notes + key | 100% | 127% | 100% | 124% | 100% |

(`real.js`, this commit against the commit before it. At 4:5 the three notes now sit beside the grid again,
which is where `main` had them, so the 82% loss above is gone.)

## 6. One row style for the key and the callouts (owner, 2026-10-21)

The owner found callouts "huge relative to legends". Measured on the demo heatmap: a key swatch was
1.04 times its label and a callout's marker 1.84 times, about 1.8 times the swatch, and the callout's
words were the body face at 600 while the key's were the label face at 400. The owner ruled out any
visual inconsistency between the two and asked for a happy medium.

Rendered at a shared size of 1.3, 1.45 and 1.6 times the label, the owner picked **1.45**: the
key's swatch grew by about a third and the callout's marker shrank by a fifth, to one size
(`svg-legend.js` `MARK_OF_LABEL`). The callout's digit is then 0.79 of the label. The callout's words
take the key's face, weight and size. Asked which face both should use, the owner kept the key's
(the label face, a monospace), so no existing key changes face; the digit inside a marker stays in
the body face, whose figures center in a shape. Every SVG key in the catalog changes size with this,
so it went to the owner as light and dark renders of the chart gallery and the callout demo deck.

**Beside a key the callout holds the key's size.** Without a key, the heatmap's callout lane steps a
long label down from the key's size (8.1 on a 16:9 slide) toward 7.5 so it sets whole in three
lines. Beside a band key that put the two at different sizes side by side, which this ruling rules
out; a stress deck of long sketch-mode labels found it before merge. With a key the lane now holds
the key's size, and a label too long for three lines ends in an ellipsis
(`heatmap.transform.js` `calloutLane`, `keyed`).

## 7. Work plan

One PR, one commit per item. HTML and SVG emitters stay byte-identical where an item does not
mean to change a render; an item that does stops for the owner's light and dark sign-off.

| P | Item | Evidence |
|---|---|---|
| P1 | Split: `@callout` and `@legend` plugins over shared kernels (marker shapes, plate, color slots, mark vocabulary); the heatmap moves to `@callout`; old pinned `@legend` spans keep working with a lint hint | `diff -r` of every tracked deck before and after, byte-identical |
| P2 | The placement rule (§ 5) in the shared emitter, on the heatmap first — **built on the heatmap**, in `buildHeatmap`/`layoutHeatmap`; the shared emitter waits for the second chart. **The shared emitter is `callout-layer.js` (§ 8)** | the real engine's plot area against this note's mock, 16:9 / 1:1 / 4:5 / 9:16, light and dark PDFs (§ 5) |
| P3 | Callouts on the SVG charts with marks: bar, stacked-bar, line, ep-curve, scatter, quadrant, piechart, radar, map, funnel, histogram, waterfall, bullet, slope, tower, gantt, flowchart, state-chart, hub-spoke. **Built (§ 8) for seventeen of the nineteen; `flowchart` and `state-chart` are browser-laid-out and filed in `followups.d/`** | a demo deck per family, four slide shapes |
| P4 | Journey task callouts; risk-matrix onto the callout plugin. **Built (§ 9)** | both galleries, light and dark, owner sign-off |
| P5 | Keys through `@legend` on every component that already draws one, so authors can rename and reorder entries | `diff -r` where untouched; demo deck |

Charts the scout ruled out for callouts: kanban, timeline-list and progress (their items are
already text rows), and Mermaid diagrams (Mermaid owns the layout and has no stable mark hooks).
Word-cloud is weak: its marks are words that are already labeled.

## 8. The second readers (P3 as built)

Seventeen charts now read `@callout`; the heatmap was the first. Each takes `for=` naming its mark (the table in
`lib/plugins/callout/callout.docs.md`), rings the mark, puts a numbered marker on or beside it, and sets the
words in a lane beside the figure or under it by the § 5 rule.

**One layer, three ways in.** `lib/components/chart/_chart-family/callout-layer.js` holds what the heatmap
proved: lift the paragraphs, tie notes to marks, size the lane, score the layouts at the slide's real shape
(item 2 of § 5, now `data-aspect`), and describe the notes. A chart whose geometry it keeps hands the layer boxes
(`bar`, `line`, `histogram`, `waterfall`, `bullet`, `scatter`, `slope`, `tower`, `ep-curve`, `piechart`, `funnel`,
`map`, `radar`, `quadrant` cohort). A chart whose figure is finished first is read back (`fromSvg`, `onSvg`:
`gantt`, `hub-spoke`, and the quadrant's four other variants), so the notes cannot disagree with where the marks
were drawn. A keyed chart builds its key around each candidate unit, as the heatmap does.

**Three rules the second readers added.**

1. **A word is never broken for a bigger plot.** `choose` prefers the layout that splits the fewest words
   (`measureLabel` `split`): at 9:16 a grouped bar's lane beside the chart broke `quarter` into `quart` over `er`
   and lost to the notes under it. A note ellipsized at its third line is still allowed, as on the heatmap.
2. **Point-like marks get a marker beside them, one size, a free diagonal each.** An area mark (a cell, a bar)
   keeps the heatmap's rule of one place for every marker. A dot has no corner and its neighbours' names take the
   room above it, so each marker takes the first clear of four diagonals and two level spots, and the size and
   the digit are what must agree (`legend-svg.js` `pinMarkers`).
3. **The lane's type is the key's, unless the figure sets its own.** The key's size is a share of the figure's
   height; a funnel's tall portrait viewBox made that 18.9 against its own 8.5 labels, so the funnel passes
   `laneFont`.

**Where the notes land**, on the demo decks' charts (`examples/callouts-*.md`), measured on the kernel at each
shape (the figure's viewBox grows in width for a lane beside it and in height for notes under it):

| Chart | 16:9 | 4:3 | 1:1 | 4:5 | 9:16 |
|---|---|---|---|---|---|
| bar, slope, line, histogram, waterfall, bullet, scatter, ep-curve, funnel, radar, quadrant cohort | beside | beside | under | beside | under |
| stacked-bar | beside | under | under | beside | under |
| hub-spoke, map | beside | under | under | beside | under |
| tower | beside | beside | under | beside | beside |
| piechart | beside | beside | beside | beside | beside |
| quadrant | beside | beside | beside | beside | under |
| gantt | under | under | under | under | under |

The stacked bar, the map and the hub-spoke move at 4:3: the picks the real aspect made possible (§ 5 item 2).

**What is not built.** `flowchart` and `state-chart` (the browser lays them out, so the shapes' boxes do not exist
where the transform runs), and `radar` inside a split pane (the pane fits its own key). Both are filed in
`followups.d/`. The heatmap's own placement loop was left alone (it differs from `choose` only in rule 1), also
filed. Owner sign-off per item (§ 7) is pending: the decks are in the PR, light and dark.

## 9. Journey and risk-matrix (P4 as built)

**`risk-matrix`** reads callouts through `onSvg` like the gantt: a note names a risk, its marker on the grid is
ringed, and the note's own marker (a number, a shape and a color, apart from the risk's own number) sits beside
it. The grid keeps its numbered key; "onto the callout plugin" here means the plugin draws the notes, and the
key stays the register's list. Replacing the key with callouts is a design change the owner has not asked for.

**`journey`** is the one chart here that is not SVG. The board is CSS layout the browser measures, so the
server cannot score a side by the plot and the notes always sit under the board, in a row that wraps. The task's
chip is ringed in the note's color (`outline`) and carries the note's marker (an inline SVG drawn by `markerSvg`,
so the shapes are the charts' own). A portrait deck splits the vertical board into one page per stage, and the
splitter copies whatever sits outside a stage onto every page, so each note rides inside the stage it is about.
A note is a row high, which at 16:9 clipped the mood legend until the key under it gave back its air
(`:has(.journey-callouts)` in `journey.styles.css`); the detail runs on after its note on one line for the same
reason.

**Not built, and still open:** plan item P5, keys through `@legend` on every component that already draws one
(`followups.d/2854-p3-keys-through-legend.md`).
