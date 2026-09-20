---
marp: true
theme: indaco
paginate: true
header: "Lattice · heatmap"
---

<!-- _class: title silent -->

# Where does it concentrate?

`heatmap · a numeric matrix read as intensity`

The chart family could compare magnitudes, decompose a total, plot a trend and score a 2×2 — but it had no way to put a **number at every crossing of two dimensions**. Cohort retention, a risk matrix, usage by hour and weekday: the shape a deck reaches for when the finding is a pattern rather than any single value.

---

<!-- _class: heatmap -->
<!-- _footer: "Four cohorts, four months — the shape first, the number on it" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

---

<!-- _class: statement silent -->

## A missing cell is not a zero.

April has no month-three number because April has not reached month three. That is the **normal** state of a cohort table, not an authoring error — so the crossing paints the bare neutral with a dotted edge and carries no intensity at all. Pad it with `0` instead and the chart states a measurement nobody took, at the bottom of the ramp, where it reads as a collapse.

---

<!-- _class: statement silent -->

## The ramp is the choropleth's, not a new one.

A heatmap and a `map` encode the same thing — one continuous value as one intensity — differing only in whether the cells are a grid or a geography. So this takes the mechanism `map` already proved: one hue mixed into a **neutral anchor**, never into the page. Mixing toward the canvas looks identical on light and inverts on dark, where a low value sinks *below* the empty cell it is supposed to sit above.

---

<!-- _class: statement silent -->

## The ramp is five stops, so the number can sit on it.

Text on a colored fill is the one placement this family will not otherwise guarantee. The first cut printed the value on a **continuous** ramp and flipped its ink at one crossover — measured across all **33 palettes**, that leaves **318 cells** below AA, worst `2.60:1`. The fix is to stop asking for an exception: quantize. Five chosen stops means five fills to solve an ink against, and we choose which five — so the ramp steps *over* the band where no ink of any color reaches `4.5:1`. Each theme carries its own five inks, solved against the fill each stop actually paints.

---

<!-- _class: heatmap -->
<!-- _footer: "Ten by twelve — the ceiling, with a ragged tail" -->

`Retention · the ceiling`

## Ten cohorts by twelve months.

|  | M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Jan 2026 | 100 | 71 | 59 | 55 | 52 | 50 | 48 | 47 | 46 | 45 | 44 | 43 |
| Feb 2026 | 100 | 58 | 44 | 41 | 39 | 38 | 37 | 36 | 35 | 34 | 33 |  |
| Mar 2026 | 100 | 62 | 48 | 45 | 43 | 42 | 41 | 40 | 39 | 38 |  |  |
| Apr 2026 | 100 | 69 | 57 | 54 | 51 | 50 | 49 | 48 | 47 |  |  |  |
| May 2026 | 100 | 66 | 54 | 51 | 49 | 48 | 47 | 46 |  |  |  |  |
| Jun 2026 | 100 | 64 | 51 | 48 | 46 | 45 | 44 |  |  |  |  |  |
| Jul 2026 | 100 | 73 | 61 | 58 | 56 | 55 |  |  |  |  |  |  |
| Aug 2026 | 100 | 60 | 47 | 44 | 42 |  |  |  |  |  |  |  |
| Sep 2026 | 100 | 68 | 56 | 53 |  |  |  |  |  |  |  |  |
| Oct 2026 | 100 | 75 | 64 |  |  |  |  |  |  |  |  |  |

---

<!-- _class: statement silent -->

## When not to reach for it.

Intensity is read approximately — that is its strength for a pattern and its weakness for a comparison. One row of numbers is not a matrix; it is a `bar`, where length is judged precisely. Cells that are verbs or owners belong in `matrix-grid`. A value per country belongs on `map`. And if the decision turns on which of two similar cells is larger, the value belongs on an axis.
