---
marp: true
theme: indaco
paginate: true
header: "Lattice · slope"
---

<!-- _class: title silent -->

# slope

`Evidence · Canvas · Series`

Two labeled columns joined by one line per entity, so a change in ranking reads as a crossing.

---

<!-- _class: slope -->
<!-- _footer: "Default · slope" -->

## Kestrel took the lead; Northwind gave it up.

- Northwind `fail`
  - 2023 `31%`
  - 2026 `24%`
- Kestrel Group `live`
  - 2023 `22%`
  - 2026 `29%`
- Vantage
  - 2023 `19%`
  - 2026 `21%`
- Meridian Partners
  - 2023 `17%`
  - 2026 `16%`
- Everyone else
  - 2023 `11%`
  - 2026 `10%`


---

<!-- _class: slope dumbbell -->
<!-- _footer: "Dumbbell · slope dumbbell — The same before/after model as one row per entity: two dots joined by a bar on a shared value axis, with the first point hollow and the last solid." -->

## Every team came in over plan except two.

- Platform
  - Plan `48`
  - Actual `55`
- Payments
  - Plan `52`
  - Actual `44`
- Identity
  - Plan `39`
  - Actual `47`
- Data
  - Plan `61`
  - Actual `59`
- Growth
  - Plan `47`
  - Actual `53`


---

<!-- _class: slope signal -->
<!-- _footer: "Signal · slope signal — Colors each line by direction — rising reads pass, falling reads fail. Opt-in, because the chart cannot know whether up is good news." -->

## Adoption rose everywhere but the two legacy regions.

- APAC
  - 2024 `41%`
  - 2026 `58%`
- North America
  - 2024 `62%`
  - 2026 `71%`
- EMEA North
  - 2024 `55%`
  - 2026 `49%`
- LATAM
  - 2024 `28%`
  - 2026 `44%`
- EMEA South
  - 2024 `47%`
  - 2026 `39%`


---

<!-- _class: slope -->
<!-- stress-slide -->
<!-- _footer: "Stress test · slope — Eight entities with four of them inside 1.2 points of each other at the same date — the label collision a slopegraph lives or dies on." -->

## Eight suppliers, four in a dead heat.

- Atlas
  - 2024 `12`
  - 2026 `19`
- Borealis
  - 2024 `18`
  - 2026 `14`
- Cormorant
  - 2024 `15`
  - 2026 `16`
- Delphinus
  - 2024 `15.4`
  - 2026 `11`
- Equuleus
  - 2024 `15.8`
  - 2026 `17`
- Fornax
  - 2024 `16.2`
  - 2026 `13`
- Grus
  - 2024 `9`
  - 2026 `20`
- Hydra
  - 2024 `20`
  - 2026 `9`


---

<!-- _class: slope dark -->
<!-- _footer: "Composition: dark · slope dark" -->

## Kestrel took the lead; Northwind gave it up.

- Northwind `fail`
  - 2023 `31%`
  - 2026 `24%`
- Kestrel Group `live`
  - 2023 `22%`
  - 2026 `29%`
- Vantage
  - 2023 `19%`
  - 2026 `21%`
- Meridian Partners
  - 2023 `17%`
  - 2026 `16%`
- Everyone else
  - 2023 `11%`
  - 2026 `10%`


---

<!-- _class: slope compact -->
<!-- _footer: "Composition: compact · slope compact" -->

## Kestrel took the lead; Northwind gave it up.

- Northwind `fail`
  - 2023 `31%`
  - 2026 `24%`
- Kestrel Group `live`
  - 2023 `22%`
  - 2026 `29%`
- Vantage
  - 2023 `19%`
  - 2026 `21%`
- Meridian Partners
  - 2023 `17%`
  - 2026 `16%`
- Everyone else
  - 2023 `11%`
  - 2026 `10%`


---

<!-- _class: slope accent -->
<!-- _footer: "Composition: accent · slope accent" -->

## Kestrel took the lead; Northwind gave it up.

- Northwind `fail`
  - 2023 `31%`
  - 2026 `24%`
- Kestrel Group `live`
  - 2023 `22%`
  - 2026 `29%`
- Vantage
  - 2023 `19%`
  - 2026 `21%`
- Meridian Partners
  - 2023 `17%`
  - 2026 `16%`
- Everyone else
  - 2023 `11%`
  - 2026 `10%`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · slope" -->

## When NOT to reach for slope.

- A two-point line chart
  - A two-point `line` chart draws the same two segments, then buries the crossing under a two-tick category axis, a grid and a legend. Three or more points is `line`'s job, not this one's.
- Values that are not on one scale
  - Every entity shares one vertical scale, so a revenue line crossing a headcount line means nothing. One metric per slope; if the metrics differ, use `stats` or one slope each.
- signal on a metric where up is bad
  - Rising unit cost painted green says the opposite of the truth. On cost, churn, cycle time or defects, mark the lines that matter with a status pill and leave the rest neutral.
- Reading a gap against zero
  - The scale is the data's own range, not zero-based — a zero baseline flattens a 60-to-75 slope to nothing. Vertical distance shows change, never proportion.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `line` — three or more points in time — a trend rather than a before/after
- `bar` — one point in time, comparing magnitudes across categories
- `stats` — a row of headline figures with no ranking relationship between them
- `big-number` — one entity's change is the whole story
- `piechart` — the claim is share of a whole at one moment, not movement between two
- `progress` — attainment against a target per metric, with no before state
