---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · Headers are not typed"
footer: "inventory · matrix-2x2 · verdict-grid · redline"
acronyms:
  DSAR: "dee-sar"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->

`Slot labels · lib/core/slot-label-lift.js`

# A header is bold because the layout says so

Four components used to make their item header out of markup the author typed. Drop the asterisks and the header vanished — emphasis meant as decoration was holding up the structure. All four now supply their own label, and the asterisks buy nothing.

---

<!-- _class: content -->

`The measurement`

## Typing the bold was never optional.

The same slides rendered twice, once with the asterisks and once without, then the HTML compared: `inventory`, `matrix-2x2` and `verdict-grid` came back with zero `<strong>` elements. `redline` kept one, and it had swallowed the sentence after it.

---

<!-- _class: inventory -->
<!-- _footer: "inventory · `- Name` over `  - detail`, the shape decks are written in now" -->

## The name is plain text; the layout sets it.

- Signal Intake
  - Weekly collection across conversations and market data.
- Scoring Model
  - Scored on confidence, recency, and relevance.
- Decision Log
  - Every call recorded with the signals behind it.
- Calibration Loop
  - Outcomes compared to predictions each cycle.

> The lift wraps the lead; the CSS was always ready for it.

---

<!-- _class: content -->
<!-- _footer: "nothing breaks · the lift is idempotent" -->

`No deck breaks`

## The retired shape still renders, so nothing had to be rewritten to keep working.

Every path skips a row whose lead is already a `<strong>`, so a deck still written the old way — `- **Signal Intake.** Weekly collection…` — produces the same markup it always did. `lint:deck` warns and offers the autofix; it does not refuse the deck. Our own 86 rows moved because the reference decks should model the shape we mean, not because they would otherwise have broken.

---

<!-- _class: redline -->
<!-- _footer: "redline · the label stops at the label" -->

## The one visible fix: a label that ate its sentence.

`Cal. Civ. Code §1798.135 · amendment SB-362 (2024)`

> A business that <del>collects</del> <ins>collects, sells, or shares</ins> consumers' personal information shall provide <del>two or more</del> <ins>at least one</ins> designated method for submitting requests to opt-out.

- Why this matters
  - Sale and sharing collapse into one duty, and the homepage link title is now fixed — chrome and DSAR workflows both need the uniform wording.

---

<!-- _class: matrix-2x2 -->
<!-- _footer: "matrix-2x2 · quadrant labels, unbolded" -->

## Where each option lives.

- High value · Low cost
  - Ship this quarter
  - Two named owners
- High value · High cost
  - Fund the strategic bet
- Low value · Low cost
  - Absorb into existing work
- Low value · High cost
  - Decline, and say why

---

<!-- _class: verdict-grid -->
<!-- _footer: "verdict-grid · option names, unbolded" -->

## Which option meets the criteria.

- Rewrite the transform
  - [x] Correct
  - [-] Cheap
  - [ ] Reversible
  - Right answer, wrong quarter — the cost lands on everyone.
- Patch the call site
  - [x] Cheap
  - [x] Reversible
  - [-] Correct
  - Buys a quarter and leaves the defect where it is.
- Register the layout
  - [x] Correct
  - [x] Cheap
  - [x] Reversible
  - One line in the shared kernel; the old decks keep rendering.

---

<!-- _class: closing -->
<!-- _paginate: false -->

`Inline emphasis is still yours`

# Bold in a sentence is decoration; bold as a header was a declaration

`**Reach** is the other axis` is emphasis and always was. What changed is that no layout now needs you to type its header for it.
