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

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |


---

<!-- _class: heatmap scale -->
<!-- _footer: "scale · heatmap scale — Renders the band key beside the grid, naming each ramp step by the range of values it covers — reach for it when a reader has to know why two cells share a tone." -->

`Retention · 2026 cohorts`

## The chart names its own bands.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |


---

<!-- _class: heatmap -->
<!-- stress-slide -->
<!-- _footer: "Stress test · heatmap — Ten rows by twelve columns at the ceiling, the longest realistic row name, a ragged tail where the newest cohorts have not reached the later months, and a flat row where every value is identical. The grid is bound by cell size on both axes at once, so the ceiling is the only place you can see whether a column name still sets above its column, whether a long row name ellipsizes rather than being culled, and whether an unmeasured crossing still reads as unmeasured rather than as the bottom of the ramp." -->

`Retention · the ceiling`

## Ten cohorts by twelve months — the density this holds.

|  | M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| January 2026 acquisition cohort | 100 | 71 | 59 | 55 | 52 | 50 | 48 | 47 | 46 | 45 | 44 | 43 |
| February 2026 | 100 | 58 | 44 | 41 | 39 | 38 | 37 | 36 | 35 | 34 | 33 | 32 |
| March 2026 | 100 | 62 | 48 | 45 | 43 | 42 | 41 | 40 | 39 | 38 | 37 |  |
| April 2026 | 100 | 69 | 57 | 54 | 51 | 49 | 48 | 47 | 46 | 45 |  |  |
| May 2026 | 100 | 66 | 54 | 50 | 48 | 47 | 46 | 45 | 44 |  |  |  |
| June 2026 | 100 | 64 | 52 | 49 | 47 | 46 | 45 | 44 |  |  |  |  |
| July 2026 | 100 | 61 | 50 | 47 | 45 | 44 | 43 |  |  |  |  |  |
| August 2026 | 100 | 59 | 48 | 45 | 43 | 42 |  |  |  |  |  |  |
| September 2026 | 100 | 57 | 47 | 44 | 42 |  |  |  |  |  |  |  |
| October 2026 | 55 | 55 | 55 | 55 |  |  |  |  |  |  |  |  |


---

<!-- _class: heatmap dark -->
<!-- _footer: "Composition: dark · heatmap dark" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |


---

<!-- _class: heatmap compact -->
<!-- _footer: "Composition: compact · heatmap compact" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |


---

<!-- _class: heatmap accent -->
<!-- _footer: "Composition: accent · heatmap accent" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |


---

<!-- _class: cards-stack compact cards-stretch -->
<!-- _footer: "Anti-patterns · heatmap" -->

## When NOT to reach for heatmap.

- One row of numbers
  - A single series is not a matrix — it is a comparison, and a reader judges length far more precisely than intensity. Use `bar`. The kernel declines a one-column table for this reason rather than painting a single strip.
- Qualitative cells
  - If the cells are verbs, owners or statuses rather than numbers, the ramp has nothing to encode. Use `matrix-grid`, whose cells are tagged at parse time.
- Precise comparison
  - Asking a reader which of two similar cells is larger spends the one thing intensity is bad at, and the five-tone binning above makes it stricter: two cells in the same band are the same color by design. If the comparison has to be exact, the value belongs on an axis — `bar` or `line`.
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
