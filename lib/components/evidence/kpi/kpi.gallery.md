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
<!-- _footer: "Stress test · kpi — Four tiles at full word weight." -->

## Four tiles at full word weight.

1. 4
   - the grid's seat count
   - a fifth never renders `Max`
2. 14
   - words per tile, the budget
   - spends the allowance `Budget`
3. 1
   - line per label
   - wrapping ends the scan `Rule`
4. 2
   - slides beat one crowd
   - split past this `Advice`


---

<!-- _class: kpi dark -->
<!-- _footer: "Composition: dark · kpi dark" -->

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

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · kpi" -->

## When NOT to reach for kpi.

- Decorative pills without status semantics
  - The pills read as status, not freeform tags. Status color is assigned by each KPI's row position within the modifier — the engine never reads the pill text — so reserve them for the status vocabulary the position implies (`On plan`, `At risk`, `Breaching`, `Compliant`, `Remediating`). Arbitrary labels land a color that has nothing to do with the words.
- A fifth metric — or a fourth that is not terse
  - The supports divide whatever the title and eyebrow leave them, so count trades against label length. Three is the allowance: a short label plus a target line fits up to a two-line title, with or without an eyebrow. A fourth needs everything terse — one status pill, no eyebrow, a one-line title. A fifth never fits, at any label length. Past that the ledger spills, and the export clips it and names the page — nothing shrinks silently to make room. Split across slides, or use `stats`, which drops the targets and pills and holds more rows.
- Reaching for attention or spotlight to carry four-plus metrics
  - `attention` highlights the metric that needs the room; `spotlight` monumentalizes one number. Both spend the stage on a single tile, so the hierarchy collapses before the geometry does — treat three as the ceiling for these two.
- No targets, no trends
  - If the KPIs carry only current values, the slide is a stats row, not a kpi dashboard. Use stats and reclaim the room.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `stats` — metric row without targets or status pills
- `big-number` — a single number is the whole argument
- `split-panel` — one KPI with a paragraph of supporting prose
- `progress` — completion percentages across parallel workstreams
- `timeline-list` — milestones in time, not metrics at a moment
