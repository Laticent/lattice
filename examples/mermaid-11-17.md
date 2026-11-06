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
  Person(buyer, "Buyer", "Places orders")
  System(shop, "Storefront", "Takes the order")
  System_Ext(bank, "Card network", "Clears the payment")
  Rel(buyer, shop, "Orders from")
  Rel(shop, bank, "Charges through")
```

---

<!-- _class: diagram -->

## People are drawn as a head and a body.

```mermaid
C4Context
  Person(analyst, "Analyst", "Reads the report")
  Person_Ext(auditor, "Auditor", "Checks the numbers")
  System(reports, "Reporting", "Builds the monthly pack")
  Rel(analyst, reports, "Reads")
  Rel(auditor, reports, "Samples")
```

---

<!-- _class: diagram sketch -->

## A sketch slide now draws C4 by hand too.

```mermaid
C4Context
  Person(lead, "Team lead", "Plans the sprint")
  System(board, "Planning board", "Holds the backlog")
  Rel(lead, board, "Ranks work on")
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

## The same C4 colors hold on a dark slide.

```mermaid
C4Context
  Person(buyer, "Buyer", "Places orders")
  System(shop, "Storefront", "Takes the order")
  System_Ext(bank, "Card network", "Clears the payment")
  Rel(buyer, shop, "Orders from")
  Rel(shop, bank, "Charges through")
```

---

<!-- _class: closing silent -->

# Every diagram still takes its colors from the palette

`Mermaid 11.17 · Lattice theme`
