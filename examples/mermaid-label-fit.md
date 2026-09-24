---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · Mermaid labels fit their boxes"
---

<!-- _class: title -->
<!-- _paginate: false -->

# Mermaid labels fit their boxes

A diagram on a plain slide no longer takes the slide's paragraph size

---

<!-- eyebrow: Flowchart, left to right -->

# How an order moves

```mermaid
flowchart LR
  A[Order placed] --> B[Payment checked] --> C[Stock reserved] --> D[Picked] --> E[Packed] --> F[Label printed] --> G[Shipped] --> H[Delivered]
```

Each label sits whole and centered in its box. Before, every one was clipped to its first few letters.

---

<!-- eyebrow: Flowchart, top to bottom -->

# Approving a change

```mermaid
flowchart TB
  A[Draft written] --> B{Reviewed?}
  B -- yes --> C[Approved for release]
  B -- no --> D[Returned with notes]
  D --> A
```

A decision diamond keeps its question inside its outline.

---

<!-- eyebrow: Sequence diagram -->

# Paying an invoice

```mermaid
sequenceDiagram
  Customer->>Billing: Submit payment
  Billing->>Bank: Authorize the card
  Bank-->>Billing: Approved
  Billing-->>Customer: Receipt sent
```

A sequence diagram is unchanged: it draws its labels as SVG text, not in a paragraph.

---

<!-- eyebrow: State diagram -->

# The life of a ticket

```mermaid
stateDiagram-v2
  [*] --> Open
  Open --> InProgress
  InProgress --> Resolved
  Resolved --> Closed
  Closed --> [*]
```

State names fit their rounded boxes at the size Mermaid measured them.

---

<!-- _class: closing -->

# Why it happened

Mermaid measures each box at 14px, then wraps the label in a paragraph, and the slide's body-text rule restyled that paragraph at about 21px. A diagram now keeps its own type.
