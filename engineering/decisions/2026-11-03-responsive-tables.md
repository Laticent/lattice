---
status: in-progress
summary: >
  A table that runs out of width changes shape instead of squeezing. Nine kinds of table, five narrow
  layouts; a kernel (lib/core/table-shape.js) names each table's kind from which way its values line up,
  and base.table-reflow.css switches inside a container query on the table's own box. This first change
  ships the two layouts that cover 73% of real tables: row → card, and label above value. Detection won a
  bake-off on 225 independently labeled tables (82% right layout, against 43% for none). Switch widths are
  deliberately low, because a slide has a fixed height and a card is taller than the row it replaces.
---

# Responsive tables: name the kind, then change the shape (2026-11-03)

**Answer.** When a table's box gets too narrow, the right new shape depends on what the reader does
with the table. So the engine first names the table's kind, then lays it out for that kind:

| Kind | Example | Narrow layout | In this change |
|---|---|---|---|
| Record list | Name · Role · Location | each row becomes a card | **yes** |
| Prose register | Risk · Impact · Mitigation | card with labeled paragraphs | **yes** (same card) |
| Key–value | Spec · Value | label above value | **yes** |
| Measure over time | Revenue × Q1–Q4 | labels + a run of columns | later |
| Option comparison | Plans A/B/C × criteria | labels + one option per block | later |
| Cross-tab | Region × Product | labels + a run of columns | later |
| Independent lists | Strengths · Weaknesses · Risks | one block per column | later |
| Ranked list | Rank · Account · ARR | two-line row | later |
| Schedule | Date · Milestone · Owner | two-line row, date on top | later |

A kind with no layout yet keeps today's table. The design of all nine was prototyped and reviewed in the
Frame Lab (`npm run lab:build`, the `table-types` entry); that prototype is the reference for the later steps.

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
| **Uniformity + rules (shipped)** | **82%** | **67%** |

Its misses fall back to cards, which stay readable; it turns one record table into a keep-the-grid shape.
Records (88) and key-value (77) are 73% of the corpus, which is why they are the first two layouts.

**Tried and dropped:** "a text first column over an all-number body is a cross-tab". It catches the lab's
Region × Product table, but it read ten record tables such as `Region | Revenue | Headcount` the same way and
cost four points on decks (67% → 63%). A cross-tab therefore falls back to cards for now; it gets its own
layout in a later step, when the cue can be tested against that layout.

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
| `glossary` | term, definition | the term above its definition (pairs) | its own 18em container rule, beside the existing `strip` rule; the generated table declares `data-lat-reflow="pairs"` so the fit check sees it |
| `obligation-matrix` | one row per obligation | one card per row | the shared cards: it left the deny list |
| `statute-stack lane` | one row per provision | one card per row | the shared cards: it left the deny list |
| `math derivation` | expression, justification | the justification under its step | its own 20em container rule |

`matrix-grid` and `roadmap` stay on the deny list: their table is a grid read in both directions
(cross-tab), the kind this change does not lay out yet. Glossary and derivation keep their own rules
rather than the shared cards because each draws a single, specific narrow form the cards would get
wrong (a term is not a card title; a justification is not a labeled field). Each skips a held table
and a `no-table-reflow` slide.

Why no slide on a 16:9 deck changes: the pane catalog gives these components a minimum share
(glossary 35%, math 50%, obligation-matrix and statute-stack 65%), so their box never drops below
the switch width on a landscape slide. They switch in a continuous host, on a phone-width canvas
narrower than today's mobile size, or in a Frame Lab frame. The obligation-matrix cards needed one
fix: markdown's `:---:` writes an inline `text-align: center` on a cell, which the card would have
kept, so each card line is a flex item at `align-self: flex-start` with `text-align: start`.

## What comes next

Recorded as `followups.d/3021-p*.md`, in the order the owner agreed (2026-11-03):

1. The slide frame's header, footer and page number wrap when narrow (69 of 79 components spill).
2. One shared wrapping grid for the card and list components (about 20 at once).
3. The other table kinds' layouts (prototyped in tools/frame-lab/proto/), which also reach
   `matrix-grid` and `roadmap`.
4. Refined stacks for components whose meaning is position (matrix-2x2, quadrant, risk-matrix).
5. Narrow forms for side-by-side components (redline, compare-code, split-panel).
6. Narrow forms for the 28 chart kinds, including the three that take a table as data.

(The table-owning components were item 3; they moved into this change, above.)

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
- **Not verified:** the Studio and Playground, the VS Code Marp preview, WebKit and Firefox.
