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
<!-- _footer: "Four cohorts, four months — the shape before the numbers" -->

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

## The value's ink flips along the ramp, not with the page.

This is the one place in the family where text sits on a colored mark. A faint cell needs dark ink and a saturated one needs light — on **both** canvases, in opposite directions. The obvious construction, blending the two inks in proportion to the fill, is smooth and unreadable in the middle: it computes mid-grey exactly where the cell is mid-toned. Measured, that rendered `71` at **2.87:1**. The ink steps instead, at a crossover read off the painted pixels rather than guessed — `5.52:1` at its worst now.

---

<!-- _class: heatmap -->
<!-- _footer: "Ten by twelve — the ceiling, with a ragged tail" -->

`Retention · the ceiling`

## Ten cohorts by twelve months.

- January 2026
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
- February 2026
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
- March 2026
  - M0 `100`
  - M1 `62`
  - M2 `48`
  - M3 `45`
  - M4 `43`
  - M5 `42`
  - M6 `41`
- April 2026
  - M0 `100`
  - M1 `69`
  - M2 `57`
  - M3 `54`
  - M4 `51`
- May 2026
  - M0 `100`
  - M1 `66`
  - M2 `54`
- June 2026
  - M0 `100`
  - M1 `64`

---

<!-- _class: statement silent -->

## When not to reach for it.

Intensity is read approximately — that is its strength for a pattern and its weakness for a comparison. One row of numbers is not a matrix; it is a `bar`, where length is judged precisely. Cells that are verbs or owners belong in `matrix-grid`. A value per country belongs on `map`. And if the decision turns on which of two similar cells is larger, the value belongs on an axis.
