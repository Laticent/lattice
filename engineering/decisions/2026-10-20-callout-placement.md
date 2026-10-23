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

**Superseded by § 8 (owner review, 2026-10-22).** The original rule: for each chart with callouts, a key or both, try the callouts on the right or below and the key on the right or below, and keep the combination that leaves the plot largest at the slide's real stage size; ties put callouts on the right. The notes' side is now the author's call (§ 8: `side=under|beside` in the `@callout` span), else the chart's manifest default (`callout.side`; only the pie and donut say `beside`), else under; the key's two sides are still tried.

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

**The notes under a chart flow (owner, 2026-10-22).** A column under a figure is a stack taller than the room it leaves, and at 9:16 it ate the plot. `laneSvg` takes `flow: true` for the `below` side: each note is as wide as its words (up to the figure's width), notes sit side by side, each row centered in reading order, and a note that no longer fits starts a new row; a row shares one centerline, set by its tallest label. Owner review of the 9:16 output (2026-10-22) tightened it: the notes go under the figure at every shape, each row centered, and `choose` tries only the resolved side: the author's `side=`, else the manifest default (`callout.side`, compiled into `lib/core/callout-catalog.generated.js`), else under. `around` sets the resolved side for the span of one chart's render, so no chart's call changes. On the heatmap an explicit `side=` pins the notes; with none the grid keeps its own choice by plot size. The decision was the owner's: "the user should decide via a callout parameter; the default under; charts override it via their manifest." A lane beside a chart, one note to a row with dead space to its right, was the thing being removed. The journey badge moved to the chip's bottom edge near its start, half outside it: inside the chip it covered the mood face, the top corners hold the actor dots and the heatmap's mood number, and on a row chip the face slides along the chip with the score, so the middle of the edge is not free either. The heatmap's below layout moved onto the flowing group afterward (§ 11).

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

**Where the notes landed** before the 2026-10-22 owner review (today every chart but the pie puts them under the figure, so read this table as the measurement that motivated the change, not as current behavior), on the demo decks' charts (`examples/callouts-*.md`), measured on the kernel at each
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
where the transform runs; built afterward, § 12), and `radar` inside a split pane (the pane fits its own key). The heatmap's own placement loop was left alone in #2855 and now calls `choose` (`noteSides` keeps its
both-sides default when the author names none; 60 renders of the twelve heatmap decks at five shapes are byte-identical).
Its below-grid notes now flow like the others' (§ 11). Owner sign-off per item (§ 7) is pending: the decks are in the PR, light and dark.

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
(`followups.d/2855-p3-keys-through-legend.md`).

## 10. The callout layer loads on demand (#2855 follow-up)

**What moved.** `callout-layer.js` was one 620-line file in the closure of all nineteen chart kernels, so a deck
with a chart downloaded the lane, the markers and `legend-svg.js` whether or not it wrote a callout. It is now
three files behind the same import:

| File | Holds | Loaded |
|---|---|---|
| `callout-core.js` | `lift`, `around`, `choose`, the stage's shape, the boxes a marker avoids, `matchName`, `mergeDetail`, `addToDesc` | always: `choose` places a key with no callout in sight, and `mergeDetail` runs on every render |
| `callout-place.js` | `resolve`, `laneFor`, `place`, `describe`, `fromSvg`, `onSvg`, the marker and lane drawing (`legend-svg.js`) | for a deck that writes `@callout` or `@legend` |
| `callout-layer.js` | the surface the charts import: core functions direct, the rest through `need()` | always (tiny) |

**How it loads.** Node, the CLI and the single-file bundles reach `callout-place.js` through
`callout-place-load.js` (a `require`). The ESM playground build swaps that file for a stand-in that answers null
and ships `esm/callout-place.js` as an entry of its own, which installs the half into the shared layer
(`tools/build-playground.js` `calloutPlaceEsmPlugin`). The engine's `calloutsNeeded(markdown)` says whether the
deck writes `@callout{` or `@legend{` and the build is the lazy one; `ensureCalloutLayer` in
`docs/src/lib/ensure-charts.ts` loads the entry before the synchronous render, as KaTeX and the kernels load.

**It cannot draw a wrong chart quietly.** A heavy function with no half installed throws `ChunkLoadError`, the
name the hosts already turn into "part of the app didn't load". `test/unit/components/callout-layer-lazy.test.js`
holds three lines: no example deck without a callout reaches the heavy half (it renders with the half withheld),
a deck with a callout and no half throws, and every deck that throws is one the host's scan names. A callout written
through markup (`<code>@callout<span></span>{…}`) is one the scan cannot see and the chart still lifts, so `need()`
also records the miss (`takeMissingCallouts`) and `renderMarkdown` loads the layer and renders once more, the way a
missed chart kernel recovers. An independent checker found the gap.

**Measured, same machine, gzip level 6.** Output is byte-identical: 942 renders (314 example decks at three slide
shapes) before and after. The followup predicted about 12KB; the heavy half is 7.5KB, because the 11.9KB it counted
was a shared chunk that still holds what the kernels need.

| | Before | After |
|---|---|---|
| `chartKernelGz`, the largest kernel closure (`chart-map`), `check-route-budget.mjs` | 85.7 KB | 80.3 KB |
| `chartKernelsGz`, the union of every kernel closure | 226.1 KB | 220.5 KB |
| Engine (`calloutsNeeded`, the stand-in), my own gzip | 301,759 B | 302,206 B |

`chartKernelGz` was more than 5% under its soft target, so the ledger called it stale and its soft target and
ceiling came down with `route-budget:rebaseline` (87,803 to 82,236; 96,583 to 90,460). `chartKernelsGz` is
inside its 5% band, so its ceiling stays where the owner set it.

A callout deck pays what it paid before plus one request. On the real Studio in Chromium
(`docs/e2e/engine-on-demand.spec.ts`): a bar chart with no callout requests `chart-bar.js` and not
`callout-place.js`; adding `@callout` fetches it once and draws the marker and the note; a 404 on it shows "couldn't
load part of the app" and draws no note.

## 11. The heatmap's notes under the grid flow (#2864)

`layoutHeatmap` passes `flow: below` to `laneSvg`, as `place` does for every other chart, so the notes under a grid sit
side by side and wrap instead of stacking in one column. Measured on the 4 by 5 retention grid, plot kept as a share
of the better side at that shape, the pick rule's own score (`kept` in `choose`):

| Slide | Notes beside | Notes under, stacked (before) | Notes under, flowing (after) |
|---|---|---|---|
| 16:9, three notes | 100% | 79% | 93% |
| 4:3, three notes | 100% | 82% | 97% |
| 1:1, three notes | 71% | 100% | 100% |
| 9:16, three notes | 70% | 100% | 100% |
| 1:1, six long notes | 97% | 100% | 100% |

With a key as well, at 1:1 the four placements scored (beside/beside, beside/under, under/beside, under/under) 40%,
99%, 57%, 100% before and 35%, 87%, 50%, 100% after. Stacked, under/under beat beside/under by 1%, inside
`PLACEMENT_MARGIN`, so the notes stayed beside. Flowing, it wins by 15%, so at a square slide with a key the notes
and the key now both go under the grid, the notes first. That is the measured outcome of the owner's earlier rule that
notes go under the figure at every shape; `heatmap-placement.test.js` ("square puts the notes and the key both under
the grid") pins it. No shape changed which side wins for notes alone.

Rendered: 942 example renders, four moved (`legend-anchored` at 16:9, 4:3 and 9:16; `callout-placement` at 9:16). In
the PNGs the two slides that differ at 16:9 (`legend-anchored` 6 and 7) show one note centered under its grid, and the
seven-by-twelve grid's notes in one row with a wider grid (463 against 374 px at 1x).

## 12. Callouts on the flowchart and the state chart (#2864)

**The problem.** Both charts are laid out in the browser (Trama, `docs/src/lib/trama`): the server writes a measuring
harness and the model, and a pass in the page measures, lays out, fits and paints. The shapes' boxes exist only
there, so the 17 server-side readers' `place` could not run where the transform runs.

**The split.** The server half does what it can: `layer.around` lifts the callout paragraphs, `layer.resolve` ties
each note to a shape or state by name (it has the names), and the notes ride in the model payload as
`callouts: [{text, mark, detail?, plate?, color?, size?}]` with `calloutSide`. The `<desc>` and the hover card
take their words there. The browser half places them: `callout-browser.js` `placeCallouts` calls the same `place`
as every other chart (HARD RULE #1) on the laid-out boxes and answers with the notes' markup and the size the
figure now takes.

**Trama.** Two additive hooks, so Trama stays chart-agnostic. `PassOptions.callouts` is the placer, handed to the
adapter on `ctx.callouts`. `adapter.extent(model, geo, ctx, measured)` says how large the drawing is with its notes;
the fit's rounds, the `viewBox` and the scale box read it in place of `geo.width` and `geo.height`. A `paint` that
mutated `geo` instead would have left the fit solving for a smaller figure than the one drawn, and the type floor
would have been missed. The notes set at the chart's own smallest label (the floor lift is already in it), capped at
18 units: a sparse state chart's labels grow to about 25 units, and a note that size broke its words in a narrow figure.

**Where the placer comes from.** The Studio's runtime already bundles the callout layer, so it passes
`placeCallouts` into the pass and pays no bytes. The CLI export serializes the pass with `toString()`, so a page
has no modules: `tools/build-callout-browser.js` bundles `callout-browser.js` to an IIFE string
(`lib/core/callout-browser-bundle.generated.js`, built not committed, like the dagre string), and `lattice.js`
embeds it only in a deck whose flowchart or state chart carries callouts (`htmlHasCallouts`), so every other export
is the size it was. Getting that string small took two leaf modules: `callout-geometry.js` and `callout-choose.js`
split out of `callout-core.js`, and `legend-limits.js` out of `legend.js`, so the browser bundle does not carry the
Segno reader that `lift` needs. 117 KB raw (39.8 KB gzipped) became 40 KB raw (17.1 KB gzipped).

**HARD RULE #22.** `data-fc-model` and `data-sc-model` are author-forgeable and the pass runs after the sanitizer,
so both `sanitizeModel`s rebuild `callouts` from a closed set: at most six, each tied to an existing shape index,
text kept as text, `plate` and `size` matched against closed lists (an own-property check, so `constructor` is dropped), `color` 1 to 8, `side` `under` or `beside`.
`graph-callouts.test.js` forges a model and holds each of those.

**Not drawn, and said so.** A note that names no shape is listed in the `<desc>` as not drawn. The state chart's
`inline` variant is rows of HTML with no layout pass, so it leaves the callout paragraph on the slide as written
instead of dropping the author's words. A note the lane has no room for in `beside` cannot be reported from the
browser (the `<desc>` is the server's); under the figure the group grows without limit, so none is lost.

**Seen.** Real Studio in Chromium (`docs/e2e/graph-callouts.spec.ts`, 3 of 3): the ring, the note and the grown
`viewBox` on both charts, and the orphan note in the `<desc>`. The CLI's PDF at 16:9, 1:1, 9:16 and 4:5, light and
dark: the notes sit under the figure at every shape with the right shapes ringed. Rings are plain rectangles, so on the
state chart's rounded tiles the ring's corners are square; tracing each tile's own outline is left for a later pass.
Callout-free flowchart and state-chart decks render pixel-identical before and after (24 PDF pages), though their
export script differs by the new `extent` lines.
