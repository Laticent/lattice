---
marp: true
theme: indaco
paginate: true
header: "Lattice · card-stack vertical alignment"
---

<!-- _class: title silent -->

# Cards that fill a box now use it

`Comparison · Evidence · Inventory`

Five layouts were handed the full height of the stage and pinned their content to the top of it. Two of them wanted the fix on the row, not the card.

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

<!-- _class: cards-grid four -->
<!-- _footer: "cards-grid — the row is content-height now, so every title still sits on one line." -->

## A row of peers keeps its titles level.

- Content-height rows.
  - The line takes what its tallest card needs, and nothing more than that.
- Equal within the line.
  - Cards still stretch to each other.
- Titles stay put.
  - Center each card alone and this title drops below its neighbors.
- One gutter.
  - Rows sit `gap` apart, like the columns.

---

<!-- _class: verdict-grid -->
<!-- _footer: "verdict-grid — uneven rationales, one title baseline." -->

## The same correction, on a scored grid.

- **Center the card.**
  - [x] Void gone
  - [ ] Titles level
  - Empties the card, then staggers the option names against each other.
- **Stretch the row.**
  - [ ] Void gone
  - [x] Titles level
  - Honest alignment, 35% empty.
- **Center the rows.**
  - [x] Void gone
  - [x] Titles level
  - Content-height lines, one gutter.

---

<!-- _class: stats -->
<!-- _footer: "stats — the tile is sized by its content. This fix only fires on an autosplit page, which no landscape deck produces." -->

## A stat is a tile, not a panel.

`The numbers the row was built to carry`

1. 52.7%
   - of the tile was empty
2. 0.9%
   - is empty now
3. 148
   - split pages fixed
4. 355
   - flagged cards gone

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

<!-- _class: list-criteria -->
<!-- _footer: "What the measurement says the fix actually is." -->

## The defect is declarative, so the fix is a declaration.

- **Where the void lives picks the property**
  - A definite height takes `justify-content`; a stretched card takes `align-content`.
- **The axis picks it again, per family**
  - The same list is a column at portrait and a row at square.
- **A threshold cannot draw the line**
  - Past 19% slack, 2,908 cards are one continuum.
- **The computed style can**
  - All 350 flagged cards compute `flex-start`; no centered card is flagged.

---

<!-- _class: closing -->

## Five cells fixed, one retired.

`One CSS property each — no register, no manifest field, no runtime measurement.`
