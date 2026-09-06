---
marp: true
theme: indaco
paginate: true
header: "Lattice · kpi row rules"
---

<!-- _class: title silent -->

`Feature demo · kpi row rules and the status column`

# A rule between the rows, never around them — and a status column that is actually a column.

Four defects in one component, found by measuring rather than looking. The support rail bracketed itself with heavy outer edges, `compliance` drew a floor under its last row, its status pill declared a column it could never occupy, `spotlight` stranded the hairline that heads each number, and `trajectory` reserved a track its own recommended count never fills.

---

<!-- _class: content -->

## A separator earns its place between two rows.

- The rail used to open with a heavy rule above the first support and close with another below the last. Neither separates anything: they are the ledger's outer edges, and they turned three numbers into a closed table frame.
- `2026-09-03-table-outer-edge-rules.md` retired the same thing across the table family, and `inventory` had already dropped it from its own ledger citing that record. `kpi` never got the pass.
- Interior separators are unchanged — 1px `--border`. The heavy `--text-heading` weight existed only on the two edges now gone.

---

<!-- _class: kpi -->
<!-- _footer: "The briefing rail — dividers between the supports only" -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `On plan` `Board`
2. 42%
   - Gross margin
   - +2pp QoQ `On plan` `Audit`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `On plan` `Investor`

---

<!-- _class: kpi compliance -->
<!-- _footer: "compliance — the status column, and two pills that stay together" -->

## compliance tallies findings per framework.

1. 94%
   - Signal-classification success
   - target 99%, +2pp QoQ `On plan` `Board`
2. 0
   - Open findings
   - the goal `Clean` `Audit`
3. 1
   - In remediation
   - dated `Watch` `Legal`

---

<!-- _class: content -->

## The pill sat one level too deep to be placed.

- The row is a grid; the pill declared `grid-column: 3` and could never take it. The row's list is `display: contents`, so the inner items are the grid items and the pill lives inside one of *those* — a grandchild, which a grid cannot place.
- The declaration resolved and did nothing. The reserved track collapsed to zero and the pill trailed its label, leaving two-thirds of every row empty.
- It is now a grid with one flexible track: the label takes the slack, the pills follow in `max-content` columns. Two pills stay contiguous at the edge instead of one stranding mid-row, and the label wraps under pressure rather than crushing.

---

<!-- _class: kpi spotlight -->
<!-- _footer: "spotlight — every support sits under the rule that heads it" -->

## spotlight gives one tile double width.

1. 1
   - tile promoted
   - the headline `Spotlight`
2. 2
   - support tiles
   - beside it `On plan`
3. 0
   - competing heroes
   - one only `Rule`

---

<!-- _class: kpi trajectory -->
<!-- _footer: "trajectory — three metrics, three columns" -->

## trajectory pairs each tile with its delta.

1. +9%
   - the delta leads
   - vs plan `Up`
2. 4
   - tiles per row
   - the ceiling `On plan`
3. −2
   - down is shown
   - not spun `Honest`

---

<!-- _class: content -->

## What the measurements said, and what they did not.

- **Compliance rows** went from 274.8px of ink to 1026.3px — 17.6% of the row filled to 66.4% — with the pill flush to the row's edge.
- **Spotlight** supports stranded their own hairline 37.3px above the number it introduces. Briefing already fixed this, at one count, explicitly excluding spotlight.
- **Trajectory** reserved a fourth 270px track, 23% of the stage, that a three-metric slide never fills.
- **One number was not a defect.** Trajectory's cards center their content 110.2px below a categorical stripe, which is a card edge rather than a rule heading a number — the same composition `ops` uses. Geometry alone could not tell those two apart.
