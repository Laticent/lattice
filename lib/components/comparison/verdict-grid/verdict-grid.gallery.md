---
marp: true
theme: indaco
paginate: true
header: "Lattice · verdict-grid"
---

<!-- _class: title silent -->

# verdict-grid

`Comparison · Grid · Structure`

Options scored against criteria as a verdict matrix.

---

<!-- _class: verdict-grid -->
<!-- _footer: "Default · verdict-grid" -->

## The grid scores options against shared criteria.

- **Option one.**
  - [ ] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [-] Criterion
  - Same criteria, same order, always.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- _class: verdict-grid -->
<!-- stress-slide -->
<!-- _footer: "Stress test · verdict-grid — Five options — the hard ceiling." -->

## Five options is the verdict grid's ceiling.

- **First.**
  - [ ] Check
  - [ ] Check
  - Early cards set the criteria order.
- **Second.**
  - [-] Check
  - [ ] Check
  - Partial marks keep the grid honest.
- **Third.**
  - [x] Check
  - [-] Check
  - The middle card is read most carefully.
- **Fourth.**
  - [x] Check
  - [x] Check
  - Late cards inherit the reader's fatigue.
- **Fifth.**
  - [x] Check
  - [x] Check
  - The hard stop; six wants compare-table.


---

<!-- _class: verdict-grid dark -->
<!-- _footer: "Composition: dark · verdict-grid dark" -->

## The grid scores options against shared criteria.

- **Option one.**
  - [ ] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [-] Criterion
  - Same criteria, same order, always.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- _class: verdict-grid compact -->
<!-- _footer: "Composition: compact · verdict-grid compact" -->

## The grid scores options against shared criteria.

- **Option one.**
  - [ ] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [-] Criterion
  - Same criteria, same order, always.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- _class: verdict-grid accent -->
<!-- _footer: "Composition: accent · verdict-grid accent" -->

## The grid scores options against shared criteria.

- **Option one.**
  - [ ] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [-] Criterion
  - Same criteria, same order, always.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · verdict-grid" -->

## When NOT to reach for verdict-grid.

- Exactly two options
  - Two options with shared criteria belong in `compare-prose` or `split-compare`. verdict-grid earns its layout at 3+ options.
- No rationale line
  - Every option must end with a marker-less prose line — the verdict for that card. Omit it and the card renders empty below the badges, and the focal last card has nothing to recommend. The rationale is required, not optional.
- Badge longer than two words
  - The text after the marker is a badge, not a sentence — two words at most (`Residency`, `Self-serve`). A sentence on a badge line breaks the row scan; prose belongs only on the final rationale line.
- Cards with different criteria
  - When each option needs its own criteria list, the comparison fails — use `cards-stack` so each card has full prose breathing room instead.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `compare-prose` — exactly two options with prose bodies
- `split-compare` — two options with a bottom verdict bar
- `obligation-matrix` — many regimes scored on shared obligations in a table
- `compare-table` — cells are textual values, not state markers
- `checklist` — one set of criteria, not many options against them
