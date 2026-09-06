---
marp: true
theme: indaco
paginate: true
header: "Lattice · bullet"
---

<!-- _class: title silent -->

# bullet

`Evidence · Canvas · Series`

Actual against target inside a qualitative band — one dense row per KPI.

---

<!-- _class: bullet -->
<!-- _footer: "Default · bullet" -->

`Q3 2026 · commercial plan`

## Two of five KPIs cleared the plan line.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
- Services revenue `1.1M` `1.8M`
- Partner-sourced ARR `0.9M` `1.4M`


---

<!-- _class: bullet shared-axis -->
<!-- _footer: "shared-axis · bullet shared-axis — Forces one value axis across every row, even where the kernel would have chosen per-row scales. Use only when the rows really are the same ruler and you want the bars comparable by length." -->

## shared-axis puts every row on one ruler.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`


---

<!-- _class: bullet own-axis -->
<!-- _footer: "own-axis · bullet own-axis — Forces per-row scales, so every target tick lands on one x and the bars are read against the plan line rather than against each other. Use when the rows are different measures that happen to share a unit." -->

## own-axis lines the plan up and lets each row keep its scale.

- Qualified pipeline `128%` `100%`
- Win rate `112%` `100%`
- Ramped reps `96%` `100%`


---

<!-- _class: bullet -->
<!-- stress-slide -->
<!-- _footer: "Stress test · bullet — Seven rows at the ceiling — the longest realistic KPI name, one measure far past every zone, one at zero, and one range authored by hand." -->

## Stress test — seven rows, one runaway, one at zero.

- Net revenue retention, enterprise segment `118%` `112%`
- Gross margin `71%` `68%`
- Support ticket deflection `94%` `62%`
- Onboarding completion `58%` `80%`
- Partner certification coverage `41%` `75%`
- Self-serve conversion `0%` `12%`
- Expansion pipeline coverage `86%` `90%`
  - Band `70%`
  - Band `85%`


---

<!-- _class: bullet dark -->
<!-- _footer: "Composition: dark · bullet dark" -->

`Q3 2026 · commercial plan`

## Two of five KPIs cleared the plan line.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
- Services revenue `1.1M` `1.8M`
- Partner-sourced ARR `0.9M` `1.4M`


---

<!-- _class: bullet compact -->
<!-- _footer: "Composition: compact · bullet compact" -->

`Q3 2026 · commercial plan`

## Two of five KPIs cleared the plan line.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
- Services revenue `1.1M` `1.8M`
- Partner-sourced ARR `0.9M` `1.4M`


---

<!-- _class: bullet accent -->
<!-- _footer: "Composition: accent · bullet accent" -->

`Q3 2026 · commercial plan`

## Two of five KPIs cleared the plan line.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
- Services revenue `1.1M` `1.8M`
- Partner-sourced ARR `0.9M` `1.4M`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · bullet" -->

## When NOT to reach for bullet.

- No target to measure against
  - A row with one pill draws a bar with no marker and no range — every mark that makes it a bullet is gone. Use `bar` instead.
- One KPI on its own
  - A single row spends a whole slide on two numbers. Use `big-number`, or `stats` for a short row. This chart earns its density.
- Red/amber/green range bands
  - The zones are one neutral on purpose: a traffic-light range re-states the verdict the target marker already carries.
- A KPI where lower is better
  - Cost against budget, churn against a ceiling: the bar grows past the marker, so beating the target reads as missing it.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `progress` — percent-complete with a status verdict and no target or range — HTML bars, so no marker and no band, but the row carries a status pill and a note the bullet has no room for
- `bar` — magnitudes compared against each other rather than against a plan
- `big-number` — one figure against its target is the entire slide
- `stats` — a row of independent headline metrics with no shared scale
- `gantt` — the rows are time-bound work, not measures against a threshold
