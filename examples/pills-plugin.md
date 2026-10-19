---
marp: true
theme: indaco
paginate: true
header: "Lattice · pills plugin"
---

<!-- _class: title silent -->

# One pill, built once

`Plugin · Embedded · Structure`

A pill is `` `{LABEL}` `` in inline code, drawn by one plugin that is part of every
slide. Components place and tint it; none of them paints its own.

---

<!-- _class: list -->
<!-- _footer: "the notation · shape, color and size words in any order" -->

## A label first, then the words that shape it.

- Settlement engine shipped and load-tested `{STABLE, c2}`
- Ledger migration paused for review `{PARTIAL, c4}`
- Audit export is next on the list `{NEXT, tag, c6}`
- Open questions still on the table `{3, circle}`
- Needs a decision this week `{?, diamond}`
- A label with a comma takes quotes `{"Dana Whitfield, VP Sales"}`

---

<!-- _class: cards-grid -->
<!-- _footer: "cards-grid · the card places the pill; the plugin draws it" -->

## A card title can carry a pill.

- Signal Intake `{v2.4}`
  - Handles 94% of structured signals without manual intervention.
- Scoring Model `{configurable}`
  - Three dimensions: confidence, recency, relevance.
- Decision Log `{required}`
  - Every prioritization change above P2 must carry a rationale.
- Calibration Loop `{monthly}`
  - Compares predicted outcomes to actuals.

---

<!-- _class: kpi -->
<!-- _footer: "kpi · uppercase, wide tracking and the status color are the tile's, passed in" -->

## The tile asks for capitals and a status color.

1. 4
   - tiles per row
   - the ceiling `{On plan}`
2. 8
   - words per tile
   - soft budget `{Board}`
3. 5s
   - scan time
   - the target `{On plan}`

---

<!-- _class: actors -->
<!-- _footer: "actors · each row hands the pill its categorical hue" -->

## Each owner gets a color from the row.

- Owns the scoring model `{Head of Product}`
  - The one person who can change a weight.
- Runs the weekly signal review `{Chief of Staff}`
  - Convenes it, chairs it, publishes the notes.
- Maintains the decision log `{Program Manager}`
  - Every entry has an owner and a date.

---

<!-- _class: regulatory-update -->
<!-- _footer: "regulatory-update · the accent-tinted effective-date pill" -->

## The last bullet of a row can be a pill.

`Federal · State · International`

1. EU AI Act
   - `Title III`
   - Conformity-assessment pre-market obligation took effect.
   - `{Effective Feb 2026}`
2. Colorado AI Act
   - `SB 24-205`
   - Developer and deployer duties for consequential-decision systems.
   - `{Effective Feb 2026}`
3. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order; clarifies the deception standard.
   - `{Final Mar 2026}`

---

<!-- _class: roadmap -->
<!-- _footer: "roadmap · the header pill sits on the spectrum line, sized from the grid cell" -->

## A phase header can carry its date.

| Workstream | Foundation `{Q2 2026}` | Hardening `{Q3 2026}` | Scale `{Q4 2026}` |
|---|---|---|---|
| Signal intake | [x] Connector v1 | [-] Dedupe pass | [ ] Auto-routing |
| Scoring | [x] Weights v1 | [-] Calibration | [ ] Per-team models |

---

<!-- _class: glossary -->
<!-- _footer: "glossary · the range pill is built by the plugin, in the engine and the runtime alike" -->

## Three terms the deck leans on.

- Consent
  - A freely given, specific, informed agreement to processing.
- Controller
  - The party that decides why and how personal data is processed.
- Processor
  - A party that processes data on the controller's instructions.

---

<!-- _class: title silent -->

# The plugin draws, the component places

`--lat-pill-edge · -bg · -ink · -case · -tracking · -size · -cap · -scale`

A pill reads those properties and nothing else. A bare trailing `` `code` ``
is plain inline code; `lint:deck` says where a pill used to be.
