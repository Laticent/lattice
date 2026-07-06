---
marp: true
theme: indaco
paginate: true
header: "Lattice · kpi"
---

<!-- _class: title silent -->

# kpi

`Evidence · Ledger · Structure`

Executive KPI system — one base, five layout modifiers.

---

<!-- _class: kpi -->
<!-- _footer: "Default · kpi" -->

`evidence · kpi`

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `On plan`
2. 8
   - words per tile
   - soft budget `Board`
3. 5s
   - scan time
   - the target `On plan`
4. 0
   - prose sentences
   - allowed here `Audit`


---

<!-- _class: kpi attention -->
<!-- _footer: "attention · kpi attention — Flags the tile that misses." -->

`kpi attention`

## attention flags the tile that misses.

1. 1
   - tile flagged
   - the miss `Attention`
2. 3
   - tiles steady
   - for context `On plan`
3. 0
   - alarms hidden
   - honesty `Board`
4. 4
   - tiles total
   - the row `On plan`


---

<!-- _class: kpi ops -->
<!-- _footer: "ops · kpi ops — Reads the tiles against SLOs." -->

`kpi ops`

## ops reads the tiles against SLOs.

1. 99.9%
   - the SLO frame
   - target line `SLO`
2. 4
   - tiles per row
   - unchanged `On plan`
3. 1
   - breach shown
   - never hidden `Ops`
4. 30d
   - the window
   - rolling `SLO`


---

<!-- _class: kpi compliance -->
<!-- _footer: "compliance · kpi compliance — Tallies findings per framework." -->

`kpi compliance`

## compliance tallies findings per framework.

1. 0
   - open findings
   - the goal `Clean`
2. 4
   - frameworks tracked
   - one row `Audit`
3. 1
   - in remediation
   - dated `Watch`


---

<!-- _class: kpi trajectory -->
<!-- _footer: "trajectory · kpi trajectory — Pairs each tile with its delta." -->

`kpi trajectory`

## trajectory pairs each tile with its delta.

1. +9%
   - the delta leads
   - vs plan `Up`
2. 4
   - tiles still rule
   - per row `On plan`
3. −2
   - down is shown
   - not spun `Honest`


---

<!-- _class: kpi spotlight -->
<!-- _footer: "spotlight · kpi spotlight — One tile earns double width." -->

`kpi spotlight`

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

<!-- _class: kpi -->
<!-- stress-slide -->
<!-- _footer: "Stress test · kpi — Four tiles at the fourteen-word line." -->

`kpi · stress`

## Four tiles at full word weight is the ceiling.

1. 4
   - tiles is the grid's seat count
   - a fifth never renders `Max`
2. 14
   - words per tile, the hard budget
   - this tile spends its whole allowance `Budget`
3. 1
   - line per label before wrapping
   - wrapping ends the five-second scan `Rule`
4. 2
   - slides beat one crowded grid
   - split past this point `Advice`


---

<!-- _class: kpi dark -->
<!-- _footer: "Composition: dark · kpi dark" -->

`evidence · kpi`

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `On plan`
2. 8
   - words per tile
   - soft budget `Board`
3. 5s
   - scan time
   - the target `On plan`
4. 0
   - prose sentences
   - allowed here `Audit`


---

<!-- _class: kpi compact -->
<!-- _footer: "Composition: compact · kpi compact" -->

`evidence · kpi`

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `On plan`
2. 8
   - words per tile
   - soft budget `Board`
3. 5s
   - scan time
   - the target `On plan`
4. 0
   - prose sentences
   - allowed here `Audit`


---

<!-- _class: kpi accent -->
<!-- _footer: "Composition: accent · kpi accent" -->

`evidence · kpi`

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `On plan`
2. 8
   - words per tile
   - soft budget `Board`
3. 5s
   - scan time
   - the target `On plan`
4. 0
   - prose sentences
   - allowed here `Audit`


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · kpi" -->

## When NOT to reach for kpi.

- **Decorative pills without status semantics.** The pills read as status, not freeform tags. Status color is assigned by each KPI's row position within the modifier — the engine never reads the pill text — so reserve them for the status vocabulary the position implies (`On plan`, `At risk`, `Breaching`, `Compliant`, `Remediating`). Arbitrary labels land a color that has nothing to do with the words.
- **More than four KPIs in attention or spotlight.** `attention` highlights the metric that needs the room; `spotlight` monumentalizes one number. Past four KPIs the visual hierarchy collapses — split into two slides.
- **No targets, no trends.** If the KPIs carry only current values, the slide is a stats row, not a kpi dashboard. Use stats and reclaim the room.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `stats` — metric row without targets or status pills
- `big-number` — a single number is the whole argument
- `split-panel` — one KPI with a paragraph of supporting prose
- `progress` — completion percentages across parallel workstreams
- `timeline-list` — milestones in time, not metrics at a moment
