---
status: proposed
summary: >
  A chart is a Lattice. Every chart is decomposed into pieces (plot, axes, anchored labels, key, notes),
  each piece declares its minimum size, how it grows and its fallback forms, and one shared kernel places
  them in the chart box in page pixels, so text never scales and fixing one piece cannot break another.
  When content exceeds a page it gives way in one order for all 28 kinds. Owner decisions recorded in section 7.
last-updated: 2026-11-10
companion:
  - ../../design/forms.md
  - 2026-10-19-universal-legend.md
  - 2026-11-03-responsive-tables.md
---

# A chart is a Lattice: Frame, Cell and Tile inside the chart box

**2026-11-10.** Status: proposed (design before code). Owner's ask: stop tweaking one part of a chart only to
break another. Decompose every chart into pieces, place them with one shared kernel, and size each piece by
the space it is given, at every page size.

## 1. Why the current approach keeps breaking

Today each chart kind draws **one drawing** (one SVG viewBox) holding everything: the plot, its axis names,
its key, its notes. Then the whole drawing is scaled to fit the chart box. So:

- **Text size is a side effect.** Text is drawn in drawing units, and the units shrink or grow with whatever
  else is in the drawing. A longer key makes the axis labels smaller. That is the root of the tiny-text
  problem, and of the fixed-point solve the role ladder needed (`chart-family.dispatch.js`).
- **Every piece is sized against every other piece, in each kind's own code.** 28 kinds, 28 private layouts.
  Fixing the funnel's gap broke nothing else, but fixing the risk-matrix grid moved its key, which squashed its
  rows. Each fix is local, so each fix can break a neighbor inside the same drawing.
- **Empty space is wasted.** A chart draws to its own shape, so a phone page shows a small chart floating in
  white space (funnel, hub-spoke, roadmap in the owner's screenshots).

Slides had the same problem before Form, and Form fixed it: the slide is carved into **Cells**, each Cell is a
box, each **Tile** fills one box, and a shared kernel does the carving (`design/forms.md`). A chart is the
same problem one level down.

## 2. The model: the four nouns, inside a chart

| Slide (design/forms.md) | Chart | What it is |
|---|---|---|
| **Form** | **Chart form** | how this chart is composed |
| **Frame** (slicer) | **Chart frame** | carves the chart box: `stack` (pieces above and below), `beside` (left and right), `grid` (small multiples) |
| **Cell** (typed slot) | **Chart cell** | an empty sized box: `plot`, `axis-*`, `key`, `notes` |
| **Tile** (filler) | **Chart tile** | what a chart kind supplies to fill a cell |

### 2.1 The pieces (the Cells)

The owner named three: the main chart, the labels, the callouts. The audit of the 28 kinds (role audit, §32 of
`2026-11-03-responsive-tables.md`) finds five, because "labels" are two different things:

| Cell | Slide analogue | Holds | Placement | Responsive |
|---|---|---|---|---|
| **plot** | stage | the marks and their coordinate space: bars, dots, wedges, cells, the map; gridlines, bands, thresholds; marker numerals | the center; everything else docks to it | stretches on the axes the kind allows (a bar plot both ways; a pie, map, radar keep their aspect, within a range) |
| **axis** (x and y bands) | the gutters around the stage | ticks, category names, axis titles | bound to a plot edge; it cannot move away from the plot | across: one row, then staggered rows, then wrapped; down: the band grows to its widest name |
| **anchored labels** | annotation plane | text tied to one mark: a quadrant name at its dot, a line's end name, a bar's value, a hub's spoke name | inside or beside the plot, next to the mark it names | none of its own. When names cannot all sit clear of each other, the whole set becomes numbers on the marks plus a **key** (§3) |
| **key** | coda | a list: series swatches, risk names, size ramp, color scale | under the plot or beside it, whichever the kernel picks | reflows: one to three columns, names wrap at spaces |
| **notes** (callouts) | meta | the author's annotations, numbered on the plot | a lane under or beside | reflows like the key |

The slide-level title, subtitle and caption stay where they are (the chart frame, `chart-frame.js`). Small
multiples are a `grid` chart frame whose cells are plots. A chart too big for one page **continues** onto the
next page; that is the chart frame's overflow, the way a long slide splits today.

### 2.2 What each tile declares (the contract)

A chart kind stops laying itself out. It hands the kernel its tiles, and each tile declares, in **page
pixels** (the role ladder gives every text role a size in page px, so text is never scaled):

- **min**: the smallest box it can be drawn in with all its text at role size;
- **grow**: which directions it stretches in (across, down, both, or aspect-locked within a range);
- **reflows**: its fallback forms, in order (key: 1, 2, 3 columns; x axis: one row, staggered, wrapped;
  anchored labels: on the marks, with leaders, then numbered with a key);
- **draw(box)**: draw itself into the box it was given.

### 2.3 The kernel (one placer for every chart)

Given the chart box and the tiles, the kernel tries the arrangements (key under or beside, notes under or
beside) and, inside each, each tile's reflows. It keeps the arrangement that, in this order:

1. keeps **every text at its role size** (hard rule: never below the 11pt floor);
2. **drops nothing** (no name missing from the page);
3. gives the **plot the most area**;
4. leaves the **least empty space** (the pieces fill the box, with one spacing rule).

This generalizes `callout-choose.js`, which already does steps 2 and 3 for notes and the key. Cells never
overlap and never bleed: the gap and clip guarantee of `design/forms.md` §6, applied inside the chart.

## 3. When it does not fit: what gives, in order

A phone page has a fixed size and the text has a fixed size, so every chart has a **capacity**. When the
content exceeds it, the kernel gives way in one fixed order, the same for all 28 kinds:

1. **use the empty space** (fill the box, stack instead of side by side);
2. **reflow** (key columns, staggered axis rows, wrapped names);
3. **move names into a key** (numbers on the marks, names listed: the risk-matrix pattern, now available to
   quadrant, scatter, hub-spoke, line ends);
4. **continue on the next page** (split; kanban lanes, roadmap phases, a long key);
5. **never shrink text below the floor.**

## 4. What this replaces, and what it reuses

- **Reuses:** `chart-roles.js` (sizes in page px), `chart-box.js` (the box per page size), `callout-choose.js`
  (the arrangement search), the legend plugin's label model (`2026-10-19-universal-legend.md`: key, anchored,
  along-path layouts), `svg-label.js` `placeLabels` (anchored placement), the gap and clip guarantee.
- **Retires:** each kind's private layout of its key and notes; the per-kind gutter constants; the dispatch's
  fixed-point scale solve (text is placed in page px, so there is no scale to solve for); the per-kind patches
  this session added (staggered rows, key columns, box-unit grids) once their kind moves over.
- **Rendering:** still **one SVG per chart** (so the PDF stays vector and the export path is unchanged). The
  plot draws in its own nested coordinate space; every other cell draws in page units, so its text prints at
  exactly its role size.

## 5. How it lands

- **Pilot on three kinds that span the shapes:** bar (plot, two axes, key), quadrant (anchored labels that must
  fall back to a numbered key), risk-matrix (a grid plot with a long key). They go through the kernel at all
  five sizes before anything else moves.
- **Then one kind per commit**, each checked at mobile, 4:5, story, square and 16:9 against `main`, with the
  overprint, drop and clip reports at zero new.
- **Landscape 16:9:** the kernel runs there too. Whether landscape output may change at all is the owner's
  call (§6, question 4).

## 6. Decisions for the owner

1. Where this lives. **Recommended:** #3088 goes back to the fluid-viewer redraw it was; this design and the
   role ladder start a new branch, which builds on the ladder commits.
2. Measuring text. **Recommended:** a pure estimate in JS (as today, no browser needed, the same in the CLI and
   the docs site), tuned per theme face. Alternative: measure in the browser, more exact but export-only.
3. The what-gives order of §3. **Recommended:** as written.
4. Landscape. **Recommended:** the kernel runs everywhere, and landscape changes ship only with a before/after
   sign-off. Alternative: landscape keeps today's drawings until a later pass.

## 7. Decided by the owner (2026-11-10)

1. **Home:** split out of #3088. #3088 returns to the fluid-viewer redraw. This work, the role ladder it builds on
   (§ 32 of `2026-11-03-responsive-tables.md`, carried on this branch) and the kernel go on
   `claude/chart-form-kernel`, worked by its own session until the problem is solved.
2. **Measuring text:** decided by a **bake-off** of what delivers the best results, not by preference. Candidates
   at least: the current flat-advance estimate; per-face measured advance tables built offline from the theme
   fonts; browser measurement (`canvas.measureText` / a layout pass as the flowchart does). Judged on the rendered
   PDFs at all five sizes: names cut or wrapped needlessly, overprints, determinism across CLI / docs site / tests,
   and cost.
3. **What gives:** the order in § 3, as written, for all 28 kinds.
4. **Landscape:** the kernel runs everywhere; any change to a landscape (16:9) chart ships only with a before/after
   sign-off from the owner.

## 8. The pilot and the measuring bake-off (2026-11-10)

**What is built.** `lib/plugins/chart-family/shared/chart-form.js` is the kernel: `arrange` (the search of § 2.3 over
each tile's sides and forms, keeping every tile whole, then the largest plot, then the fullest box), `keyTile` (a key
in one to three columns or as a running line, names wrapped at spaces, never mid-word; under the plot or, narrowest
first, beside it), and the swatch key every keyed kind shares. A kind opts in with `kernel.form: true` in its manifest;
the dispatch then draws it ONCE, on a canvas 320 units wide and the shape of its box, so one unit prints at a known
3.0375 page px and every role's size is known before anything is drawn (`chart-form-state.js`). Bar, quadrant and
risk-matrix are on it.

**Measuring text: the bake-off.** Three candidates, judged on the three pilot galleries at the four phone sizes, with
every line break the kernel made judged against the width Chromium paints:

| Measurer | Needless wraps | Overprints / drops | Where it runs | Cost |
|---|---|---|---|---|
| flat 0.52 em a character (the ladder's) | 120 | 4 / 1 | everywhere | none |
| per-glyph table, built offline from the shipped Outfit and Shantell woff2s, tabular figures | 6 | 2 / 1 | everywhere, the same result | ~10 KB raw in the lazy chart kernels |
| browser measurement (each string measured in Chromium) | 0 | 2 / 1 | the CLI only, with 2-3 extra passes; not unit tests, not the docs site without a measuring pre-pass | ~3x render time |

Over the 2,638 label runs of all 28 galleries the flat estimate misses the painted width by -49% to +55% (54% of runs
under by more than 2%); the table by 0% at the median and +2% at p95, and under by more than 2% on 0.8% of runs
(kerning). The table matches the browser on every rendered warning. Recommendation: the table.

**The pilot against `main`**, the 44 decks that draw a pilot kind at five sizes: the type below the legibility floor
that `main` prints on phone pages is gone, and the role ladder's overprints and drops on these kinds are gone except
where a page is over capacity (below).

**Over capacity.** Some slides cannot hold their chart at the floors on one page: a quadrant of eight long names under a
two-line subtitle at 4:5 or square, a ten-risk register at square, a risk matrix with three authored notes at square.
`main` prints them below the floor; the ladder printed them at size with overprints. The kernel draws them whole and
lets the page scale the drawing (`data-chart-form="over"`), by 11% to 29%. The design's next give, continuing onto a
second page, is not built: pages split upstream of the chart (the structural split), so it is engine work. Section 9
puts it to the owner.

**The box.** The dispatch estimated the chart box from shares of the box measured at mobile, which ran 4-11% over or
under elsewhere (a two-line subtitle at 4:5, a code block before the chart, a lifted `@callout` line read as a caption).
A kind on the kernel now takes it in page px (`formBoxPx`): the measured body per size, less an eyebrow line, each extra
title line, a subtitle or caption by its length, and any code block. Every pilot slide that fits prints within 1% of
its role size; the estimate errs short, never tall, since a box estimated tall prints the text small. Callout markers'
digits and lane digits hold the glyph role (11pt) on a phone page.

**Found, not this kernel's.** `examples/chart-lead-blocks.md` page 2 (a bar under a code block) reports OVERFLOW at
mobile and 4:5 on the branch before the kernel too; `main` does not. It is owed a fix before this PR's merge ask.

## 9. Open for the owner (2026-11-10)

1. The measurer: the table (recommended), on the § 8 evidence.
2. Over capacity: build "continue onto the next page" for charts (recommended, before the remaining 25 kinds move), or
   keep the scaled drawing, or let names drop.
3. The pilot at mobile, story, 4:5 and square, light and dark.
4. Landscape: the kernel does not run on 16:9 yet. Each pilot gallery's 16:9 chart markup is byte-identical to the
   branch before the kernel, and differs from `main` only by #3088's `data-series-name` attributes (no geometry, no text).

## 10. Decided by the owner on the pilot (2026-11-10)

1. **Measurer:** the per-glyph table. It is pinned to the woff2 bytes it was measured from, and re-measured on demand,
   as `GLYPH_UPPER` is (svg-label.js); the bake-off switch is removed.
2. **Over capacity:** keep the scaled drawing. A chart the floors cannot hold on one page is drawn whole and the page
   scales it (`data-chart-form="over"`); nothing is dropped or printed over another. Continuation onto a second page is
   not built.
3. **The pilot is signed off.** The other 25 kinds move through the kernel one per commit, each swept at all five sizes
   against `main`.
4. **Landscape** moves after every kind is on the kernel at the phone sizes, in one pass, with a before/after sign-off.

## 11. The rollout, kind by kind (status 2026-11-10)

**The box under a `meta:` line.** A deck's `meta:` Tile docks in the masthead after the chart is drawn, so the dispatch
cannot see it in the slide. The engine passes its line count to the chart frame, which hands it to `formBoxPx` and stamps
it on the section (`data-meta-lines`) for the runtime's redraw to read. On a tall page each line takes 48px off the box;
at square it docks beside the title, which drops the masthead 6px and narrows the title to about 36 characters a line.
Before this, a short-titled chart in one of the 26 decks that set `meta:` printed at 10.4 to 10.7pt.

**The box at a venue.** `venue:` sets the deck's type `--fs-scale` (1.15 at huddle, 1.3 at conference, 1.5 at hall;
`base.modifiers.css`), and on a phone page that reaches the title too: at hall a 30-character title runs three 137px lines
where it ran two 92px lines. `formBoxPx` takes the scale (`VENUE_SCALE`, read from the section's venue class) and costs
every line above and below the chart v times its px, at 1/v the characters a line; the two title lines and the page number
the base already holds grow with it. Before this, every kernel chart on `examples/chart-text-venue.md` printed at 9.1 to
10.4pt on a phone page, and one at 1.3pt.

**The title's lines.** A tall page's base holds two title lines, and the estimate counted one more per 48 characters,
so a 68-character title came out on three lines where it set on four, and its chart drew 90px taller than its body. It now
breaks the title at spaces by rough glyph widths (a space, a stop or a thin letter is half a character; t, f and r three
quarters; a wide letter or a dash 1.4): 22.5 widths a line on a tall page and 25.5 beside a meta line at square, the
widths at which every measured title (eleven tall, five square) sets on its real line count. The glyph table stays out of
the startup engine, so this is an estimate. A sketch deck's display face is narrower and is not modeled: its long titles
count a line more than they set, which leaves its chart a little short (`hub-spoke-sketch.md` p5 at 4:5, 10pt, over
capacity). Across every deck that draws a kind on the kernel at the four phone sizes, the pages under 11pt fell from 194
to 140.

**The box rides on the drawing.** The fluid runtime trusts an exported chart only when it can draw it again from
the bare list (`lib/runtime/chart-redraw.js` `verified`), and the bare list has none of the blocks a phone chart's box
is estimated from. A drawing the kernel laid out carries its box in page px (`data-form-box="972 1474"`), and the check
draws in that box (`transformChartSection`'s `opts.formBoxPx`). #3088's rule that a portrait chart under a taller header
keeps the fixed 320 x 300 canvas (`fitsMeasuredBox`) reached only kinds that are on the kernel now, which take that
header off their box instead; `test/unit/components/tall-canvas-guard.test.js` pins the kernel's version and keeps the
rule's invariant (no smaller type than the fixed canvas) for every kind it covered.

**No box shorter than a chart.** The estimate never goes under a third of the body's width (340px). A page whose blocks
leave less (that deck's p8 at 4:5, a long source line at hall: 72px of body) draws the chart whole at that height and the
page scales it into what is left, as over capacity; squeezed into the sliver, its names printed over each other. One other
page in the example decks reaches the floor: `chart-lead-blocks.md` p2 at 4:5 and square, where the estimate overcounts
the code block and the chart now takes the room it had.

**The box at `claim-hero` and `claim-bleed`.** Pie and radar take a full-bleed body at hero and bleed
(`chart-family.styles.css`): narrower than 972px (833 to 902px, the caption band's rail beside it) and taller, with the
eyebrow taking no height. A kind on the kernel says so in its manifest (`kernel.formHero: true`; the pie today, radar when it moves), and the dispatch reads that box from its own table (`HERO_PX`) and draws on a canvas as narrow as
the body, at the same px per unit, so the role sizes hold. The stylesheet used to size a hero pie or hub-spoke by
`38cqi`, a landscape measure that held it to 410px on a phone page (the key at 3.5pt on `main`); on a page with an
orientation stamp it now fills its chart body.

Each kind is checked at mobile, story, 4:5 and square against `main` on two bars: no new overprint, drop, overflow or
clip in its gallery and the example decks that draw it; and no chart text under 11pt (measured in Chromium per page,
`.scratch/minsize.mjs`; the CLI's TYPE FLOOR warning fires only under 5.4pt, so it cannot see this bar). Over capacity is
the owner's scaled drawing (§ 10).

| Kind | On the kernel | Notes |
|---|---|---|
| bar, quadrant, risk-matrix | yes (pilot) | signed off. Quadrant's numbered form grows its box up to 2.5 times when it is over capacity, as every kind does (1.6 left a short box to drop seven names); a cohort chart beside its key names every cohort on the plane or none; a numbered key's markers take each item's group color (they matched by identity on copies and all took the first group's); a bubble plane under a numbered key stays at least 45% as tall as it is wide, and moves its quadrant names out past its largest bubbles, or the chart goes over capacity (the gallery's p3 at square: a 65-unit plane with the 4.1 bubble printed over STRATEGIC BETS) |
| line, scatter, ep-curve | yes | the generic path, plus over capacity in the dispatch for a kind that does not place itself: a drawing that drops a name at its box is drawn again on a canvas 10% larger each way, up to 2.5 times, until every name prints, and the page scales it (`chart-phone.js`). On the kernel a scatter name counts as dropped when its leader has no clear corridor to a dot that stands alone, or when it hangs past the drawing's edge (`label-attribution.md` p5 at square: "Keystone" was dropped, then printed two rows from its dot, then cut at the top) |
| bullet | yes | the shared axis band holds its ticks at their role |
| funnel | yes | fills its box; a narrow band takes its callout marker beside |
| hub-spoke | yes | fills its box; names whole; an unplaceable figure draws on a larger stage, scaled |
| piechart | yes | disc and key arranged by the kernel; key steps 13 to 11pt; long-tail slides over capacity |
| tower | yes | the key is a kernel tile at the key role, the tower drawn in the cell left; with notes it keeps its own layout, which overprints on story, 4:5 and square as it did before the kernel |
| radar | yes | the 300-unit diagram is drawn at type scale 1/k and scaled by k, so its rim labels print at their role and the side pads, measured from the labels, come out in fixed canvas units; ring figures thin to every other ring when they crowd; small multiples draw in one grid; with notes it keeps its own layout |
| map | yes | the basemap is the plot at its own aspect, scaled into the cell (its regions carry no text); the key a kernel tile, in columns when grouped (a heading starts a group); with notes it keeps its own layout |
| stacked-bar | yes | the row form's name column wraps names at spaces (bar's rule); a keyed stack's key is a kernel tile under a heading that names the bar its values read; the direct-name column comes off the canvas, and names reflow to a key when the totals no longer fit their bars; a column's plot is never narrower than sets every total whole over its bar (a key beside a two-bar plot cut `USD 46M` to `USD…`, `reinsurance-renewal.md` p20 at square), so that arrangement gives way to the key under |
| heatmap | yes | the row-name column sets every name whole on the lines its row holds (bar's rule, not traded against a cell's number); a band key is a kernel tile; a grid whose names or numbers do not all print whole at 11pt (twelve columns) is laid out on the least larger box, 10% at a time, and scaled (over capacity); with notes it keeps its own layout |
| histogram | yes | a value is measured off its face; a chart whose values cannot all print at 12pt (twelve narrow bands) is laid out on the least larger box and scaled (over capacity), the placement run dry first; with notes it keeps its own layout |
| waterfall | yes | step names take the first form that sets every one whole (one row on two lines; two staggered rows on one line; two staggered rows on two lines), never cut to a stub; when none does, the walk is laid out on the least larger box and scaled (over capacity); with notes it keeps its own layout |
| word-cloud | to do | size holds; names dropped vs `main` (`chart-explain-narration.md` p4 to p6 at square, `chart-finishes.md` p9, `data-viz-gallery.md` p33) |
| gantt | yes | lane names above their bars on the full width at every phone shape; every band sized from the role size of the text it holds (a bar 1.5 times its caption's size). A caption goes inside its bar, else after it in clear space on its row, else on its own one or two lines above the bar, set whole; a name no width holds draws the chart on a canvas 10% wider at a time and scales it (over capacity), and the stylesheet lets a placed drawing meet its box where the landscape canvas overflows and is reported. The status key runs onto as many centered rows as it needs. With notes it draws on the kernel too, the notes under the finished figure |
| state-chart | fitted, not on the kernel | an HTML machine the browser lays out and scales by k into its box, with the type floor raised by 1/k (Trama's pipeline), so its names print at 11pt by construction; there is no canvas to place. Two defects showed once the ladder's floor made k small, both fixed: a tile's padding and wrap width were in cqi and did not grow with its name, so a step number sat on the name (they are in multiples of the name's size on a phone page now, as an edge label's padding is); and the measured lines broke after a hyphen (`Counter-` over `signature`) while the painted line did not, so a name ran past its tile (Trama's `textLines` now reads a word in pieces that end at a hyphen, the same breaks the browser took). Authored notes still set at 18 units at most, under the floor once k is small (`callouts-schedule.md` p5 at 4:5 and square, 5.2pt): owed with the other charts with notes |
| slope | to do | cuts two names (`callouts-points.md` p6) |
| roadmap | responsive, not on the kernel | an HTML grid. On a portrait page the kernel picks the phase cards (as on `main`); below about 70 characters a line (`@container lattice (width < 34em)`, #2988's text-room threshold) they stack in one full-width column at their natural height, each workstream on its own full-width row. A square page keeps the table. Page breaks are not this branch's: the split stays one card a page, as on `main`, until #2988's measured split packs them (`followups.d/3131-p2-kanban-roadmap-pack-pages.md`; the bake-off that settled it is there) |
| timeline-list | to do | overflows `chart-hue-collapse.md` p3 at 4:5 |
| matrix-grid | to do | holds both bars; floats small at mobile |
| *kinds already moved, in the example decks* | fixed | swept for the 11pt bar after the galleries: ep-curve's point values had no role on the phone ladder (7.3pt); a caption costs more than a subtitle (110px plus 48px a line, 80 plus 35 at square); a meta line at square narrows the eyebrow to 35 characters. Then a second pass over every example deck's phone pages: a column bar chart's ticks had no role either (6.4pt); a title at square wraps past about 38 characters, not 41; and every lead block after the subtitle (a paragraph or quote, 75px a line at about 44 characters; a table, about 80px a row) now comes off the box, where only the first paragraph did. A subtitle runs 80px a line at about 38 characters (52px at about 66, and an 11px gap, at square) and a caption about 36 characters a line; an eyebrow above an axis spec is counted. After that pass every page under 11pt on a kind already moved is either over capacity (43 pages across the example decks at the four phone sizes, the owner's scaled drawing; the worst a three-mini radar grid with a two-line title and a three-line caption on a square page, 6.5pt) or a chart with authored notes, which keeps its own layout for now (10 pages). `risk-matrix.md` p3 at square stays over capacity (9.8pt, the owner's scaled drawing) |
| kanban | responsive, not on the kernel | an HTML board. Below about 70 characters a line (`@container lattice (width < 34em)`) the lanes stack full width, every card the same shape (its title, then its label and status on the row under it), at its natural height; a tinted lane sits inside the page, and a card's text keeps half its size clear of the lane's edge bar. Page breaks stay one lane a page, as on `main`, until #2988's measured split packs them (`followups.d/3131-p2-kanban-roadmap-pack-pages.md`) |
| journey, progress, flowchart | to do | HTML or self-sized kinds: hold both bars, except progress, whose values and badges at their role overflow `carbone-curation.md` p8 at 4:5; journey splits into near-empty pages |
