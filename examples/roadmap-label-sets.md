---
marp: true
theme: indaco
paginate: true
header: "Lattice · roadmap label sets"
---

<!-- _class: title silent -->

# "Shipped" is a product word.

`Label sets · roadmap · the key stops assuming your domain`

A roadmap already draws its own status key — one chip per state the grid
carries, in lifecycle order. Until now it drew that key in **product English**,
and no deck could say otherwise. The words are now a *default*.

---

<!-- _class: roadmap -->
<!-- _footer: "Default · the manifest's words, unchanged" -->

## A delivery plan reads correctly out of the box.

| Workstream | Q1 | Q2 | Q3 |
| --- | --- | --- | --- |
| Platform | [x] Auth rewrite | [-] Billing API | [ ] Multi-region |
| Mobile | [x] iOS 18 | [-] Offline sync | [/] Watch app |
| Data | [x] Warehouse | [ ] Lineage | [ ] Self-serve |

The key is derived: the states these cells use, in lifecycle order.

---

<!-- _class: roadmap -->
<!-- _footer: "Overridden · two words renamed, two left alone" -->

`[{[x], Enacted}, {[-], In committee}]`

## The same grid, for a legislative programme.

| Workstream | Q1 | Q2 | Q3 |
| --- | --- | --- | --- |
| Privacy | [x] SB-21 passed | [-] Markup | [ ] Drafting |
| Tax | [x] HB-9 passed | [/] Withdrawn | [ ] Drafting |
| Energy | [x] SB-4 passed | [-] Floor vote | [ ] Drafting |

Two renamed; the two left unnamed keep their defaults.

---

<!-- _class: roadmap -->
<!-- _footer: "The key is the marker you already type" -->

`[{[ ], Not started}]`

## Address a state by its marker, not its name.

| Workstream | Now | Next |
| --- | --- | --- |
| Research | [x] Interviews | [ ] Synthesis |
| Design | [-] Wireframes | [ ] Prototype |

The key is the empty marker written out in full, brackets included — exactly
as the cell spells it.

---

<!-- _class: roadmap -->
<!-- _footer: "Derived · only the states present get a row" -->

`[{[x], Landed}, {[/], Cut}]`

## A key never names a state the grid does not carry.

| Workstream | Sprint 12 | Sprint 13 |
| --- | --- | --- |
| Checkout | [x] Apple Pay | [x] Gift cards |
| Search | [x] Typo tolerance | [/] Voice input |

No cell here is in flight or planned, so neither gets a chip.

---

<!-- _class: roadmap status -->
<!-- _footer: "status · every cell labels itself, so no key at all" -->

## One variant still draws no key, and should not.

| Workstream | Q1 | Q2 |
| --- | --- | --- |
| Platform | [x] Auth rewrite | [-] Billing API |
| Mobile | [x] iOS 18 | [ ] Offline sync |

The `status` variant prints the state on every cell. A key repeating those
words would be chrome with nothing to say, so it is suppressed — with or
without an authored label set.

---

<!-- _class: list -->
<!-- _footer: "What this slide deck demonstrates" -->

## What the label set changed here.

- Words are a default, not a vocabulary
  - The manifest declares them, and the deck lint checks your keys against it
- The merge is partial and by key
  - Rename one state; the rest keep theirs
- Order stays the lifecycle's
  - Never the order you happened to list them in
- Everything the key already did, it still does
  - One chip per state present, and none at all when nothing is marked
