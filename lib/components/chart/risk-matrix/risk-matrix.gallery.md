---
marp: true
theme: indaco
paginate: true
header: "Lattice · risk-matrix"
---

<!-- _class: title silent -->

# risk-matrix

`Evidence · Canvas · Series`

A 5 × 5 likelihood × impact grid shaded by severity, with each risk as a numbered marker and a key that lists them worst first.

---

<!-- _class: risk-matrix -->
<!-- _footer: "Default · risk-matrix" -->

`Enterprise risk register · Q4 2026`

## Cyber and hurricane risk sit in the red; both have a plan.

- Cyber outage `{4, 5}` `{2, 4}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`


---

<!-- _class: risk-matrix -->
<!-- stress-slide -->
<!-- _footer: "Stress test · risk-matrix — Ten risks, three sharing one cell, two with a planned move." -->

## Ten risks, three in the same cell.

- Cyber outage `{4, 5}` `{2, 4}`
- Ransomware `{4, 5}`
- Cloud provider failure `{4, 5}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- Regulatory fine `{2, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`
- Office flood `{1, 2}`


---

<!-- _class: risk-matrix dark -->
<!-- _footer: "Composition: dark · risk-matrix dark" -->

`Enterprise risk register · Q4 2026`

## Cyber and hurricane risk sit in the red; both have a plan.

- Cyber outage `{4, 5}` `{2, 4}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`


---

<!-- _class: risk-matrix compact -->
<!-- _footer: "Composition: compact · risk-matrix compact" -->

`Enterprise risk register · Q4 2026`

## Cyber and hurricane risk sit in the red; both have a plan.

- Cyber outage `{4, 5}` `{2, 4}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`


---

<!-- _class: risk-matrix accent -->
<!-- _footer: "Composition: accent · risk-matrix accent" -->

`Enterprise risk register · Q4 2026`

## Cyber and hurricane risk sit in the red; both have a plan.

- Cyber outage `{4, 5}` `{2, 4}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`


---

<!-- _class: cards-grid -->
<!-- _footer: "Anti-patterns · risk-matrix" -->

## When NOT to reach for risk-matrix.

- Scores that are not 1 to 5
  - The grid is five by five. A 1-to-10 or percentage scale has to be mapped to five bands first; a value outside 1 to 5 is not placed.
- Using it as a scatter
  - Positions snap to whole cells, so two risks a decimal apart land together. When the exact position matters, use `scatter` or `quadrant`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `heatmap` — a grid of numbers shaded by value, not a register of named risks
- `quadrant` — items placed on two continuous axes with four named zones
- `table` — the full register, with owners, controls and dates
