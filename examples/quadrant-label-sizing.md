---
marp: true
theme: indaco
paginate: true
header: "Lattice · quadrant label sizing"
---

<!-- _class: title silent -->

# One crowded slide set the type for all of them.

`quadrant · per-slide label sizing`

A quadrant prints each item's name beside its dot. That name had **one size**, written once in the kernel and shared by every quadrant in every deck — and the number had to be the largest the most crowded slide in the corpus could carry. So a four-dot chart with a half-empty plot printed at the size a fourteen-dot chart needed, in a different file, written by someone else.

---

<!-- _class: statement silent -->

## The constant was a floor disguised as a size.

`FS.dotLabel` sat at **9.5** because the fourteen-initiative stress slide loses a name at 10.5 — which is exactly what happened once, in #1544, and it reached a committed gallery PDF before anyone caught it. The number was correct for that slide and wrong for the twenty-five others paying for it. Measured across the corpus: **twenty-five of twenty-seven** quadrant slides were running below what their own geometry allows, and not one reached the house's smallest type tier.

---

<!-- _class: quadrant -->
<!-- _footer: "Four items, a half-empty plot — now sized to the room it has" -->

`Effort 0–10 → Reach 0–100`

## Where to put the next dollar.

- Strategic Bets
  - Scoring model v2 `3, 70`
- Quick Wins
  - Weekly signal brief `8, 40`
- Defer
  - Per-team weighting UI `4, 55`
- Time Sinks
  - Bespoke board exports `2, 20`

---

<!-- _class: quadrant -->
<!-- _footer: "Ten items — still clears the bar, because names are short" -->

`Effort 0–10 → Reach 0–100`

## Ten initiatives, and every name still reads.

- Strategic Bets
  - Scoring model v2 `3, 78`
  - Decision-log API `2.2, 70`
  - Signal dedupe `3.6, 84`
- Quick Wins
  - Weekly brief `7.4, 88`
  - Adoption board `8.2, 74`
  - Snapshot export `6.8, 66`
- Defer
  - Vendor scoping `2.6, 30`
  - Intake shim `3.4, 22`
- Time Sinks
  - Custom audit log `7.8, 26`
  - Manual recalibration `8.6, 16`

---

<!-- _class: statement silent -->

## The size is asked of the geometry, not chosen.

The kernel walks a ladder of sizes **largest first** and keeps the first rung where every name still places. `placeLabels` is pure and deterministic, so this is a measurement, not a heuristic. The bottom rung is the old constant — a slide the ladder cannot lift renders **byte-identically** to before.

---

<!-- _class: statement silent -->

## The box grows with the type, and that was not optional.

`LW.item` is a width in viewBox units. It buys *characters* only in combination with a font size — held at 120 while the type grew, a line fell from about twenty-one characters to fifteen, and names began breaking mid-word: `Maturity self-assessment` rendered as **self-assessmen / t**. Scaling the budget by the same factor holds characters-per-line constant, so a label is a larger copy of itself.

---

<!-- _class: quadrant -->
<!-- _footer: "Fourteen items — the ceiling, and unchanged at the floor size" -->

`Effort 0–10 → Reach 0–100`

## The density that pins the floor.

- Strategic Bets
  - Scoring model v2 `3, 78`
  - Decision-log audit trail `2.2, 70`
  - Multi-source signal dedupe `3.6, 84`
  - Per-team calibration `4.4, 92`
- Quick Wins
  - Weekly signal brief `7.4, 88`
  - Adoption dashboard `6.6, 74`
  - Snapshot exports `8.2, 70`
- Defer
  - Vendor scoping `2.6, 30`
  - Legacy intake shim `1.6, 24`
  - Manual recalibration `3.4, 14`
  - Self-assessment generator `4.2, 22`
- Time Sinks
  - Bespoke board export `8.6, 28`
  - Custom audit log UI `7.4, 22`
  - Per-decision profiles `6.6, 12`

---

<!-- _class: statement silent -->

## The ceiling is a design decision, not a limit we hit.

Plenty of sparse quadrants place every name at 18 or 20, and they are **not allowed to**. A dot name that outgrows `--quadrant-axis-size` inverts the chart's hierarchy — the thing being measured would print larger than the axis it is measured against. The ladder stops at the house's smallest type tier: reaching the legibility bar is the goal, and passing it is a different defect.

---

<!-- _class: statement silent -->

## What this does not fix.

Six slides still cannot carry a readable name, and count is only half of why — name **length** and dot proximity bind too, so some six-item slides settle a rung below every ten-item slide. Those keep the floor size: no worse, no better. Warning an author *before* they build a fourteen-dot quadrant needs a signal the chart family does not have; it is tracked separately.
