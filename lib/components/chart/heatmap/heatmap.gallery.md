---
marp: true
theme: indaco
paginate: true
header: "Lattice · heatmap"
---

<!-- _class: title silent -->

# heatmap

`Evidence · Canvas · Series`

A numeric matrix read as intensity — where the value concentrates across two dimensions.

---

<!-- _class: heatmap -->
<!-- _footer: "Default · heatmap" -->

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

<!-- _class: heatmap -->
<!-- stress-slide -->
<!-- _footer: "Stress test · heatmap — Ten rows by twelve columns at the ceiling, the longest realistic row name, a ragged tail where the newest cohorts have not reached the later months, and a flat row where every value is identical. The grid is bound by cell size on both axes at once, so the ceiling is the only place you can see whether a column name still sets above its column, whether a long row name ellipsizes rather than being culled, and whether an unmeasured crossing still reads as unmeasured rather than as the bottom of the ramp." -->

`Retention · the ceiling`

## Ten cohorts by twelve months — the density this holds.

- January 2026 acquisition cohort
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
  - M10 `33`
  - M11 `32`
- March 2026
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
  - M10 `37`
- April 2026
  - M0 `100`
  - M1 `69`
  - M2 `57`
  - M3 `54`
  - M4 `51`
  - M5 `49`
  - M6 `48`
  - M7 `47`
  - M8 `46`
  - M9 `45`
- May 2026
  - M0 `100`
  - M1 `66`
  - M2 `54`
  - M3 `50`
  - M4 `48`
  - M5 `47`
  - M6 `46`
  - M7 `45`
  - M8 `44`
- June 2026
  - M0 `100`
  - M1 `64`
  - M2 `52`
  - M3 `49`
  - M4 `47`
  - M5 `46`
  - M6 `45`
  - M7 `44`
- July 2026
  - M0 `100`
  - M1 `61`
  - M2 `50`
  - M3 `47`
  - M4 `45`
  - M5 `44`
  - M6 `43`
- August 2026
  - M0 `100`
  - M1 `59`
  - M2 `48`
  - M3 `45`
  - M4 `43`
  - M5 `42`
- September 2026
  - M0 `100`
  - M1 `57`
  - M2 `47`
  - M3 `44`
  - M4 `42`
- October 2026
  - M0 `55`
  - M1 `55`
  - M2 `55`
  - M3 `55`


---

<!-- _class: heatmap dark -->
<!-- _footer: "Composition: dark · heatmap dark" -->

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

<!-- _class: heatmap compact -->
<!-- _footer: "Composition: compact · heatmap compact" -->

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

<!-- _class: heatmap accent -->
<!-- _footer: "Composition: accent · heatmap accent" -->

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

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · heatmap" -->

## When NOT to reach for heatmap.

- One row of numbers
  - A single series is not a matrix — it is a comparison, and a reader judges length far more precisely than intensity. Use `bar`. The kernel declines a flat list for this reason rather than painting a one-row grid.
- Qualitative cells
  - If the cells are verbs, owners or statuses rather than numbers, the ramp has nothing to encode. Use `matrix-grid`, whose cells are tagged at parse time.
- Precise comparison
  - Asking a reader which of two similar cells is larger spends the one thing intensity is bad at. If the comparison has to be exact, the value belongs on an axis — `bar` or `line`.
- Geography
  - A value per country or region belongs on the `map` choropleth, which shares this ramp but places the cells where the reader expects them.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `matrix-grid` — the cells are qualitative — a verb, an owner, a status — rather than a number
- `map` — the two dimensions are geographic; same ramp, spatial placement
- `bar` — one dimension, and the comparison has to be exact
- `quadrant` — two CONTINUOUS axes with items placed on them, rather than two categorical axes with a value at each crossing
