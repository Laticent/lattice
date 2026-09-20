---
marp: true
theme: indaco
paginate: true
header: "Lattice · label sets"
---

<!-- _class: title silent -->

# Name the bands, or let the chart do it.

`Label sets · heatmap · the key a ramp was missing`

A heatmap's five tones carry meaning no reader can recover from the tones alone.
A **label set** names them — derived from the data by default, overridden where
the words matter.

---

<!-- _class: heatmap -->
<!-- _footer: "No key · the default, unchanged" -->

`Retention · 2026 cohorts`

## Without a key, the tones are unexplained.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

---

<!-- _class: heatmap scale -->
<!-- _footer: "Derived · the chart names its own bands" -->

`Retention · 2026 cohorts`

## The chart can name its own bands.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

---

<!-- _class: heatmap -->
<!-- _footer: "Authored · the words the room needs" -->

`Risk · by system and quarter`

## Where a number means nothing, a word means everything.

`[{1, Contained}, {2, Monitor}, {3, Watch}, {4, Escalate}, {5, Act now}]`

|  | Q1 | Q2 | Q3 | Q4 |
| --- | --: | --: | --: | --: |
| Payments | 2 | 4 | 7 | 9 |
| Identity | 1 | 2 | 3 | 3 |
| Search | 1 | 1 | 2 | 2 |
| Catalog | 3 | 3 | 4 | 5 |

---

<!-- _class: heatmap -->
<!-- _footer: "Partial · name what matters, keep the rest" -->

`Margin · by region`

## Name only the bands that carry a decision.

`[{1, Below plan}, {5, Ahead}]`

|  | Q1 | Q2 | Q3 | Q4 |
| --- | --: | --: | --: | --: |
| Americas | 61 | 63 | 66 | 69 |
| EMEA | 58 | 55 | 54 | 52 |
| APAC | 49 | 54 | 60 | 64 |

---

<!-- _class: heatmap scale -->
<!-- _footer: "Per-cell detail · the why behind one crossing" -->

`Retention · 2026 cohorts`

## A cell can carry its own explanation.

|  | M0 | M1 | M2 |
| --- | --: | --: | --: |
| Jan 2026 | 100 | 62 `# Onboarding changed mid-month; the dip is the change, not the cohort.` | 48 |
| Feb 2026 | 100 | 58 | 44 |
| Mar 2026 | 100 | 71 `# First cohort on the new activation flow.` | 59 |

---

<!-- _class: content -->
<!-- _footer: "One shape, three ways to write it" -->

## One entry, three ways to write it.

- **Derived.**
  - Add `scale` and the chart names each band by the values it covers.
- **Inline.**
  - `` `[{1, Cold}, {3, Warm}, {5, Hot}]` `` above the table. Name some, keep the rest.
- **Per cell.**
  - `` `# prose` `` inside a cell. Hover on screen, speaker note in print.
