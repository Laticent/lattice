---
marp: true
theme: indaco
pagination: true
header: "Lattice · verdict-grid"
---

<!-- @meta{layout=title, class=silent} -->

# verdict-grid

`Comparison · Grid · Structure`

Options scored against criteria as a verdict matrix.

---

<!-- @meta{layout=verdict-grid, footer=Default · verdict-grid} -->

## The grid scores options against shared criteria.

- **Option one.**
  - [!] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [?] Criterion
  - Unknown is not a no.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- @meta{layout=verdict-grid, footer="Stress test · verdict-grid — Five options — the hard ceiling."} -->
<!-- @meta{stress-slide} -->

## Five options is the verdict grid's ceiling.

- **First.**
  - [!] Check
  - [!] Check
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
  - The hard stop; six wants table.


---

<!-- @meta{layout=verdict-grid, class=dark, footer=Composition: dark · verdict-grid dark} -->

## The grid scores options against shared criteria.

- **Option one.**
  - [!] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [?] Criterion
  - Unknown is not a no.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- @meta{layout=verdict-grid, class=compact, footer=Composition: compact · verdict-grid compact} -->

## The grid scores options against shared criteria.

- **Option one.**
  - [!] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [?] Criterion
  - Unknown is not a no.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- @meta{layout=verdict-grid, class=accent, footer=Composition: accent · verdict-grid accent} -->

## The grid scores options against shared criteria.

- **Option one.**
  - [!] Criterion
  - [-] Criterion
  - Why the checks land this way.
- **Option two.**
  - [x] Criterion
  - [?] Criterion
  - Unknown is not a no.
- **Option three.**
  - [x] Criterion
  - [x] Criterion
  - The sweep is the verdict. Recommended.


---

<!-- @meta{layout=cards-grid, class=claim-hero, footer=Anti-patterns · verdict-grid · 1 of 2} -->

## When NOT to reach for verdict-grid.

- Exactly two options
  - Two options with shared criteria belong in `compare-prose` or `split-compare`. verdict-grid earns its layout at 3+ options.
- No rationale line
  - Every option must end with a marker-less prose line — the verdict for that card. Omit it and the card renders empty below the criteria, and the focal last card has nothing to recommend. The rationale is required, not optional.

---

<!-- @meta{layout=cards-grid, class=claim-hero, footer=Anti-patterns · verdict-grid · 2 of 2} -->

## When NOT to reach for verdict-grid.

- Criterion longer than two words
  - The text after the marker is a pill's label, not a sentence — two words at most (`Residency`, `Self-serve`). A sentence on a criterion line breaks the row scan; prose belongs only on the final rationale line.
- Cards with different criteria
  - When each option needs its own criteria list, the comparison fails — use `cards-stack` so each card has full prose breathing room instead.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `compare-prose` — exactly two options with prose bodies
- `split-compare` — two options with a bottom verdict bar
- `obligation-matrix` — many regimes scored on shared obligations in a table
- `table` — cells are textual values, not state markers
- `checklist` — one set of criteria, not many options against them
