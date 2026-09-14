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

- Jan 2026
  - M0 `100`
  - M1 `62`
  - M2 `48`
  - M3 `44`
- Feb 2026
  - M0 `100`
  - M1 `58`
  - M2 `44`
  - M3 `41`
- Mar 2026
  - M0 `100`
  - M1 `71`
  - M2 `59`
  - M3 `55`
- Apr 2026
  - M0 `100`
  - M1 `69`
  - M2 `57`

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

- Jan 2026
  - M0 `100`
  - M1 `71`
  - M2 `59`
  - M3 `55`
  - M4 `52`
  - M5 `50`
  - M6 `48`
  - M7 `47`
  - M8 `46`
  - M9 `45`
  - M10 `44`
  - M11 `43`
- Feb 2026
  - M0 `100`
  - M1 `58`
  - M2 `44`
  - M3 `41`
  - M4 `39`
  - M5 `38`
  - M6 `37`
  - M7 `36`
  - M8 `35`
  - M9 `34`
  - M10 `33`
- Mar 2026
  - M0 `100`
  - M1 `62`
  - M2 `48`
  - M3 `45`
  - M4 `43`
  - M5 `42`
  - M6 `41`
  - M7 `40`
  - M8 `39`
  - M9 `38`
- Apr 2026
  - M0 `100`
  - M1 `69`
  - M2 `57`
  - M3 `54`
  - M4 `51`
  - M5 `50`
  - M6 `49`
  - M7 `48`
  - M8 `47`
- May 2026
  - M0 `100`
  - M1 `66`
  - M2 `54`
  - M3 `51`
  - M4 `49`
  - M5 `48`
  - M6 `47`
  - M7 `46`
- Jun 2026
  - M0 `100`
  - M1 `64`
  - M2 `51`
  - M3 `48`
  - M4 `46`
  - M5 `45`
  - M6 `44`
- Jul 2026
  - M0 `100`
  - M1 `73`
  - M2 `61`
  - M3 `58`
  - M4 `56`
  - M5 `55`
- Aug 2026
  - M0 `100`
  - M1 `60`
  - M2 `47`
  - M3 `44`
  - M4 `42`
- Sep 2026
  - M0 `100`
  - M1 `68`
  - M2 `56`
  - M3 `53`
- Oct 2026
  - M0 `100`
  - M1 `75`
  - M2 `64`

---

<!-- _class: statement silent -->

## When not to reach for it.

Intensity is read approximately — that is its strength for a pattern and its weakness for a comparison. One row of numbers is not a matrix; it is a `bar`, where length is judged precisely. Cells that are verbs or owners belong in `matrix-grid`. A value per country belongs on `map`. And if the decision turns on which of two similar cells is larger, the value belongs on an axis.
