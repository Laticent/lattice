---
marp: true
theme: indaco
pagination: true
header: "Lattice · kpi"
---

<!-- @meta{layout=title, class=silent} -->

# kpi

`Evidence · Ledger · Structure`

Executive KPI system — one base, five layout modifiers.

---

<!-- _class: kpi -->
<!-- @meta{footer=Default · kpi} -->

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `{On plan}`
2. 8
   - words per tile
   - soft budget `{Board}`
3. 5s
   - scan time
   - the target `{On plan}`
4. 0
   - prose sentences
   - allowed here `{Audit}`


---

<!-- _class: kpi attention -->
<!-- @meta{footer="attention · kpi attention — Flags the tile that misses."} -->

## attention flags the tile that misses.

1. 1
   - tile flagged
   - the miss `{Attention}`
2. 3
   - tiles steady
   - for context `{On plan}`
3. 0
   - alarms hidden
   - honesty `{Board}`
4. 4
   - tiles total
   - the row `{On plan}`


---

<!-- _class: kpi ops -->
<!-- @meta{footer="ops · kpi ops — Reads the tiles against SLOs."} -->

`kpi ops`

## ops reads the tiles against SLOs.

1. 99.9%
   - the SLO frame
   - target line `{SLO}`
2. 4
   - tiles per row
   - unchanged `{On plan}`
3. 1
   - breach shown
   - never hidden `{Ops}`
4. 30d
   - the window
   - rolling `{SLO}`


---

<!-- _class: kpi compliance -->
<!-- @meta{footer="compliance · kpi compliance — Tallies findings per framework."} -->

`kpi compliance`

## compliance tallies findings per framework.

1. 0
   - open findings
   - the goal `{Clean}`
2. 4
   - frameworks tracked
   - one row `{Audit}`
3. 1
   - in remediation
   - dated `{Watch}`


---

<!-- _class: kpi trajectory -->
<!-- @meta{footer="trajectory · kpi trajectory — Pairs each tile with its delta."} -->

`kpi trajectory`

## trajectory pairs each tile with its delta.

1. +9%
   - the delta leads
   - vs plan `{Up}`
2. 4
   - tiles still rule
   - per row `{On plan}`
3. −2
   - down is shown
   - not spun `{Honest}`


---

<!-- _class: kpi spotlight -->
<!-- @meta{footer="spotlight · kpi spotlight — One tile earns double width."} -->

## spotlight gives one tile double width.

1. 1
   - tile promoted
   - the headline `{Spotlight}`
2. 2
   - support tiles
   - beside it `{On plan}`
3. 0
   - competing heroes
   - one only `{Rule}`


---

<!-- _class: kpi -->
<!-- @meta{stress-slide} -->
<!-- @meta{footer="Stress test · kpi — Four tiles at full word weight."} -->

## Four tiles at full word weight.

1. 4
   - the grid's seat count
   - a fifth never renders `{Max}`
2. 14
   - words per tile, the budget
   - spends the allowance `{Budget}`
3. 1
   - line per label
   - wrapping ends the scan `{Rule}`
4. 2
   - slides beat one crowd
   - split past this `{Advice}`


---

<!-- @meta{layout=kpi, class=dark, footer=Composition: dark · kpi dark} -->

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `{On plan}`
2. 8
   - words per tile
   - soft budget `{Board}`
3. 5s
   - scan time
   - the target `{On plan}`
4. 0
   - prose sentences
   - allowed here `{Audit}`


---

<!-- @meta{layout=kpi, class=compact, footer=Composition: compact · kpi compact} -->

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `{On plan}`
2. 8
   - words per tile
   - soft budget `{Board}`
3. 5s
   - scan time
   - the target `{On plan}`
4. 0
   - prose sentences
   - allowed here `{Audit}`


---

<!-- @meta{layout=kpi, class=accent, footer=Composition: accent · kpi accent} -->

## Four tiles the eye sweeps in one pass.

1. 4
   - tiles per row
   - the ceiling `{On plan}`
2. 8
   - words per tile
   - soft budget `{Board}`
3. 5s
   - scan time
   - the target `{On plan}`
4. 0
   - prose sentences
   - allowed here `{Audit}`


---

<!-- @meta{layout=cards-grid, class=claim-hero, footer=Anti-patterns · kpi · 1 of 2} -->

## When NOT to reach for kpi.

- Decorative pills without status semantics
  - The pills read as status, not freeform tags. Status color is assigned by each KPI's row position within the modifier — the engine never reads the pill text — so reserve them for the status vocabulary the position implies (`On plan`, `At risk`, `Breaching`, `Compliant`, `Remediating`). Arbitrary labels land a color that has nothing to do with the words.
- A fifth metric — or a fourth that is not terse
  - Three is the allowance at a wide @size; a fourth needs everything terse — one status pill, no eyebrow, a one-line title. A fifth fits at no label length: the export clips it and names the page. Split across slides, or use `stats`, which drops the targets and pills and holds more rows.

---

<!-- @meta{layout=cards-grid, class=claim-hero, footer=Anti-patterns · kpi · 2 of 2} -->

## When NOT to reach for kpi.

- Reaching for attention or spotlight to carry a fifth metric
  - `attention` highlights the metric that needs the room; `spotlight` monumentalizes one number. Both spend most of the stage on a single tile, so past four the hierarchy they exist to create collapses — split into two slides rather than crowding the hero.
- No targets, no trends
  - If the KPIs carry only current values, the slide is a stats row, not a kpi dashboard. Use stats and reclaim the room.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `stats` — metric row without targets or status pills
- `big-number` — a single number is the whole argument
- `split-panel` — one KPI with a paragraph of supporting prose
- `progress` — completion percentages across parallel workstreams
- `timeline-list` — milestones in time, not metrics at a moment
