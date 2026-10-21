---
marp: true
theme: indaco
paginate: true
header: "Lattice · Mermaid pie legibility"
---

<!-- _class: title silent -->

`Fix demo · Mermaid pie`

# A pie you can read from the back row.

---

<!-- _class: diagram -->

`Pie beside a callout · the case that shipped at 8px`

## Legend and wedge labels hold a readable size.

```mermaid
pie showData
  "Deck production" : 46
  "Meetings about meetings" : 22
  "Realigning on priorities" : 18
  "Stakeholder management" : 9
  "Actually deciding" : 5
```

> The legend and the wedge percentages draw at 20px and 22px in the diagram's own units. On this slide they land near 12px and 13px; they used to land near 8px and 9px.

---

<!-- _class: diagram -->

## A pie with only two wedges.

```mermaid
pie showData
  "Shipped" : 72
  "Slipped" : 28
```

---

<!-- _class: diagram -->

## Long labels widen the legend, not the pie.

```mermaid
pie showData
  "Customer-facing onboarding and implementation" : 38
  "Internal tooling, platform and reliability work" : 31
  "Security review, audits and compliance evidence" : 19
  "Everything else" : 12
```

---

<!-- _class: diagram -->

## Ten wedges stay legible.

```mermaid
pie showData
  "Alpha" : 18
  "Bravo" : 15
  "Charlie" : 13
  "Delta" : 11
  "Echo" : 10
  "Foxtrot" : 9
  "Golf" : 8
  "Hotel" : 7
  "India" : 5
  "Juliet" : 4
```

---

<!-- _class: diagram dark -->

## The same pie on a dark slide.

```mermaid
pie showData
  "Deck production" : 46
  "Meetings about meetings" : 22
  "Realigning on priorities" : 18
  "Stakeholder management" : 9
  "Actually deciding" : 5
```
