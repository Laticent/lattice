---
marp: true
theme: indaco
paginate: true
header: "Lattice · matrix-2x2"
---

<!-- _class: title silent -->

# matrix-2x2

`Comparison · Matrix · Structure`

Static 2×2 quadrant grid with author-placed items per cell.

---

<!-- _class: matrix-2x2 -->
<!-- _footer: "Default · matrix-2x2" -->

## The matrix places items on two named axes.

- **High impact · Low effort.**
  - Quick wins
  - Two per cell
- **High impact · High effort.**
  - Strategic bets
  - Named plainly
- **Low impact · Low effort.**
  - Habit fillers
  - Prune here
- **Low impact · High effort.**
  - Time sinks
  - One suffices


---

<!-- _class: matrix-2x2 -->
<!-- stress-slide -->
<!-- _footer: "Stress test · matrix-2x2 — Three items per cell — the ceiling." -->

## Three items per cell is the matrix ceiling.

- **High impact · Low effort.**
  - Three short items
  - Fit each cell
  - At the ceiling
- **High impact · High effort.**
  - Labels stay short
  - Sixteen words hard
  - Per cell entry
- **Low impact · Low effort.**
  - Past three items
  - The quadrants crowd
  - Split the story
- **Low impact · High effort.**
  - A fourth entry
  - Does not fit
  - Stop at three


---

<!-- _class: matrix-2x2 dark -->
<!-- _footer: "Composition: dark · matrix-2x2 dark" -->

## The matrix places items on two named axes.

- **High impact · Low effort.**
  - Quick wins
  - Two per cell
- **High impact · High effort.**
  - Strategic bets
  - Named plainly
- **Low impact · Low effort.**
  - Habit fillers
  - Prune here
- **Low impact · High effort.**
  - Time sinks
  - One suffices


---

<!-- _class: matrix-2x2 compact -->
<!-- _footer: "Composition: compact · matrix-2x2 compact" -->

## The matrix places items on two named axes.

- **High impact · Low effort.**
  - Quick wins
  - Two per cell
- **High impact · High effort.**
  - Strategic bets
  - Named plainly
- **Low impact · Low effort.**
  - Habit fillers
  - Prune here
- **Low impact · High effort.**
  - Time sinks
  - One suffices


---

<!-- _class: matrix-2x2 accent -->
<!-- _footer: "Composition: accent · matrix-2x2 accent" -->

## The matrix places items on two named axes.

- **High impact · Low effort.**
  - Quick wins
  - Two per cell
- **High impact · High effort.**
  - Strategic bets
  - Named plainly
- **Low impact · Low effort.**
  - Habit fillers
  - Prune here
- **Low impact · High effort.**
  - Time sinks
  - One suffices


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · matrix-2x2" -->

## When NOT to reach for matrix-2x2.

- Continuous-axis data
  - If items have x/y coordinates rather than quadrant labels, use `quadrant`. matrix-2x2 is author-placed categorical, not plotted.
- Empty quadrants left blank
  - An empty cell still needs a label or an explicit (none) placeholder. A missing card breaks the 2×2 symmetry.
- More than 4 items per cell
  - Each quadrant holds 1–4 items. Past that the cells crowd. Promote inner items to their own slide if needed.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `quadrant` — items have continuous x/y coordinates rather than discrete quadrant labels
- `verdict-grid` — options scored across more than two dimensions
- `obligation-matrix` — many rows × many columns of state-marker cells
- `cards-grid` — the items don't divide along two axes
