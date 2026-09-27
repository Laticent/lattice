---
marp: true
theme: indaco
paginate: true
header: "Lattice · panes"
footer: "Mermaid in a pane — it lays out for the pane's box"
---

<!-- _class: title silent -->

# A diagram lays out for its pane

`Panes · Mermaid orientation`

---

<!-- _class: diagram -->

`Delivery · The full-slide diagram`

## Five stages, left to right, as a slide draws them.

```mermaid
flowchart LR
  A[Intake] --> B[Triage] --> C[Build] --> D[Review] --> E[Ship]
```

---

## In a tall pane, the same flow runs down the page.

<!-- panes: 35/65 -->
<!-- pane: diagram -->

```mermaid
flowchart LR
  A[Intake] --> B[Triage] --> C[Build] --> D[Review] --> E[Ship]
```

<!-- pane: list -->

- Intake takes a day
- Review holds work for a week
- Ship is weekly

---

`Delivery · A wide pane`

## Two teams share the same five stages.

<!-- panes: 65/35 -->
<!-- pane: diagram -->

```mermaid
flowchart LR
  A[Intake] --> B[Triage] --> C[Build] --> D[Review] --> E[Ship]
```

<!-- pane: list -->

- Platform ships Mondays
- Apps ship Thursdays

> A 65% pane is wide, so the flowchart keeps the author's direction.

---

`Delivery · A vertical source`

## A top-down flowchart needs nothing from the pane.

<!-- panes: 35/65 -->
<!-- pane: diagram -->

```mermaid
flowchart TB
  A[Request] --> B{Approved?}
  B -->|yes| C[Build]
  B -->|no| D[Close]
```

<!-- pane: list -->

- Most requests pass on the first review
- A closed request can be filed again

> Only a left-to-right or right-to-left flowchart is turned; every other diagram keeps its source.

---

`Delivery · A sequence`

## The hand-off is two messages.

<!-- panes: 55/45 -->
<!-- pane: diagram -->

```mermaid
sequenceDiagram
  Triage->>Build: ticket ready
  Build->>Review: change ready
```

<!-- pane: list -->

- Triage owns the ticket until Build accepts it
- Review sees only finished changes

---

<!-- _class: title silent -->

# The pane decides the direction

`The CLI and the live preview read the same stamp`
