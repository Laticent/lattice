---
marp: true
theme: indaco
paginate: true
header: "Lattice · heatmap motion"
motion: on
acronyms:
  EMEA: Europe, the Middle East and Africa
  APAC: Asia Pacific
---

<!-- _class: title silent -->

# The grid assembles itself.

`Anima · heatmap · in-place cell motion`

Set `motion: on` once. Every cell a heatmap draws already declares its motion
role, so the grid builds itself — and the exported PDF is unchanged.

---

<!-- _class: heatmap -->
<!-- _footer: "Default build · cells arrive in reading order" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

---

<!-- _class: heatmap motion-together -->
<!-- _footer: "motion-together · the whole matrix resolves at once" -->

`Support load · by weekday`

## Tuesday carries the week's backlog.

|  | Mon | Tue | Wed | Thu | Fri |
| --- | --: | --: | --: | --: | --: |
| Morning | 82 | 96 | 74 | 61 | 48 |
| Afternoon | 71 | 88 | 66 | 59 | 37 |
| Evening | 34 | 41 | 29 | 24 | 12 |

---

<!-- _class: heatmap motion-rise -->
<!-- _footer: "motion-rise · each cell slides up into place" -->

`Gross margin · by region`

## Margin recovered everywhere except EMEA.

|  | Q1 | Q2 | Q3 | Q4 |
| --- | --: | --: | --: | --: |
| Americas | 61 | 63 | 66 | 69 |
| EMEA | 58 | 55 | 54 | 52 |
| APAC | 49 | 54 | 60 | 64 |

---

<!-- _class: heatmap motion-off -->
<!-- _footer: "motion-off · the control, so the difference is visible" -->

`Defect density · by service`

## Checkout carries three times the defect load.

|  | Jan | Feb | Mar |
| --- | --: | --: | --: |
| Checkout | 31 | 28 | 34 |
| Catalog | 11 | 9 | 12 |
| Search | 8 | 7 | 6 |

---

<!-- _class: content -->
<!-- _footer: "What the reader gets on each surface" -->

## One source, four surfaces.

- **Studio, Playground, Present.**
  - The grid builds, derived from the chart's own marks.
- **The exported PDF.**
  - The finished grid, still — byte-identical to a deck that never asked.
- **Reduced motion.**
  - The end state, mounted immediately.
- **The `--player` export.**
  - The build travels with the deck.
