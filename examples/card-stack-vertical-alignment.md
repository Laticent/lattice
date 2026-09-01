---
marp: true
theme: indaco
paginate: true
header: "Lattice · card-stack vertical alignment"
---

<!-- _class: title silent -->

# Cards that fill a box now use it

`Comparison · Evidence · Inventory`

Three layouts were handed the full height of the stage and pinned their content to the top of it.

---

<!-- _class: decision -->
<!-- _footer: "decision — the justification sits at the card's optical middle in every family." -->

## A verdict card distributes the height the row gives it.

- The pick, stated plainly.
  - The chosen option leads with the verdict treatment and the reason it won, in one breath.
- The road not taken.
  - The alternative keeps its honest case — a decision against a straw man persuades no one.

---

<!-- _class: matrix-2x2 -->
<!-- _footer: "matrix-2x2 — each quadrant is exactly half the stage, so its content is centered in it." -->

## Every quadrant is half the stage whether or not it needs to be.

- High impact · Low effort.
  - Quick wins
  - Two per cell
- High impact · High effort.
  - Strategic bets
  - Named plainly
- Low impact · Low effort.
  - Habit fillers
  - Prune here
- Low impact · High effort.
  - Time sinks
  - One suffices

---

<!-- _class: stats -->
<!-- _footer: "stats — the tile is sized by its content, on an authored page and on a split one alike." -->

## A stat is a tile, not a panel.

`The numbers the row was built to carry`

1. 52.7%
   - of the tile was empty
2. 0.9%
   - is empty now
3. 418
   - pages unchanged
4. 33
   - decks swept

---

<!-- _class: list-tabular -->
<!-- _footer: "list-tabular — the ledger was never a defect; its figures baseline-align by design." -->

## A ledger aligns its figures with the first line of the label.

1. Signal modernization
   - Replaces 14 interlockings past their design life.
2. Track and structures
   - Clears 22 slow-orders and four at-risk bridges.
3. Rolling stock overhaul
   - Extends service life on 90 rail cars by 15 years.
4. Power and substations
   - Replaces three substations running beyond peak capacity.

---

<!-- _class: cards-grid -->
<!-- _footer: "What the measurement says the fix actually is." -->

## The defect is declarative, so the fix is a declaration.

- Where the void lives picks the property.
  - A definite height takes `justify-content`; a stretched card takes `align-content`.
- No row needs to move to grid.
  - `align-content` works on wrapped flex, and the 2×2 never flattens.
- A threshold cannot draw the line.
  - Past 19% slack, 2,908 measured cards are one continuum.
- The computed style can.
  - No card told to distribute is ever flagged; all 350 flagged compute `flex-start`.

---

<!-- _class: closing -->

## Three cells fixed, one retired.

`One CSS property each — no register, no manifest field, no runtime measurement.`
