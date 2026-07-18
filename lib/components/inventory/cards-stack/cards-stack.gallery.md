---
marp: true
theme: indaco
paginate: true
header: "Lattice · cards-stack"
---

<!-- _class: title silent -->

# cards-stack

`Inventory · Stack · Structure`

Parallel items stacked vertically, full-width cards.

---

<!-- _class: cards-stack -->
<!-- _footer: "Default · cards-stack" -->

## The stack ranks three cards top to bottom.

- Order is the argument.
  - The stack reads as priority; the top card wins.
- Three is the sweet spot.
  - Bodies run a short paragraph at most.
- Sixteen words per card.
  - The budget that keeps rows breathing.


---

<!-- _class: cards-stack horizontal -->
<!-- _footer: "Horizontal cards · cards-stack horizontal — The stack pivots sideways." -->

## horizontal lays the stack on its side.

- Rows become columns.
  - The ranking now reads left to right.
- Same card anatomy.
  - Title, body, optional status pill.
- Use for timelines.
  - Sequence feels natural sideways.


---

<!-- _class: cards-stack -->
<!-- _footer: "Numbered stack · cards-stack numbered — Corner numbers make rank explicit." -->

## An ordered list makes the ranking explicit.

1. Numbers stamp the rank
   - The stack's order stops being implicit.
2. Three still rules
   - Numbering does not raise the ceiling.
3. Parallel or nothing
   - Ranked cards must match shapes.


---

<!-- _class: cards-stack compact -->
<!-- stress-slide -->
<!-- _footer: "Stress test · cards-stack — Four rows with pills — the limit." -->

## Four rows with pills is the stack's ceiling.

- Row one `shipped`
  - A body at the hard budget holds two sentences; the pill carries the status so the prose does not have to.
- Row two `on track`
  - compact is doing quiet work here — without it, four bodies this size would crowd the footer before the last row lands.
- Row three `at risk`
  - Keep the densest row third; the eye expects trouble near the bottom and reads it with full attention.
- Row four `blocked`
  - The hard stop. A fifth row overflows; split the stack or drop to list-tabular.


---

<!-- _class: cards-stack dark -->
<!-- _footer: "Composition: dark · cards-stack dark" -->

## The stack ranks three cards top to bottom.

- Order is the argument.
  - The stack reads as priority; the top card wins.
- Three is the sweet spot.
  - Bodies run a short paragraph at most.
- Sixteen words per card.
  - The budget that keeps rows breathing.


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Composition: compact · cards-stack compact" -->

## The stack ranks three cards top to bottom.

- Order is the argument.
  - The stack reads as priority; the top card wins.
- Three is the sweet spot.
  - Bodies run a short paragraph at most.
- Sixteen words per card.
  - The budget that keeps rows breathing.


---

<!-- _class: cards-stack accent -->
<!-- _footer: "Composition: accent · cards-stack accent" -->

## The stack ranks three cards top to bottom.

- Order is the argument.
  - The stack reads as priority; the top card wins.
- Three is the sweet spot.
  - Bodies run a short paragraph at most.
- Sixteen words per card.
  - The budget that keeps rows breathing.


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · cards-stack" -->

## When NOT to reach for cards-stack.

- Five or more items
  - A fourth card fits with the `compact` modifier; past four the stack overflows. For five or more parallel items reach for cards-grid four, or split across slides.
- One-line cards
  - If each card is a single short phrase, the stack reads as a padded list. Drop to `list` (or its `takeaway` variant) and reclaim the vertical space.
- Forced sequence
  - Cards-stack is parallel content read in vertical order, not a numbered sequence. For explicit steps, use list-steps or list-criteria.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `cards-grid` — three or four parallel items in a scannable grid
- `compare-prose` — exactly two items, side by side
- `list-steps` — items carry an explicit, ordered sequence
