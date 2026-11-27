---
marp: true
theme: indaco
pagination: true
header: "Lattice · the align: register"
---

<!-- @meta{layout=title, class=silent} -->

# The author decides where a card row's spare height goes

`align: top · middle · bottom · spread · fill`

A row of cards gets the whole stage. When the cards are sparse, that height goes somewhere — and only the author knows where.

---

<!-- @meta{layout=cards-grid, class=align-fill, footer="align: fill — what every deck did before the register. Now opt in."} -->


## Fill grows the row, and a short card carries the difference.

- What this used to do.
  - Every deck rendered card rows this way.
- Right when cards are full.
  - A three-line card uses what it gets.
- Wrong when they are sparse.
  - A one-line card is as tall as the row.
- Still worth asking for.
  - A full grid, or one above a key-insight panel.

---

<!-- @meta{layout=cards-grid, footer="align: middle — the default. This slide names no value at all."} -->


## Center shrinks the cards and centers the band.

- The default now.
  - Omit the key and you get this.
- Cards fit their text.
  - Each line takes what its tallest card needs.
- One gutter.
  - Rows stay `gap` apart, matching the columns.
- The cost.
  - The band stops short of the stage floor.

---

<!-- @meta{layout=verdict-grid, class=align-top, footer="align: top — the band sits under the headline rule; spare height collects at the bottom."} -->


## Top anchors the band where the eye enters.

- Under the rule
  - [x] Gutter kept
  - [/] Band centered
  - Cards start below the headline. Nothing floats.
- Spare height below
  - [x] Gutter kept
  - [/] Band centered
  - Spare height collects at the bottom.
- Composition void
  - [x] Gutter kept
  - [/] Band centered
  - Where the content ends is the deck's business.

---

<!-- @meta{layout=verdict-grid, class=align-spread, footer="align: spread — the spare height is shared out between the rows."} -->


## Spread shares the height out between the rows.

- Rows move apart
  - [x] Void gone
  - [!] Gutter kept
  - The row gap grows; the column gap does not.
- Measured
  - [x] Void gone
  - [!] Gutter kept
  - Measured at 4.2x the column gutter.
- Use it deliberately
  - [x] Void gone
  - [!] Gutter kept
  - Two sparse rows carry it; a dense grid cannot.

---

<!-- @meta{layout=list, class=takeaway, footer=How the register is built.} -->


## One token, and every default survives it.

1. **A class sets a variable**
   - `align: top` stamps a class that sets `--align-v`.
1. **Each row keeps its own default**
   - Each row reads the variable with its own fallback.
1. **So a rule keeps its own default**
   - `align: middle` stamps nothing; each fallback wins.
1. **And the splitter still wins**
   - Split pages override it, so a run stays uniform.

---

<!-- @meta{layout=closing} -->

## Four values, one default, nothing forced.

`middle is the default — every other composition is one line of front matter away.`
