---
status: in-progress
summary: >
  A table that runs out of width changes shape instead of squeezing. Nine kinds of table, five narrow
  layouts; a kernel (lib/core/table-shape.js) names each table's kind from which way its values line up,
  and base.table-reflow.css switches inside a container query on the table's own box. Every kind now has its
  narrow layout: row → card, label above value, labels plus a run of columns, one block per option, two-line
  rows, one block per column. The block layouts regroup cells with CSS `order` and copy no markup. Detection
  won a bake-off on 225 independently labeled tables (83% right layout, against 43% for none). Switch widths
  are deliberately low, because a slide has a fixed height and every narrow layout is taller than its table.
---

# Responsive tables: name the kind, then change the shape (2026-11-03)

**Answer.** When a table's box gets too narrow, the right new shape depends on what the reader does
with the table. So the engine first names the table's kind, then lays it out for that kind:

| Kind | Example | Narrow layout | Layout (class) | Shipped |
|---|---|---|---|---|
| Record list | Name · Role · Location | each row becomes a card | `cards` | first change |
| Prose register | Risk · Impact · Mitigation | card with labeled paragraphs | `cards` | first change |
| Key–value | Spec · Value | label above value | `pairs` | first change |
| Measure over time | Revenue × Q1–Q4 | labels + a run of two columns; one at the narrowest | `runs` | second change |
| Option comparison | Plans A/B/C × criteria | labels + one option per block | `options` | second change |
| Cross-tab | Region × Product | labels + a run of two columns; one at the narrowest | `runs` | second change |
| Independent lists | Strengths · Weaknesses · Risks | one block per column (author's `table-lists`) | `lists` | second change |
| Ranked list | Rank · Account · ARR | two-line row | `ranked` | second change |
| Schedule | Date · Milestone · Owner | two-line row, date on top | `schedule` | second change |

The design of all nine was prototyped and reviewed in the Frame Lab (`npm run lab:build`, the `table-types`
entry); the engine follows that prototype, with the differences named under "The block layouts" below.

## Why the kind matters

A record list is read one row at a time, so turning each row into a card loses nothing. A quarterly table is
read along each row and down each column at once; turned into cards, the reader can no longer compare Q2
across metrics. A two-column spec sheet is read in pairs. One reshape for every table, which is what the
split system's portrait cover-cards does (`carousel.js`), is right for the first kind and wrong for the rest.

## Detection: which way the values line up

Markdown tables carry no type, and authors do not add modifiers. In the corpus below, 38 of 73 deck tables have
no row labels and exactly one carries `no-row-label`. So detection has to work unaided, and an author modifier
only overrides it (`table-cards`, `table-pairs`, `no-table-reflow`).

The signal that does most of the work: in a record table each COLUMN holds one kind of value (all names, all
dates); in an option or metric table each ROW does (all prices, all percentages). `uniformity()` compares the
two, and that decides whether the first column labels the rows. Rules then settle the shapes structure alone
names: two columns, a rank column, a date column, sentence-length cells.

**The bake-off.** An agent labeled 225 tables from the repo before any detector existed
(tools/frame-lab/bakeoff/, `npm run tables:bakeoff`). Scored by the narrow layout each table would get:

| Detector | All 225 | 73 deck tables |
|---|---|---|
| No detection (every table becomes cards) | 43% | 49% |
| Structure only | 74% | 49% |
| Content rules | 75% | 51% |
| Content rules, cautious | 76% | 56% |
| Uniformity + rules (first change) | 82% | 67% |
| + one number format is a cross-tab | 83% | 68% |
| **+ a year column over figures is not a schedule (shipped)** | **83%** | **71%** |

Its misses fall back to cards, which stay readable; it turns one record table into a keep-the-grid shape.
Records (88) and key-value (77) are 73% of the corpus, which is why they are the first two layouts.

**Tried and dropped:** "a text first column over an all-number body is a cross-tab". It catches the lab's
Region × Product table, but it read ten record tables such as `Region | Revenue | Headcount` the same way and
cost four points on decks (67% → 63%).

**Shipped instead, with the cross-tab layout:** the same cue, but only when every body value has ONE number
format (the same currency, decimals and unit: all bare integers, all percentages) and the table has at least
three value columns. A record table's columns each carry their own measure, so `$4.2M` sits beside `120` and
the cue declines. On the corpus it gains two measure-over-time tables (read as cross-tab, the same layout) and
costs one record table (`Function | Plan | Hired | Open`, all integers): 82% → 83%, decks 67% → 68%.

The cue moves tables that were cards into `runs`: 31 in the tracked decks, 30 of them five columns or wider.
A card table that wide switches below 24em, so a run table that wide does too (two columns per block from 20em
to 24em); otherwise those tables would have kept their squeezed grid between 20em and 24em, where they had
been cards (the checker caught a nine-column table clipping at 23em). A cross-tab too wide for the block
layouts (past twelve columns) takes the cards, as before the cue.

**And a schedule needs an item.** `Year | Revenue | Growth` read as a schedule (a time header over dates), and
so would have become two-line rows; the bake-off labels it a record list. A schedule now also needs a body
that is not mostly figures: decks 68% → 71%.

## Where the switch lives: the content area, not a wrapper

A container query needs a container. Making the `<table>` its own container does not work: Chromium computes
`container-type: inline-size` on it, but no query inside it ever matches (measured). Wrapping every table in
a `<div>` would have touched 37 CSS selectors and 8 JS queries that expect `> table`.

The universal treatment (base.elements.css) only styles a table that is a direct child of `.cell-stage` or of
the slide, so the stage already holds exactly the table in question. It becomes the container
(`.cell-stage:has(> table.lat-reflow-*)`), and no selector anywhere changed. An unwrapped slide's own size
container answers instead. Panes come for free: lib/core/pane-css.js twins every `section` rule that reaches
through `.cell-stage`, `@container` blocks included.

**What a container costs.** Inside it, a raw `cqi` measures the stage instead of the slide. Every type and
spacing token is drawn in `--_sec-1cqi`, a px value stamped on the slide, so tokens are unaffected; the sweep
below checks the rest.

## Why the switch widths are low

The first cut switched a card table at 8em per column. In a half pane on a 16:9 slide, a four-column record
table that fit on `main` became three cards, and the slide clipped: a card is taller than the row it replaces,
and a slide has a fixed height. That is a regression this change would have created (HARD RULE #18).

So a table switches only where it genuinely breaks: below 20em (up to four columns), 24em (five or more),
18em (key-value), in `em` of the stage's text. A half pane on a 16:9 slide is about 26em and a full-width
slide about 54em, so neither switches. A narrow pane, a portrait canvas and a phone do. When slides gain a
free height (the fluid work), these numbers can rise.

## The label attribute is `data-lat-col`, not `data-label`

`data-label` is the Guide's mark identity: its mark tier matches a spoken sentence against it, and the set of
files that write it is a gated contract (`SANCTIONED_MARK_IDENTITY`). Stamping it on every table cell would
have fed hundreds of column headers into that matcher. The ownership gate caught it on the first build.

## What this does not do

- **Raw `<table>` HTML is not reflowed.** The markdown-it walker cannot read it, so it marks the slide
  (`data-lat-raw-tables`) and the DOM mirror leaves that slide's unjudged tables alone too: the export and a
  live preview show the same table. (A first cut let the mirror reflow raw tables the engine had not, so a
  Studio preview and the PDF disagreed; the checker caught it.) On the Marp path, where the engine never ran,
  the mirror judges every table, pipe and raw alike.
- **A pane's table follows the pane.** A pane renders with its own classes, so a slide-level override reaches
  it through lib/core/panes.js (as `cards-*` already did), and a pane marker that names its own override
  keeps it.
- **The split system's portrait cover-cards** still runs where it ran.

## Paged and continuous: one layout, two triggers

On a slide, height is fixed, and pure CSS cannot know whether the cards still fit: the checker showed a
record table in a 30% pane turning into cards that clipped. The owner's direction (2026-11-03): a component
must work without jank in both a PAGED host (slides) and a CONTINUOUS one (long-form decks, document
variants, continuous pages). So the narrow layouts are the same in both, and only the trigger differs:

- **Continuous** (`data-lattice-flow="continuous"` on the root): the width alone. The page grows. Today only
  the Frame Lab declares it; a document view will. The fluid view is paged (below).
- **Paged** (everything else, today every export): the width AND a fit check. lib/core/table-reflow-fit.js
  measures each slide whose table switched, with the shared overflow probe, and if the slide now overflows it
  holds that slide's tables in their table form (`lat-reflow-held`). A slide therefore never comes out worse
  than the table form it had before reflow existed. The CLI runs it in the export page before it measures
  overflow (and prints an `ⓘ` line naming the pages); the runtime runs it for live previews.

Measured on a deck with a six-row and a three-row record table, each in a 30% pane: on `main` both slides
clip in table form. With this change the six-row slide is held, so it clips exactly as on `main`; the
three-row slide switches to cards and NO LONGER CLIPS.

What it cannot reach: a plain `.html` deliverable, which the CLI writes before the page renders (the same gap
the guards trim has); a held table is not re-judged if its box later widens in a live preview.

The switch widths stay low (20em, 24em, 18em) in this change. With the fit check in place they could rise,
which would switch more tables on today's slides where the cards fit; that changes existing exports, so it is
a separate, reviewed step.

## The fluid view is a paged host

Follow-up p10 asked the fluid view to declare itself continuous (`data-lattice-flow="continuous"`), so
its tables would reflow on width alone. It must not. lib/base/base.fluid-view.css gives each slide
one screen (`height: 100dvh`, scroll-snap to the next) and keeps `section { overflow: hidden }`, so a
slide still has a fixed height and what does not fit is cut, not pushed below. Declared continuous, the
fit check would skip it and a narrow layout that overflows would stand. The fluid view is a PAGED host
whose page is the phone's screen, and the fit check is exactly what it needs.

What it was missing was the check itself. The fluid viewer's boot (lib/runtime/index.js `boot`) skips the
live-preview transform pass, because the exported DOM is already rendered, and runs only what the fluid view
needs: its controller, the geometry stamps, the overflow watcher. The hold lived in the skipped pass, so a
fluid export never held anything. The fluid controller narrows every slide to the phone after load, a pane's
table switches to cards there, and on `main` a long record table in a 30% pane read one letter per line and
clipped. `scheduleReflowHold` now runs from both branches: after fonts and one frame, and again whenever a slide's box
changes size. A re-judge RELEASES that slide's holds first, then judges the settled size: a hold made at one
size is wrong at another, and a first cut that only ever added holds left all eight narrow tables of
examples/responsive-tables.md held after one phone rotation, where a fresh load holds none (the checker's
repro). The pass waits for the size reports to stop (150 ms) and one frame, judges only the slides that
changed (a pass over a 126-slide deck cost about 200 ms), and watches slides, not the window: the fluid
toggle resizes slides without a window resize, and the pass dispatches a window `resize` for the overflow
watcher. Measured after rotating 390 × 844 → 844 × 390, after widening to 1280 × 800 and after rotating
back: the runtime's holds equal a from-scratch judgment of the layout on screen, slide for slide.

Two stale stamps made a resized slide differ from a fresh load at the same size, and the check judged
the stale layout. The runtime never cleared `data-orientation="portrait"` when a box turned landscape again
(it cleared `data-family` but not this), and it wrote the portrait canvas-scale style (`#lattice-orientation`:
the type scale and the safe-area bands) once and never revised it, so a rotated phone kept a 446px content
area where a fresh load has 518px. `stampOrientation` now clears the stamp and `injectOrientationStyle`
follows the box. Measured in Chromium, WebKit and Gecko, and on WebKit's iPhone 15 Pro profile: after every
rotation or widening the holds equal a fresh load's at that size. A section nested in a slide's content does not set the
scale (it once could: a small landscape box in the last slide stripped the portrait scale from a deck).
test/integration/export/fluid-reflow-hold.test.js pins all three on the real export; it fails on `main`.

**On a phone the fluid view stacks a slide's panes** (third change, closing `followups.d/3021-p13`). The
held table still clipped in that repro: a 30% pane on a 390px phone is about 92px (5em), because the
fluid view kept panes side by side where a paged tall deck splits them into one slide per pane
(lib/core/panes.js `installPaneSplit`). The fluid view cannot re-form slides after the render, so
lib/base/base.fluid-view.css stacks them, each at the full width, behind two gates: the box is tall (the
runtime's `data-orientation` stamp, the boxes the engine would split, cleared when the box turns wide
again) and the screen is at most 40em (640px) wide. Measured on every deck with panes (twelve examples
and two stress decks), the rules below are what it took for no slide to gain a "Content clipped" tag
at 390 × 844, 360 × 640 or 820 × 1180:

- **Phones only.** A portrait tablet stacked too in the first cut, and lost a slide `main` lays out
  cleanly: a 35% pane at 820px is about 258px, enough for a line chart side by side, but stacked, a
  two-per-row stats pane (717px) and the chart could not both fit a 792px stage, and the chart got 11px.
  So a tablet keeps the side-by-side form, and its clip tags are `main`'s, slide for slide.
- **Height follows content, not the ratio.** The ratio was written for width. Split over a phone's
  height, `ratio-30-70` gave a three-row table 167px (clipped) under a short paragraph holding 427px.
  A stacked pane starts at its content's height and the panes share the spare by the ratio. That needs
  the pane to stop containing its block size, so in this form it is an `inline-size` container: its
  width still sets every inline container unit, and a block-axis unit resolves against the slide
  (chart bodies are their own size containers, so their `cqh` units are unaffected).
- **What fills takes the spare, and gives way first.** Beside a chart body or a picture, a text pane
  keeps its content height exactly, neither growing nor shrinking, and the filler takes what is left.
  Shared by the ratio, a text pane got 200px of dead space under three bullets; shrunk alongside a
  filler that has a content height of its own (a Mermaid diagram drawn top-down, 577px), a list pane was
  cut to 72px of its 138px.
- **A picture fills; it does not size its pane.** A paragraph of only pictures (the engine's
  `data-pane-figure`, or a collage's run split by `<br>`) starts at no height: a
  photo's natural height at full width (418px of a 621px stage) had left the other pane 32px short. A
  collage's run of photos (1155px) shares the box, each cropped to its share.
- **A stacked pane is wide.** The engine stamps a narrow pane `data-family` from its authored box (a 35%
  pane is `tall`), and a component rule keyed to it kept the narrow form at 351px. While stacked, the
  runtime (lib/runtime/index.js `stampStackedPanes`, same two gates) sets those stamps aside, so the
  pane reads in the wide form, and puts them back when the slide turns wide or the page prints (print
  lays the page out at the paper's width, where the stack is off, but resizes nothing). Taking the SLIDE's `tall`
  stamp instead was tried and refused: a tall form assumes it owns the whole stage, and a stacked stats
  pane went to 806px. One wide rule needed a stacked arm: progress sizes its label column at 18.75% of
  the slide, 67px on a phone, so stacked it takes up to 40% of the pane.
- **The spine sits between the panes.** pane.css places it from the ratio, which no longer says where
  the first pane ends, so here it is a flex item ordered between them.

Measured on those fourteen decks: "Content clipped" slides go from 4 to 0 at 390 × 844 and from 11 to 0
at 360 × 640, and stay at `main`'s 16, the same slides, at 820 × 1180, in Chromium, WebKit and Firefox
alike. The narrowest pane on responsive-tables slide 2 goes from 92 × 622px to 351 × 264px. test/integration/export/fluid-reflow-hold.test.js pins it on the
real export: a phone stacks and clears the pane stamp, landscape and a portrait tablet keep the panes
side by side with the stamp restored; the hold test now uses a five-column, 14-row table, which still
switches to cards at a phone's full width and overflows as cards. A chart drawn for a wide box still
reads small in a stacked pane, and a diagram drawn for a narrow one stays top-down: both are drawings
made at render time, the chart narrow form of `followups.d/3021-p9-chart-narrow-forms.md`.

**No continuous host exists yet.** The Studio's Read · Article view projects the deck to prose
(`lp-*` markup), not to slides, so it never meets a slide layout. The Frame Lab stays the only host
that declares itself continuous. The follow-up stays open for the document view, the host the
attribute was written for.

## The components that own a table

Four components build or style their own table, so the universal treatment's deny list kept the
reflow away from them. The owner's direction (2026-11-03): every table but a chart's is
responsive, in this change. Each now has a narrow form, on the same two triggers:

| Component | Its table | Narrow form | How |
|---|---|---|---|
| `glossary` | term, definition | the term above its definition (pairs) | its own 17em container rule, beside the existing `strip` rule; the generated table declares `data-lat-reflow="pairs"` so the fit check sees it |
| `obligation-matrix` | one row per obligation | one card per row | the shared cards: it left the deny list |
| `statute-stack lane` | one row per provision | one card per row | the shared cards: it left the deny list |
| `math derivation` | expression, justification | the justification under its step | its own 20em container rule |

`matrix-grid` and `roadmap` stay on the deny list: their table is a grid read in both directions
(cross-tab), the kind this change does not lay out yet. Glossary and derivation keep their own rules
rather than the shared cards because each draws a single, specific narrow form the cards would get
wrong (a term is not a card title; a justification is not a labeled field). Each container rule skips a
held table and a `no-table-reflow` slide. Glossary's older mobile `strip` rule is the exception, on
purpose: it stacks as it always has, whatever the fit check or `no-table-reflow` say, because on a
phone canvas the two columns are the worse form even when the stacked one overflows. (A first cut
let a hold undo it, and the checker measured an overflowing mobile glossary page growing from
4,608px to 19,614px tall, its terms gone. The fit check now also takes back any hold that does not
bring the table form back, and does not report that slide as held.)

Why no slide on a 16:9 deck changes: the pane catalog gives these components a minimum share
(glossary 35%, math 50%, obligation-matrix and statute-stack 65%). Measured at hd in indaco, a 35%
side pane's content area is 17.8em, so glossary switches below 17em rather than the engine's 18em
pairs width (a first cut at 18em stacked that layout; the checker caught it). Math derivation's
narrowest home is the mobile canvas's full-width content area, 20.7em against its 20em switch, in all
fourteen base themes; that margin is thin, and a change to slide padding could close it. They switch
in a continuous host, on a phone-width canvas narrower than today's mobile size, or in a Frame Lab
frame. The obligation-matrix cards needed one fix: markdown's `:---:` writes an inline `text-align:
center` on a cell, which the card would have kept, so each card line is a flex item at `align-self:
flex-start` with `text-align: start`. That fixes a value on one line; a value long enough to wrap
keeps the inline centering on its wrapped lines, as every line did before.

## A card line is a two-cell row

The owner's review of the 360px sheets (2026-11-04) found three kinds of jank inside the cards:
values started wherever their label ended, so the ticks of an obligation-matrix card sat at a
different x on every line; a long label broke mid-label; and a `:---:` column centered its wrapped
lines, so a pill dropped below its label and centered. The owner picked an aligned label column.

- **The line is a table.** Each card cell is `display: table`, its label (`::before`) a
  `table-cell` of a fixed width, and CSS's table fixup wraps everything after the label, text and
  inline markup alike, in ONE anonymous cell. So the value stays whole, starts at the same x on
  every line of every card, and wraps under itself. A span around the value would have done the
  same, but 35 JS readers and 20 CSS rules (obligation-matrix's `td > .state`, `heat`'s
  `td:has(> .state)`) address a cell's children directly; the anonymous cell changes no DOM.
- **The label column is sized from the longest label**, because the label font is mono and a
  character count is a width: lib/core/table-shape.js `labelColumn` stamps `data-lat-labels`, `s`
  (up to 6 characters) or the 10-character default. Past 10 characters the table puts each label
  above its value (`stack`): a 14-character column starved the value into mid-word breaks.
  `table-layout: fixed` holds the label column to that width; in auto layout it grew.
- **Markdown's alignment moves off the inline style.** An inline `text-align` outranks every
  stylesheet rule, so on a table that reflows the engine and the DOM mirror move it to
  `data-lat-align` (`splitAlign`). base.table-reflow.css applies it in table form at (0,2,5), above
  every component rule that aligns these cells, and the card form drops it. A table that keeps its
  shape keeps its inline style.

## Card grids: one shared width rule

The owner's review of the 360px sheets (2026-11-04) found the same squeeze outside tables: the
"When NOT to reach for X" slide (cards-grid, in 77 of 79 galleries) kept two or three cards side by
side at a word per line, and so did verdict-grid, pricing, stats, statute-stack and others. A
scout's read of all 20 card components found the cause: none of them responds to WIDTH. Each lays
its row out at a fixed count, and the only reflow keys on the deck's `data-family` stamp, which
`familyFor(aspect)` (lib/adaptive/families.js) computes from the box's ASPECT. A narrow pane, or a
narrow frame of a wide deck, keeps the wide count. The owner chose (2026-11-04) a width trigger with
one shared rule over patching the aspect rules.

**The contract** (lib/base/base.card-reflow.css; test/unit/css/card-reflow-contract.test.js):

1. The shared sheet makes each card component's content area an inline-size container named
   `lat-cards`, once, and only on a wide or square deck. A tall or strip deck already reflows on its
   aspect, so the width rules stay out of it and its exports keep their forms: a first cut let them
   fire on a portrait canvas, whose content area is narrower than 36em, and the sweep against `main`
   caught pricing, statute-stack, list-steps and q-and-a pages changing there. The name is
   load-bearing: an unnamed query would fall through to the section, which is itself a container.
2. The component drops columns inside `@container lat-cards (width < Nem)` rules through its own column
   variable, at thresholds below a full-width 16:9 content area (about 54em), so a full-width 16:9
   slide never switches. The steps keep a card at least about 11.5em wide: 46em (four across to two),
   36em (three across, or a row of three or more, to one or two), 24em (two across to one).
3. While a narrow form is active it sets `--lat-narrow: 1` on the list, and it skips a list that
   carries `lat-reflow-held`. The fit check (lib/core/table-reflow-fit.js) now reads that marker as
   well as a table's row display, so on a slide a grid whose narrow form overflows is held at its
   authored count, the guarantee tables already had. After a hold, the export page and the runtime
   ask the overflow watcher to look again: it had stamped its "Content clipped" tag on the narrow
   layout, and a held stats pane in examples/panes.md kept the tag for a row it no longer showed.

Where a component already had a single-column form for tall decks, the narrow form IS that form, so a
narrow pane and a phone deck read the same: verdict-grid, pricing, statute-stack, decision, list-steps,
compare-prose, q-and-a, inventory and kpi reuse it. Two take something else on purpose: stats goes two
to a row at the number's own size (its tall form enlarges the numbers, and a narrow box is no reason to
change type), and kpi takes only the layout half of its tall form for the same reason.

**Stacked verdict cards follow the `cards:` register** (third change, closing `followups.d/3031-p1`).
verdict-grid's three one-column rules (portrait orientation, the tall/strip family, the width rule) gave
every card `flex: 1`, so the stack always filled: in a 35% pane on 16:9, center, stretch and top all
filled 93% of the list with identical 135px cards. They now take matrix-2x2's form: `justify-content:
var(--cards-align)`, `flex: var(--cards-grow) 0 var(--cards-basis)`, `min-height: min-content`, and
`nowrap`, so a stack that does not fit overflows where the fit check and the export's warning see it.
Measured after: center leaves 32px above and below, top leaves 63px below, stretch fills 93%.
Stretch needed a second fix. lib/forms/cell/pane/pane.css stamps a pane's register itself (a pane is not
a section) and set only `--cards-align` and `--cards-grow`; with `--cards-basis` unset the new `flex`
was invalid and fell back to `0 1 auto`, so no pane's cards could stretch (matrix-2x2's narrow form had
the same gap). The pane rules now set all four tokens, as base.tokens.css does for a section.
A portrait PAGE does not change: verdict-grid splits one option per portrait page, and the split run's
lone-member rule (base.modifiers.css) makes that card fill the page on purpose. Rendered on this
change and on `main` (verdict-grid and matrix-2x2 galleries and every deck with panes, at hd, portrait
and mobile): 0 of 965 slide images differ. examples/stacked-verdict-register.md shows the four
registers in a narrow pane.

**cards-grid's column count is one variable now**, `--cards-cols`, with `--cards-last` for a last card
alone on its row. That fixed a real bug on the way: the tall/strip single-column rule was (0,3,3) and
`.three` was (0,4,3), so a `three` grid stayed three across on a portrait or mobile deck (50
galleries' anti-pattern slide is one). Setting a variable cannot be out-ranked that way. The owner
approved the visible change (2026-11-04), which then turned out smaller than the cascade suggested: an
exported PDF auto-splits that slide one card per page, so the sweep against `main` found every portrait
page identical. The bug showed only where nothing splits: the live preview, a Marp bundle, the fluid
view.

Three were left as they are, each for a reason: split-compare's row is the section itself, and a
container query cannot restyle the box it measures, but the fluid view re-derives orientation from the
real box, so its portrait rule already fires on a phone; logo-wall's widths come from a JavaScript
packer that reads the family stamp; `inventory editorial` grids the content area itself. statute-stack's
row variants also had a collision: the status pill is pinned to the header's right edge with no space
reserved, so in a narrow card it sat on the label and the citation. Below 24em the header wraps and the
pill returns to the flow; the column cards' header wraps too, so the citation no longer runs off the card.

**A lab caveat, not a slide one.** Making the content area a container does not change type on a slide:
a raw `cqi` already measured the slide's content box, which the content area spans, and in a pane the
pane is the container either way (the pixel sweep against `main` is the evidence). The Frame Lab,
though, emulates "type held at slide size" by making its 1280px deck the container, and the content
area now sits between them, so a component that sizes something in raw `cqi` (kpi's supporting numbers,
team-profile's avatars) shows it shrunk in the lab's held view. A continuous host that holds type would
meet the same raw `cqi`; replacing it is the per-component `--_sec-1cqi` work, not this change.

## The slide frame does not spill; the measurement did

Follow-up p1 said the slide's header or footer ran past its edge at phone width in 69 of 79
components, from the Frame Lab's "Header/footer spill" column. It does not. The lab measured each
text node's own rectangles, and the running footer is deliberately ONE line in a band of fixed
height that ellipsizes (`engineering/decisions/2026-07-27-footer-band-allocation.md`: the band never
grows, so the page number never jumps from slide to slide). The text behind the ellipsis extends
past the edge and is clipped; the lab counted it. Measured at 360px on seven components after the
fix: the chrome column reads 0 everywhere, and a check that every flagged rectangle sat inside a
clipping ancestor found none visible. tools/frame-lab/build.js now measures chrome by what a reader
sees (clipped by the nearest clipping ancestor) and content at its full width, because clipped
content is cut text a reader loses. The footer keeps its ellipsis: wrapping it would bring back
the page-to-page jitter that decision removed.

The corrected scan then found two real content spills at 360px, both a fixed numeral column
starving its text: `list principles` (a counter column 2.5 numerals wide in `roman`) and `kpi
compliance` (a number column at its widest content). Below 24em of the content area each puts the
numeral above its line, through the same shared container.

## Position components keep their meaning when stacked

`matrix-2x2` is a 2×2 where the place IS the meaning: declaration order puts the first card top-left
and the fourth bottom-right, which carries the outcome ring. Squeezed, each quadrant went to a word per
line at 360px; stacked naively, as the tall-deck single column already did, the reader loses which
corner is which. The card title names both poles when the author follows the docs, but the place is
gone.

- **The narrow form is the tall deck's single column, plus a position mark.** It joins the shared card
  contract (`lat-cards`, `--lat-narrow: 1`, skip a held list) and stacks below 24em of the content
  area, the two-across-to-one step. Each stacked card carries a small drawn 2×2 in its top-right corner
  with its own cell in `--accent` and the others in `--border`: drawn with background layers, not a
  typed glyph (HARD RULE #29), split into longhands so a missing token costs one layer, not the mark.
  The tall/strip family form gets the same mark, which is the one visible change on existing decks:
  a portrait or mobile matrix-2x2 slide gains four small marks.
- **A stacked card never shrinks below its content** (`min-height: min-content`, no flex shrink). A
  quadrant cell clips its own overflow (`overflow: hidden`), which the stage probe cannot see, so a
  shrinking stack would have clipped text silently. A stack that does not fit overflows the stage
  instead, and the fit check holds the 2×2.
- **Why no 16:9 slide changes:** the pane catalog gives matrix-2x2 at least half the slide (`side: 50`),
  about 25.4em, above the 24em switch, and the mobile canvas splits panes into slides.

`quadrant` and `risk-matrix` are charts, and they are the chart question, not this one: on a slide the
engine draws each chart for its pane's own size (`cart.viewFor(…, paneView)`) and refuses a pane
narrower than 35% (the pane catalog), so a paged chart is never a shrunk picture of a wide drawing.
What remains is a host whose box changes AFTER the render (the fluid view on a phone, a resizing live
preview), which needs a second drawing. That is the chart section below.

## Side-by-side components get narrow forms

In the Frame Lab, compare-code's pair spilled from a 960px frame, redline's `.split` and `.three-col`
squeezed each column to a word per line by 640px, and split-panel's panels squeezed. Each already had a
stacked form, keyed on the deck's shape: compare-code on `data-family` (square, tall, strip), redline and
split-panel on `data-orientation="portrait"`. The question was which REAL boxes are narrow while those
stamps still say wide.

- **The runtime re-stamps both from the real box.** lib/runtime/index.js derives `data-family` and
  `data-orientation` from each slide's measured aspect, so in the fluid view on a phone all three
  already take their stacked form. The Frame Lab strips both stamps on purpose (it tests what CSS does
  alone), which is why it shows the squeeze: for these three the lab's spill columns describe the lab.
- **A pane is the one narrow box with a wide stamp.** compare-code and split-panel never sit in a pane
  (pane catalog `side: false`); redline does, at half a 16:9 slide or more (`side: 50`, about 27em of
  pane). There a `.three-col` redline gave each column about 8em. So redline gets a width trigger:
  `.split` stacks below 32em and `.three-col` below 40em, with the portrait rule's declarations (old,
  then new, then the rationale list). These numbers sit above the half pane on purpose, unlike the
  card thresholds: two 13em columns of statute prose read badly, where two 13em cards read fine. No
  tracked deck puts a redline in a pane.
- **The grid is the content area, so the query is unnamed.** `.cell-stage` cannot query itself; an
  unnamed `@container` query answers its nearest container: the pane in a pane, the slide (about
  60em on 16:9, never switches) otherwise.
- **The fit check reaches it.** lib/core/table-reflow-fit.js now also looks at a `.cell-stage` for the
  same `--lat-narrow: 1` marker; a stack that would overflow is held (`lat-reflow-held`) as the grid.
- **compare-code and split-panel get no new rule.** A width rule for either would fire only in a box
  no host produces (narrow, wide-stamped, not a pane), and split-panel's portrait form is about twenty
  rules that a second copy would have to track.

## The block layouts copy no markup

The prototype (tools/frame-lab/proto/proto.js) rendered a second and third form of each label-repeating table
beside the first, because CSS cannot copy content. The engine does not, for three reasons: every table would
then carry two copies for a screen reader, the Guide's marks and the fit check to reconcile; the markdown-it
walker and the DOM mirror would both have to build the copies identically (HARD RULE #1); and the fit check
judges an element by its first row's display, which a hidden copy would confuse.

What it does instead:

- **The rows dissolve.** In a block layout the table becomes a grid and its row groups and rows become
  `display: contents`, so every cell is an item of that one grid.
- **`order` regroups the cells by column.** Each column's cells carry `order` equal to the column number
  (twelve rules, outside any query: a table cell is not a flex or grid item, so in table form `order` does
  nothing, and within one row it never reorders because it rises with the column). In the two-per-block form
  columns 2–3 share one `order`, 4–5 the next, and the first of each pair takes the wide track. A wider table
  keeps its table form (`MAX_BLOCK_COLUMNS`, lib/core/table-shape.js).
- **Each value cell prints its row label** from `data-lat-row`, a stamp both render paths write from the row's
  first cell (only for `runs` and `options`), the way a card line prints its column header from `data-lat-col`.
  The header cell of each column titles its block.

Two differences from the prototype follow from that. A total column is not repeated in every block (it would
need a copy), so it is simply the last block. And the recommended option (a bold header) is not moved to the
front: reordering one column needs a per-table rule, and the author's column order already says something.

The ranked and schedule rows need no regrouping: each row becomes a small grid (ranked) or a column (schedule),
as in the prototype. The secondary lines stay at the reading size (`--fs-body`): a narrow box is no reason to
shrink type (engineering/typography.md).

**Independent lists are the author's call.** The corpus holds one, and its columns are as uniform as a record
table's. A cue such as "columns of different lengths" caught two record tables in the corpus and none of the
lists, so detection never names this kind; `table-lists` does.

**Switch widths.** Every new layout switches below 20em (a run table of five or more columns below 24em, as
above), and a run table goes from two columns per block to one
below 15em (an `@container (width >= 15em) and (width < 20em)` range, so the two forms never overlap). A table
in a half pane of a 16:9 slide (about 25em) and on a full-width mobile canvas (about 20.7em) keeps its form.

**A width guard for the label column.** The parent session found the card form starving its values in
the fluid view: a record table in a 30% pane of a 16:9 deck, viewed on a 390px phone, has a stage about 5em
wide, and a fixed 10- or 6-character label column left the value one letter per line. Below 12em (10-character
column), 8em (6-character column) and 10em (an option or run block's row label, a ranked row's figure) every
label now sits above its value, the `stack` form, and a ranked row puts its figure under the name. The 12em
step also fixes the Frame Lab's 360px frame (10.8em), where `LOCATION` and `MITIGATION` columns broke values
mid-word. A 30% pane on a 16:9 slide is 15.3em (measured in indaco), above every step, so no 16:9 slide
changes. A label on a two-line row is an inline-block, so its line breaks between the label and the value
rather than inside the value.

**`matrix-grid` and `roadmap` stay on the deny list.** Both are chart kinds whose table is the chart's data:
matrix-grid wraps its table in its own figure, so the table is not a direct child of the stage these rules
reach, and roadmap rewrites its table in JavaScript (`horizons` transposes it into phase cards, `swimlane`
draws tracks). A per-column regrouping would fight both drawings. Their narrow forms belong with the other
chart kinds (`followups.d/3021-p9-chart-narrow-forms.md`).


**What a screen reader hears.** The card, pair, ranked and schedule forms hide the header row, so its
column headers leave the accessibility tree (6 of the 16 in examples/responsive-tables.md at 390px, in
Chromium and WebKit alike). Each value is not left without its column: the label a narrow line prints
(`data-lat-col`, drawn by `::before`) is part of the cell's accessible name, so the tree reads
`cell "Role Engineering lead"`, `cell "Sector Logistics"`, `cell "Owner Ada"`; the row's first cell is its
title. Keeping the header row in the tree visually hidden instead was tried and dropped: the overflow
probe read its clipped text as lost content, and the fit check then held almost every narrow table.
docs/e2e/table-reflow-preview.spec.ts pins the cell names in Chromium, WebKit and Gecko. Not verified:
a real screen reader's speech.

## Charts: drawn for their box on a slide; the narrow form needs a second drawing

Follow-up p9 said every chart scales like a picture when its box narrows. On a slide that is not so,
and the reason decides what the narrow form has to be.

- **A paged chart is drawn for its own box.** lib/transformers/chart-frame.js hands each kind the
  slide's orientation and, in a pane, the pane's canvas (`paneView`); 16 of the 28 kinds read it
  through `cart.viewFor`, and the pane catalog refuses a pane narrower than each kind can draw in
  (quadrant and risk-matrix 35%, roadmap 65%). A portrait deck gets the portrait drawing. So no slide
  shows a shrunk copy of a wide drawing.
- **The gap is a box that changes AFTER the render.** The fluid view on a phone, a resizing live
  preview and a continuous host all receive a drawing made for the authored box. CSS cannot redraw an
  SVG: the label sizes, tick counts and the key's position are baked into the drawing.
- **The owner's call (2026-11-06, on #3060): redraw on demand, from the chart's own marks.** A second
  drawing per chart in every export was refused: it duplicates markup to save a redraw. So is storing the
  source beside the chart. What made a redraw cheap was a measurement, not an estimate: the runtime the
  export inlines already contains the whole chart family (bundling lib/transformers/chart-family.js on top
  of lib/runtime/index.js adds 47 bytes), so the "runtime carries the chart family, about 3× larger" cost
  in the first analysis was wrong. See §"Charts redraw on demand" below.
- **Shipped here: the continuous-host collapse.**- **Shipped here: the continuous-host collapse.** Six kinds fill a size container (radar, map,
  quadrant, word-cloud, piechart, hub-spoke), and size containment lends the box no height. In a
  continuous host the slide grows to its content, so the body collapsed to 0 and the chart vanished
  (every quadrant, radar and pie chart in the Frame Lab, at every width). In a continuous host their
  body now takes a 16:10 box from its width. No paged host sets the attribute, so no export changes.

## Charts redraw on demand

lib/runtime/chart-redraw.js redraws a chart in the `--fluid` viewer when its box changes the drawing the
kernel would choose, and only then. Nothing is added to the export:

- **The source comes back from the chart's own marks.** A bar records its category and value on each mark
  (`data-label`, `data-value`), its series by hue in key order (`text.chart-key-label`), and each note
  as the `<template class="chart-detail">` beside it. A per-kind READER rebuilds the source list from
  those; a kind with no reader keeps its exported drawing. Single series is "every category has one
  mark", not "one hue": a diverging chart paints by sign.
- **When: only the facts that change the kernel's drawing.** The slide's orientation and aspect (the
  stamps the runtime writes from the slide's box) and, for a pane, whether it is stacked. Nothing the
  chart drew feeds in. The first cut keyed on the chart body's measured size, which follows the SVG just
  drawn, so each redraw changed the key and drew again: a grouped chart walked its viewBox from 494 to
  8814 units and settled at 1px text, and single charts redrew about 100 times on a phone before settling
  (the checker's repro). The fluid boot snapshots each chart before any box changes: its exported nodes (in
  memory, a WeakMap, never in the page) and that key. The geometry pass (`patchSectionGeometry`) asks
  after every resize; the same key does nothing, the exported key puts the exported nodes back, any
  other redraws, once. So a 16:9 desktop's first paint is the export's own drawing; a desktop of another
  aspect (16:10 is stamped `data-aspect=1.60`) gets the kernel's drawing for that aspect, as the engine would
  draw it for a 16:10 deck.
- **What it draws at: the engine's kernel, on a canvas from WIDTHS only.** `transformChartSection`, with a
  canvas in slide chart units (lib/engine/index.js `paneView`'s formula). A whole-slide chart in a
  landscape box takes the engine's own path, no canvas; in a tall or square box, and in a stacked pane,
  the canvas is the chart's width in units at the view's shape (320 × 300 portrait); a side-by-side pane,
  a size container, gives its own box. The unit is the stage's width only: a fluid stage's height follows
  its content, and on the first pass before layout it was near zero, which drew a 1220-unit canvas at 3px.
  The unit includes the slide's type scale (`--canvas-scale`, 2.29 on a 390px phone), so labels print at the
  slide's size, not 8px beside 17px text. The canvas is at least 200 units wide (a four-category chart at
  the full type size broke "Licen ses" mid-word at 140), and one that would shorten a name the export
  printed in full is widened in steps, the kernel's own rule (`wouldShortenALabel`).
- **What a reader cannot carry keeps the exported drawing.** A callout (`@callout`, drawn as the legend
  layer's target and text) and a `_focus` (`lat-focus` / `lat-recede` marks) are not on the marks a reader
  reads, and a redraw dropped both (examples/callouts-bars.md, focus-chart-marks.md). Those charts are
  refused rather than redrawn without them. So is a category the export labeled but could not draw (a
  value that does not parse, `North --5`): it has a label and no bar, so a redraw would drop it and
  renumber the rest (examples/chart-malformed-numbers.md). Two tests catch that, each covering what the
  other misses (the red team's repros): the drawn bars must be numbered without a gap (the export can drop
  an undrawn category's LABEL for space, leaving only the gap), and category labels are counted as
  elements, not as distinct names (two categories named alike, one undrawn, read as one name, and a note
  moved onto the wrong bar). A grouped chart with a note, and a key name the export shortened, keep the
  exported drawing too: neither reads back whole.
- **Red team (2026-11-07).** Hostile labels, values, series names and notes (entity-encoded and raw
  `<img onerror>`, `</svg></template><tspan>`, quotes, backticks, fullwidth lookalikes, record syntax)
  through export and a 390 × 844 redraw: no dialog, no `on*` attribute, no `javascript:` URL, the same set
  of tag names before and after, and every label and value byte-identical. The sink held; the three
  data-correctness breaks it found are the refusals above.
- **Safety (HARD RULE #22).** Values read off the page are decoded strings, so each is escaped before it
  enters the list; the kernel's output is parsed into a detached `<template>` (a sanctioned runtime sink,
  tools/check-ownership.js); a note is never re-serialized, its exported node is moved in. The redrawn
  SVG is named for assistive tech as the engine's post-pass names it.
- **Print.** A browser that fires `beforeprint` and never `afterprint` would leave every redraw off, so
  the print media query turning off ends the print as well. Print lays the page out at the paper's width but resizes nothing, so a chart redrawn for a
  phone would print its tall drawing in a wide box. `beforeprint` puts every exported drawing back and
  `afterprint` judges again, beside the pane stamps' own restore. Measured with a real `page.pdf()` at
  390 × 844 on examples/panes.md: 200 × 180 on screen, the exported 245 × 123 and 472 × 72 in the print,
  200 × 180 again after.

Measured on the bar chart: one redraw is 0.13 ms in the kernel (the bar gallery's eight charts, 200
rounds, Node), and a phone load redraws each chart once (eight body swaps for eight charts, counted from
boot). The inlined runtime grows by 4.6 KB minified (1.6 KB gzipped) across this branch's two runtime
changes (the pane stamps and the redraw); no chart adds a byte. At 390 × 844 the smallest label of every
chart in the bar gallery is 16 to 19px (text box height), the grouped chart's included, and the
examples/panes.md bar panes' 16px, where the export printed 7px; examples/chart-european-numbers.md and
examples/marks.md redraw the same way; the callout, focus and malformed-number charts keep their exported
drawings; a 16:9 desktop shows the export's own drawing on every one; rotating back restores it byte for byte.
test/unit/runtime/chart-redraw.test.js pins the round trips, a forged label and the refusals;
test/integration/export/fluid-chart-redraw.test.js pins the real export: nothing redraws on the desktop,
one redraw per chart on a phone, the focused chart kept, and the byte-for-byte restore (it fails on the
first cut and with the redraw off).

**Bar was the first reader.** The read-back survey (2026-11-06, every chart gallery): bullet, ep-curve,
funnel, heatmap, line, map, piechart, slope, stacked-bar, tower, waterfall, hub-spoke, journey,
matrix-grid and roadmap carry their whole source on their marks; histogram, gantt, scatter, quadrant,
risk-matrix, radar and word-cloud keep part of it only in geometry or the `<desc>` prose; kanban, progress
and timeline-list never change with the box; flowchart and state-chart redraw from their stored model
through their own browser layout.

### The whole-source kinds (2026-11-08)

Every kind the survey found carrying its whole source now has a reader in lib/runtime/chart-readers/, one
file per kind, except two: matrix-grid draws the same HTML grid in every box (its kernel reads no
orientation and no canvas), so there is nothing to redraw; and journey's reader is written but HELD.

- **The oracle is the export itself.** test/unit/runtime/chart-readers.test.js exports each kind's gallery,
  reads every chart back, redraws the list with the kernel at the box the export drew for, and demands the
  same chart body byte for byte (render-scoped ids renumbered). No expectation is hand-written, so a reader
  that drops a category, a value, a series name, a note or a modifier's effect fails on a real deck. Each
  chart is then redrawn for a phone and must show the same valued marks (roadmap, journey and some
  hub-spoke charts carry none, so for them it only proves the phone drawing draws). 107 gallery charts read back whole; two
  are refused and keep their exported drawing, pinned by count in `REFUSED`: bullet's stress slide
  (hand-written `Band` zones carry no value) and roadmap's `horizons` slide (the card form drops the
  workstream column's header, and it draws the same cards in every box).
- **What a reader reads besides the marks.** Where a value is on no mark, a reader takes it from text
  already in the chart body and checks it against the drawing, or refuses. Line and heatmap read the
  screen-reader table the kernel puts in the body; bullet reads the printed target and checks the tick sits
  where that target would put it; hub-spoke picks each spoke's direction so that the kernel's own
  `describe()` reproduces the exported `<desc>`, and refuses unless the whole `<desc>` matches; ep-curve
  infers an axis range from where the extremes sit and refuses any other position.
- **Wording is not a safe signal on its own; the check before trust is.** Some readers refuse on a phrase in
  the kernel's `<desc>` ("past the six-series limit", "Not shown, past the grid"). A phrase that must be
  PRESENT fails safe when reworded; one whose presence means REFUSE does not: reword it and the reader
  accepts, and a redraw of a seven-series line drops the seventh (the inversion lens's repro). None of those
  phrases occurs in a gallery, so the round-trip test cannot see it. So the redraw checks every list before
  it uses one (lib/runtime/chart-redraw.js `verified`): it draws the list at the box the export drew for and
  requires the exported drawing back, byte for byte for a whole-slide chart, and for a pane (whose export
  canvas is not in the page) the same description and the same label and value on every mark; otherwise
  the chart keeps its exported drawing. That is the unit test's oracle, run on every deck in the page, once
  per chart. test/unit/runtime/chart-readers.test.js pins it on every gallery chart and on three lossy lists
  (a dropped category, the seven-series line read as six, a pane value changed).
- **Red team and checker (2026-11-08).** The check refuses every data break the red team found in the
  readers as first written: a grouped `diverging` bar (the tornado: its reader takes a hue for a series,
  and diverging paints hue by sign, so series swapped or values vanished), a slope whose trailing entities
  have one reading each (dropped), a grouped bar with a missing value (categories reordered); each is a unit
  test. What the check cannot see was fixed in the readers: a line's middle category that no dot names and
  the axis did not print, and a heatmap row or column with no values, were named from the screen-reader
  table, whose text went through a tag stripper (`Feb <b>x</b> tail` printed `Feb x tail`); the heatmap now
  reads the painted label and the line refuses. The redraw copies the exported drawing into an INERT
  document before reading it: a copy in the live page loaded an author's raw `<img>` again and re-ran its
  handler on every rotation (18 times after five, now once, at load). A refusal puts the exported drawing
  back rather than leaving another box's redraw on screen, and is remembered for that box. A note's own
  text is left out when counting shortened names. And a PANE keeps its exported drawing when the kernel
  would change its class list: roadmap's `horizons` card styles are scoped to a slide, so a roadmap pane
  redrew as unstyled cards (the checker's repro, now in the integration test).
- **A kernel can change the section's class list with the box.** On a portrait box roadmap adds `horizons`,
  and its card styles apply only under `section.roadmap.horizons`. The redraw applies exactly the kernel's
  class change to the host and undoes it when the exported drawing comes back (and for print); classes
  another pass sets are left alone.
- **No name the export printed whole is shortened.** The widen-until-the-names-fit step now COUNTS
  shortened names: it used to stop at once when the export had shortened one, and the waterfall gallery's
  crowded bridge then shortened three more on a phone. A redraw that still shortens more than the export
  after the widest canvas keeps the exported drawing.
- **Size-container kinds had no height in the fluid view.** Radar, map, quadrant, word-cloud, piechart and
  hub-spoke drew 0px tall in the `--fluid` viewer at every width, a phone and a 1280 × 720 desktop alike
  (base.fluid-view.css holds a slide's stage to its content's height, and size containment lends it none).
  In the fluid view their stage now takes what is left of the slide's height, as on a paged slide, and the
  chart fills it (chart-family.styles.css). A 16:10 box from the width, the continuous host's answer,
  would be the whole viewport on a desktop. Measured bodies: 540 to 717px at 390 × 844, 306 to 456px at 1280 × 720,
  150 to 237px on a landscape phone (844 × 390), each from 0.
- **Journey is held.** Its reader reads all nine gallery journeys back whole, but the kernel's portrait board
  clips in the fluid stage at 390px (labels overlap, the frame's "Content clipped"), which is worse than the
  small exported board. lib/runtime/chart-readers/index.js leaves it out; the round-trip test keeps it tested.
- **Funnel redraws its shape, not its type.** Its kernel switches to the tall geometry on a portrait box but
  reads no canvas, so its labels stay at 9px. Reading the canvas changes the export of every funnel in a
  pane, which needs the owner's sign-off.

At 390 × 844, the smallest label per gallery chart (text box height, main → this branch): line 10 → 16px,
slope 9 → 15, ep-curve 9 → 15, tower 6 → 15, stacked-bar 7–8 → 12–17, waterfall 10 → 10–13, bullet 9 → 15 (its refused stress slide stays 9),
heatmap 6–10 → 11–16, piechart, map and hub-spoke from no drawing (0px tall) to 12–21px, funnel 9 → 9 (its
tall shape), roadmap from a crushed grid to its `horizons` cards. No chart shortens a name the export
printed whole. One read and redraw costs 0.3 to 5 ms per chart in Node and jsdom (hub-spoke 12 ms, its
direction search included), plus one draw at the export's box for the check, once per chart. The inlined
runtime grows by 25.5 KB minified (8.4 KB gzipped) on 1.34 MB; no chart adds a byte to the export.
test/integration/export/fluid-chart-redraw.test.js pins a line, a pie and a roadmap on the real export in
Chromium: each redraws on a phone (the pie in a box it did not have), the roadmap turns to cards, and the
desktop gets every exported drawing and class list back byte for byte.

## What comes next

Recorded as `followups.d/3021-p*.md`, in the order the owner agreed (2026-11-03):

1. Narrow forms for the 28 chart kinds, including the three that take a table as data (heatmap,
   `matrix-grid`, `roadmap`) and the two position charts (quadrant, risk-matrix).

(The table-owning components, the shared card grid and the frame were on this list; all three moved into the
first change, above. The other table kinds' layouts, the position components and the side-by-side components
followed in the second change: see their sections above.)

Each reuses this change's pattern: one narrow layout for both hosts, triggered by width in a continuous
host and by width plus the fit check on a slide.

## Verification

- **No existing deck changes.** Every tracked deck that holds a table (85: examples, baseline decks,
  galleries) rendered through the CLI on this branch and on `main`, at hd, portrait and mobile (255 renders,
  632 tables), then measured in Chromium. No table in the universal treatment switched layout, no table
  or content-area box moved by more than 1px, and the CLI's overflow warnings were identical on both trees.
  On the mobile canvas a full-width content area is about 20.7em, close to the 20em card switch.
- **A half pane on 16:9 is 25.4em** (the checker's measurement, in indaco, a11y-base, onyx, carta and
  concrete), above the 24em switch for five or more columns.
- **Both render paths agree.** The fidelity probe (test/unit/core/marp-fidelity-render.test.js) renders
  three tables through the engine and through the runtime bundle and compares verdicts, roles and labels;
  the checker repeated that on ten further shapes.
- **The demo deck** (examples/responsive-tables.md) renders with no overflow; each slide was looked at.
- **The live preview holds a table the same way.** docs/e2e/table-reflow-preview.spec.ts drives the real
  Studio: a three-row record table in a 30% pane shows as cards, and a six-row one comes back in table form,
  held by the runtime's fit check. It passes in Chromium, WebKit (tablet) and Firefox.
- **The table-owning components are pixel-identical to `main`** on their galleries and the two table
  examples, at hd, portrait and mobile.
- **The second change (the other kinds) moves no existing deck either.** The same 85 decks rendered to HTML
  through the CLI on this branch and on `main` at hd, portrait and mobile (510 renders, 627 tables), measured in
  Chromium: the same 49 tables sit in a narrow form on both trees (glossary's mobile strip and the like), no
  table changed form, and no element of a slide holding a table moved by more than 1px. The only deck that
  differs is examples/responsive-tables.md, which this change edits.
- **The fit check holds every new layout.** A deck with a tall table of each new kind in a 30% pane: the CLI
  held all five slides (`ⓘ … pages 1, 2, 3, 4, 5`), and the one that overflowed in table form overflowed
  identically on `main`.
- **Both render paths agree** on the new stamps: the fidelity probe gained an option, ranked and schedule
  table, and a `table-lists` slide, compared cell by cell (`data-lat-col` and `data-lat-row`).
- **No table switches later than it did.** The 31 tables that went from cards to runs, plus a nine-column
  cross-tab, rendered on both trees with every stage forced to 12–25em (384 checks): no table that was in a
  narrow form on `main` is in table form here, no table clips that did not clip on `main`, and between 20em
  and 24em the same 29 tables are narrow on both.
- **Not verified:** the VS Code Marp preview; the Studio live preview of the new layouts (the e2e spec covers
  the cards only).
