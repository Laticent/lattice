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

`inventory` made its entry name out of markup the author typed: drop the asterisks and the name rendered as body prose. `redline` had the opposite problem — its label ate the sentence after it. Both now take a plain lead. And on `matrix-2x2`, typing the bold made the label *lighter*.

---

<!-- _class: content -->

`The measurement`

## Typing the bold was never optional.

Counting `<strong>` elements said four components depended on typed bold. Measuring the rendered weight said one did. On `matrix-2x2` and `verdict-grid` the card `li` is already `font-weight:700`, so the label was bold from the layout all along — the element was inert on one and, on the other, one step lighter than no element at all.

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

Every path skips a row whose lead is already a `<strong>`, so a deck still written the old way — `- **Signal Intake.** Weekly collection…` — produces the same markup it always did. `lint:deck` warns and offers the autofix; it does not refuse the deck. Our own 86 rows moved because `inventory` and `redline` need the nested shape to bound the label, not as a style sweep.

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
<!-- _footer: "matrix-2x2 · the card li sets the weight; a typed label now inherits it" -->

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
<!-- _footer: "verdict-grid · already correct — it neutralised the typed label all along" -->

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
