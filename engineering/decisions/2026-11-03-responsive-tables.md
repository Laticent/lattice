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
  the Frame Lab declares it; the fluid and document views will.
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
