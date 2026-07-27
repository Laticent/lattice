---
marp: true
theme: indaco
paginate: true
header: "Lattice · matrix-grid"
---

<!-- _class: title silent -->

# matrix-grid

`Comparison · Matrix · Structure`

Two ordered axes as an N×M chart-family grid — each cell marks a position (filled / reachable / not applicable), colored by its row's category from the theme's chart palette.

---

<!-- _class: matrix-grid -->
<!-- _footer: "Default · matrix-grid" -->

`Wider reach → · Deeper cognition ↑`

## Your level is a cell, not a rung.

Your title is the diagonal — the same verb at a wider reach is a different level.

| Verb | Self | Team | Org | Field |
| ---------- | :--: | :--: | :--: | :---: |
| Create     | [ ]  | [-]  | [-]  | [x] Distinguished |
| Evaluate   | [ ]  | [-]  | [x] Principal | [-] |
| Analyze    | [ ]  | [-]  | [x] Staff | [-] |
| Apply      | [-]  | [x] Senior | [-] | [ ] |
| Understand | [x] Mid | [-] | [ ] | [ ] |
| Remember   | [x] Junior | [-] | [ ] | [ ] |

**Your level** · *where you can operate when called for* — illustrative, placements vary by company.


---

<!-- _class: matrix-grid -->
<!-- stress-slide -->
<!-- _footer: "Stress test · matrix-grid — Six categories by five scope columns." -->

## Six categories by five columns is the grid's practical ceiling.

| Discipline | Self | Pair | Team | Org | Field |
| --- | :--: | :--: | :--: | :--: | :--: |
| Vision    | [ ] | [ ] | [-] | [-] | [x] Chief |
| Strategy  | [ ] | [-] | [-] | [x] VP | [-] |
| Execution | [ ] | [-] | [x] Director | [-] | [ ] |
| Delivery  | [-] | [x] Manager | [-] | [ ] | [ ] |
| Craft     | [x] Senior | [-] | [ ] | [ ] | [ ] |
| Basics    | [x] Associate | [ ] | [ ] | [ ] | [ ] |


---

<!-- _class: matrix-grid dark -->
<!-- _footer: "Composition: dark · matrix-grid dark" -->

`Wider reach → · Deeper cognition ↑`

## Your level is a cell, not a rung.

Your title is the diagonal — the same verb at a wider reach is a different level.

| Verb | Self | Team | Org | Field |
| ---------- | :--: | :--: | :--: | :---: |
| Create     | [ ]  | [-]  | [-]  | [x] Distinguished |
| Evaluate   | [ ]  | [-]  | [x] Principal | [-] |
| Analyze    | [ ]  | [-]  | [x] Staff | [-] |
| Apply      | [-]  | [x] Senior | [-] | [ ] |
| Understand | [x] Mid | [-] | [ ] | [ ] |
| Remember   | [x] Junior | [-] | [ ] | [ ] |

**Your level** · *where you can operate when called for* — illustrative, placements vary by company.


---

<!-- _class: matrix-grid compact -->
<!-- _footer: "Composition: compact · matrix-grid compact" -->

`Wider reach → · Deeper cognition ↑`

## Your level is a cell, not a rung.

Your title is the diagonal — the same verb at a wider reach is a different level.

| Verb | Self | Team | Org | Field |
| ---------- | :--: | :--: | :--: | :---: |
| Create     | [ ]  | [-]  | [-]  | [x] Distinguished |
| Evaluate   | [ ]  | [-]  | [x] Principal | [-] |
| Analyze    | [ ]  | [-]  | [x] Staff | [-] |
| Apply      | [-]  | [x] Senior | [-] | [ ] |
| Understand | [x] Mid | [-] | [ ] | [ ] |
| Remember   | [x] Junior | [-] | [ ] | [ ] |

**Your level** · *where you can operate when called for* — illustrative, placements vary by company.


---

<!-- _class: matrix-grid accent -->
<!-- _footer: "Composition: accent · matrix-grid accent" -->

`Wider reach → · Deeper cognition ↑`

## Your level is a cell, not a rung.

Your title is the diagonal — the same verb at a wider reach is a different level.

| Verb | Self | Team | Org | Field |
| ---------- | :--: | :--: | :--: | :---: |
| Create     | [ ]  | [-]  | [-]  | [x] Distinguished |
| Evaluate   | [ ]  | [-]  | [x] Principal | [-] |
| Analyze    | [ ]  | [-]  | [x] Staff | [-] |
| Apply      | [-]  | [x] Senior | [-] | [ ] |
| Understand | [x] Mid | [-] | [ ] | [ ] |
| Remember   | [x] Junior | [-] | [ ] | [ ] |

**Your level** · *where you can operate when called for* — illustrative, placements vary by company.


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · matrix-grid" -->

## When NOT to reach for matrix-grid.

- Pass/fail or delivery status
  - If cells mean shipped/at-risk/blocked, use `obligation-matrix` or `roadmap` — their semantic state palette (pass/warn/fail) is built for exactly that read, and matrix-grid's categorical row colors would mislead.
- More than one filled cell per row
  - Each row names one position — one `[x]`. Multiple filled cells in a row breaks the "this is where you are" read; use `[-]` for the cells the row can still reach.
- Unordered axes
  - The grid earns its shape when both axes have a real order (shallow → deep, narrow → wide). Two free categorical labels belong in `matrix-2x2`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `obligation-matrix` — rows × columns of pass/partial/exempt status, not a single position
- `roadmap` — phases × workstreams delivery status
- `matrix-2x2` — two free axes, four cells, qualitative placement
- `verdict-grid` — options scored against shared criteria, one card per option
