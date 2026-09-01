---
marp: true
theme: indaco
paginate: true
header: "Lattice · the cards: register"
cards: center
---

<!-- _class: title silent -->

# The author decides where a card row's spare height goes

`cards: stretch · center · top · spread`

A row of cards gets the whole stage. When the cards are sparse, that height goes somewhere — and only the author knows where.

---

<!-- _class: cards-grid cards-stretch -->
<!-- _footer: "cards: stretch — the default. Every deck rendered this way before the register, and still does." -->

## Stretch fills the row, and a short card carries the difference.

- The default.
  - Omit the key; nothing changes.
- Right when cards are full.
  - A three-line card uses what it gets.
- Wrong when they are sparse.
  - A one-line card is as tall as the row.
- The author's call.
  - The engine cannot tell sparse from composed.

---

<!-- _class: cards-grid -->
<!-- _footer: "cards: center — cards shrink to their text and the band sits at the optical middle." -->

## Center shrinks the cards and centers the band.

- Cards fit their text.
  - Each line takes what its tallest card needs.
- The band centers.
  - Spare height splits above and below.
- One gutter.
  - Rows stay `gap` apart, matching the columns.
- The cost.
  - The band stops short of the stage floor.

---

<!-- _class: verdict-grid cards-top -->
<!-- _footer: "cards: top — the band sits under the headline rule; spare height collects at the bottom." -->

## Top anchors the band where the eye enters.

- **Under the rule.**
  - [x] Gutter kept
  - [ ] Band centered
  - Cards start below the headline. Nothing floats.
- **Spare height below.**
  - [x] Gutter kept
  - [ ] Band centered
  - Spare height collects at the bottom.
- **Composition void.**
  - [x] Gutter kept
  - [x] Author's call
  - Where the content ends is the deck's business.

---

<!-- _class: verdict-grid cards-spread -->
<!-- _footer: "cards: spread — the spare height is shared out between the rows." -->

## Spread shares the height out between the rows.

- **Rows move apart.**
  - [x] Void gone
  - [ ] Gutter kept
  - The row gap grows; the column gap does not.
- **Measured.**
  - [x] Void gone
  - [ ] Gutter kept
  - Measured at 4.2x the column gutter.
- **Use it deliberately.**
  - [x] Void gone
  - [x] Author's call
  - Two sparse rows carry it; a dense grid cannot.

---

<!-- _class: list-criteria cards-stretch -->
<!-- _footer: "How the register is built." -->

## One token, and every default survives it.

- **A class sets a variable**
  - `cards: center` stamps a class that sets `--cards-align`.
- **Each row keeps its own default**
  - Each row reads the variable with its own fallback.
- **So silence changes nothing**
  - No register, no variable, no change.
- **And the splitter still wins**
  - Split pages override it, so a run stays uniform.

---

<!-- _class: closing cards-stretch -->

## Four values, one default, nothing forced.

`stretch stays the default — the engine never decides a composition the author owns.`
