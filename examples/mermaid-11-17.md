---
marp: true
theme: indaco
paginate: true
header: "Lattice · Mermaid 11.17"
---

<!-- _class: title silent -->

# Mermaid 11.17 in the deck palette

`Diagram · vendored Mermaid 11.14 to 11.17`

The vendored Mermaid moved up a minor, which brings its label sanitizer from DOMPurify 3.3.1 to 3.4.12. The next pages show what changed on the slide.

---

<!-- _class: diagram -->

## A C4 context diagram keeps the deck's colors.

```mermaid
C4Context
  Person(buyer, "Buyer")
  System(shop, "Storefront")
  Rel(buyer, shop, "Orders")
```

---

<!-- _class: diagram -->

## People are drawn as a head and a body.

```mermaid
C4Context
  Person(analyst, "Analyst")
  Person_Ext(auditor, "Auditor")
  Rel(auditor, analyst, "Checks")
```

---

<!-- _class: diagram sketch -->

## A sketch slide now draws C4 by hand too.

```mermaid
C4Context
  Person(lead, "Team lead")
  System(board, "Planning board")
  Rel(lead, board, "Ranks")
```

---

<!-- _class: diagram -->

## A block diagram's cylinders fit their labels.

```mermaid
block-beta
  columns 3
  Frontend["Frontend"] Backend["Backend"] Orders[("Orders DB")]
  space:3
  Cache(("Cache")) Queue(("Queue")) Storage[("Object storage")]
```

---

<!-- _class: diagram dark -->

## C4 keeps the palette on a dark slide too.

```mermaid
C4Context
  System(shop, "Storefront")
  System_Ext(bank, "Card network")
  Rel(shop, bank, "Charges")
```

---

<!-- _class: closing silent -->

# Every diagram still takes its colors from the palette

`Mermaid 11.17 · Lattice theme`
