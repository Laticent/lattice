---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · prose-density budget"
footer: "Budget the words, not just the elements"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Budget the words.

`Prose-density contract`

*Every layout declares how many words each element gets — so the author writes tight, and the reviewer flags the wall of text before it ships.*

---

<!-- _class: cards-grid -->

## The right layout, with far too many words.

- Wrong shape
  - Phase 1 already steers which layout, and how many elements.
- Right shape, wrong words
  - Each card carries a paragraph, not a clause.
- The result
  - The slide overflows, and the room stops reading.

> Count is solved. Density is the verbosity left over once the count is right.

---

<!-- _class: cards-grid -->

## Two budgets, one axis.

- Capacity
  - How many elements fit — `~4 cards`, past which the grid crowds.
- Density
  - How many words each element gets — `~15`, past which it overflows.
- Together
  - Pick the layout by shape; write each element to its word budget.

---

<!-- _class: list-steps -->

## How the numbers are set.

1. Seed the target
   - The aim comes from the canon — a label, not a sentence.
2. Clamp the ceiling
   - Render at rising word counts; read where it actually overflows.
3. Keep the gap
   - The target sits well below the break — good taste.

---

<!-- _class: actors -->

## Each row gets a word budget too.

- Owns the scoring model `Head of Product`
  - One short responsibility, not a job description.
- Runs the weekly review `Chief of Staff`
  - A clause per row keeps the ledger scannable.
- Maintains the log `Program Manager`
  - Detail belongs on a follow-up slide, not here.

---

<!-- _class: cards-grid -->

## The chrome has budgets, regardless of layout.

- Eyebrow `≤ 5 words`
  - A label that frames, not a sentence that explains.
- Title and subtitle `≤ 10 · ≤ 12`
  - The takeaway lands in one tight line.
- Key insight and pill `≤ 18 · ≤ 2`
  - One memorable sentence; a one-word status chip.

---

<!-- _class: closing -->

## Write tight; the reviewer has your back.

`components.json` carries each layout's `density`; the Studio's Coach flags an overrun as a suggestion. We recommend writing to the budget up front — that, not the warning, is the real fix.
