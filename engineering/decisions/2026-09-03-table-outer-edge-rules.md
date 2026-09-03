---
status: shipped
summary: >
  A table's last row drew a `border-bottom` like every other row, so the final hairline was
  the table's outer BOTTOM EDGE — and it landed on whatever the stage put under it. Measured
  in Chromium: 25.5px above `.below-note::before` on compare-table, statute-stack.lane and a
  stage-filling plain table, 25.0px on obligation-matrix, 9.0px above `.chart-caption::before`
  on roadmap. Two near-parallel rules that close together read as one thick doubled line
  rather than two boundaries. Fixed by clearing the rule on the table's VISUALLY
  last row — the footer's last row when a `<tfoot>` exists at all, the last `<tbody>`'s
  otherwise — wherever that border is a ROW SEPARATOR rather than structure. A separator
  earns its place between rows, and
  under the last one it separates the table from the slide, which is the chrome's job.
  ROADMAP IS DELIBERATELY EXCLUDED: its `td` border is grid structure, not a separator, so
  dropping it leaves the column verticals dangling and the last row with no floor (rendered
  and rejected); its 9px collision is a chart-caption clearance question and stays open.
  The reframe that decided it: the TOP was never doubled. The masthead hairline and the
  thead `--spectrum-structure` bar sit 54-56px apart with the column heads between them —
  a bracketed header band. The bottom pairs sit 9-25px apart with nothing between them.
  Four richer options were rendered and rejected — dropping the thead bar costs the header
  on the four owners with no zebra; suppressing the masthead hairline or the note hairline
  instead makes the best single slide but couples global slide chrome to the presence of a
  `<table>` and changes the heading treatment mid-deck. That look is already available to
  authors as `rule: none`, which needs no engine change.
---

# The last row draws no rule

**The table's outer bottom edge was colliding with the slide's own chrome.** Every `td`
in the engine's table treatments carries `border-bottom: 1px solid var(--border)`. Between
rows that is a separator doing its job. Under the *last* row it stops being a separator and
becomes the table's outer edge — and the stage already draws a boundary right below it.

## What was measured

Rendered through `lattice-emulator.js` at design size, geometry read from Chromium
(`getBoundingClientRect` plus the computed pseudo-element boxes), clearance = gap between
the last table rule and the next rule under it.

| Surface | Rule under the table | Before | After |
| --- | --- | ---: | ---: |
| roadmap | `.chart-caption::before` | **9.0px** | 9.0px — excluded, see below |
| obligation-matrix | `.below-note::before` | **25.0px** | 133.7px |
| statute-stack.lane | `.below-note::before` | **25.5px** | 135.2px |
| compare-table | `.below-note::before` | **25.5px** | 133.5px |
| plain table, stage-filling | `.below-note::before` | **25.5px** | 133.5px |
| plain table, natural height | `.below-note::before` | 249.3px | 285.2px |
| glossary | — | no bottom rule | unchanged |
| math.derivation | — | already cleared | unchanged |

The last two rows are the precedent, not an exception: `glossary` sets
`border-bottom: none` on its cells outright and `math.derivation` clears
`tbody tr:last-child`. Both were already free of the collision. This brings the rest of
the family to where those two already were.

## The top was never the problem

The complaint that started this was "the table has a top and bottom border, and it doubles
the masthead divider." The measurement says otherwise, and the distinction decided the fix.

- The `<table>` element carries **no border at all** in the default finish — `border-top`
  and `border-bottom` both compute to `0px` on every table owner. What reads as an edge is
  the `thead tr` `--spectrum-structure` bar at the top and the last row's `td` hairline at
  the bottom. (`finish: sketch` is the exception: it gives the table its own 2px frame,
  `base.sketch.css`.)
- The masthead hairline and the thead bar sit **54-56px apart with the column heads
  between them**. That is a header band bracketed top and bottom, which is what a header
  band is supposed to look like. On roadmap the same gap is 165.5px.
- The bottom pairs sit **9-25px apart with nothing between them but white**. That is the
  double.

A rule pair is doubled when nothing sits between the two lines, not merely when two lines
are near each other.

## What was rejected, and why

Every option below was rendered on compare-table (no zebra, fills the stage) and on a plain
content table (zebra, natural height), with the masthead hairline and a below-note present
on both.

**Drop the thead bar.** Opens the top, which was not the problem, and costs the header on
the four owners with no zebra to carry the body — compare-table, statute-stack.lane,
roadmap, and any plain table under `table-plain`. On those, the column heads stop reading
as heads and become a first row set in small caps. It also strips a signature the block
header documents as unanimous across six components.

**Drop both the thead bar and the last row's rule.** The literal reading of the original
request. Fixes the collision, but pays the header cost above on the same four owners. Fine
on a zebra table, where the row wash separates heads from data; that is not most of them.

**Keep both table rules, suppress the masthead hairline and the note hairline on table
slides instead.** This makes the best single slide of anything tried — the table becomes
the only ruled object on the page, bounded top and bottom, and every table slide measures
exactly four rules with a 35.4px minimum gap. It was rejected on system properties, not
looks:

- it makes the heading treatment change mid-deck, since a slide with a table would carry
  no masthead hairline and the prose slide next to it would;
- `:has(table)` also fires on the generated tables that roadmap and matrix-grid wrap in a
  figure, whose top clearance (165.5px measured) was never doubled;
- the note loses the hairline that marks it as a note rather than another paragraph;
- it changes three cross-cutting chrome surfaces conditionally on page content, instead of
  four declarations inside table CSS.

**The same, deck-wide.** Consistent, and worse: with the hairline off everywhere, a prose
slide's title runs into its bullets with about 40px and no separator. The heading rule
earns its place on a prose slide; it is only redundant beside a table that supplies its own
top edge.

That look remains available and needs no engine change: **`rule: none`** is a shipped
front-matter register (`base.accent-finish.css`). An author who wants the bounded-table
composition sets it per deck or per slide. That keeps the choice with the author instead of
inferring it from the presence of a `<table>`.

## Why roadmap is excluded

Roadmap's `td` carries `border-bottom` **and** `border-left` — its cells form a closed grid
inside a chart frame, not a list of rule-separated rows. Rendering it with the last row's
rule cleared leaves the column verticals dangling past the final row and the last row's fill
with no floor: worse than the 9px it would fix.

Its collision is real and stays open. The fix belongs to `.chart-caption`'s clearance in
`lib/components/chart/_chart-family/chart-family.css`, which is every chart component's
caption, not table-edge styling — off the path of this change under HARD RULE #18, recorded
here rather than pulled into the diff.

## What an independent checker caught

The first cut of this change shipped none of the following, and no gate saw any of it —
`build:check`, the 8000-test unit suite and `lint` were all green with two live
regressions in the tree. A maker-checker pass on the rendered slides found them
(HARD RULE #25). Recording them because the *pattern* is the lesson: the diff was
verified on the four surfaces it set out to change, and every defect was on a surface it
did not think to look at.

**Two regressions the change itself created** — HARD RULE #18, fixed before merge, not
filed:

- **`obligation-matrix.asymmetric`.** That variant renders each cell as a card
  (`border` + `border-radius`, `base.modifiers.css`), and the new rule outranked it at
  (0,2,4) vs (0,2,2). The last row's cards rendered open along the bottom — rounded top
  corners, no floor, and the first-column card lost its accent edge. It ships in two
  committed galleries.
- **`obligation-matrix.heat`.** `.heat` runs a 6px double side rail down the first and
  last cell of every row; the last row's `border-bottom` is what closed that bracket. It
  ran to the last row and stopped in mid-air.

Both are the exact criterion this note already used to exclude `roadmap` — a cell border
that is STRUCTURE rather than a row separator — applied to variants that were never
examined. Both are now exempt by selector.

**The selector was targeting the wrong row.** `tbody tr:last-child` is the last row of
*each* body group, not the table's last row. With a `<tfoot>` it cleared an interior
separator while the footer still drew the outer edge — so the collision survived, exactly
inverted. With two `<tbody>` groups it deleted the rule between them. Measured, both
cases. Now `> :last-child > tr:last-child`, the last row of the last group. No shipped
deck hits either shape today; the selector was simply wrong.

**`finish: sketch` still drew the edge.** Under sketch the crisp border is turned
transparent and a 7px masked wave strip on `td::after` *is* the row rule. The
`:last-child { display: none }` escape beside it existed only for `list-tabular`, so
clearing the border alone left sketch drawing the last row's outer edge — and this note,
the commit message and `base.docs.md` all said flatly that the last row draws no rule.
The escape now covers the two table components, so the claim is true on that surface too.

## Known residual

A cell carrying `rowspan` that reaches into the last row belongs to an earlier row, so it
keeps its `border-bottom` and draws a partial hairline under one column while the rest of
the last row has none. Expressing "the visually last row, including cells spanning into it"
is not available in CSS at a cost worth paying here, and **markdown cannot emit `rowspan`** —
it takes hand-written HTML in a deck to reach it. Recorded rather than fixed.

## Scope

`lib/base/base.elements.css` (universal table, carrying the full deny guard like every rule
in that block — `checkUniversalTableGuard`), `base.sketch.css` (the wave-strip escape),
`compare-table`, `obligation-matrix` (excluding `.heat` and `.asymmetric`),
`statute-stack.lane`. `glossary` and `math.derivation` already did it; `roadmap`,
`matrix-grid`, `.heat` and `.asymmetric` are untouched by design.
