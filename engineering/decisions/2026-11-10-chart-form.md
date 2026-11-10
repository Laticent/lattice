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
