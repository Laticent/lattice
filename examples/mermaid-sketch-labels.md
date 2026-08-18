---
marp: true
theme: indaco
paginate: true
mode: sketch
header: "Meridian Freight · platform review"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Diagram type · engine`

# The hand reaches the diagram

A sketch deck used to wrap hand-drawn shapes around machine-faced labels. Now the whole slide speaks in one voice — including the diagrams.

---

<!-- _class: diagram -->

`Flowchart · consignment intake`

## Where a booking can stop, and who is holding it.

```mermaid
flowchart LR
  A["Booking received<br/>(EDI 204 / portal)"] --> B{"Customs<br/>documents complete?"}
  B -- "No" --> C["Hold for broker<br/>SLA 4h"]
  C --> B
  B -- "Yes" --> D["Capacity match<br/>lane + equipment"]
  D --> E{"Carrier<br/>accepts tender?"}
  E -- "Declined ×3" --> F["Escalate to spot market"]
  E -- "Accepted" --> G["Dispatch confirmed"]
  F --> G
  G --> H["Track & trace active"]
```

---

<!-- _class: diagram -->

`State diagram · consignment lifecycle`

## Every status a shipper can see, and the transitions we allow.

```mermaid
stateDiagram-v2
  [*] --> Quoted
  Quoted --> Tendered: rate accepted
  Tendered --> Dispatched: carrier confirms
  Tendered --> Quoted: tender expired
  Dispatched --> InTransit: first GPS ping
  InTransit --> Exception: dwell > 6h
  Exception --> InTransit: recovery plan filed
  Exception --> Cancelled: shipper withdraws
  InTransit --> Delivered: POD captured
  Delivered --> Invoiced: rate audit passed
  Invoiced --> [*]
```

---

<!-- _class: diagram -->

`Class diagram · domain model`

## The four aggregates the booking service owns.

```mermaid
classDiagram
  class Consignment {
    +String reference
    +Money declaredValue
    +Instant readyAt
    +tender(Carrier) Tender
    +recordException(Reason)
  }
  class Tender {
    +Money linehaulRate
    +Duration expiresIn
    +accept() Dispatch
  }
  class Carrier {
    +String scacCode
    +Float onTimePercent
    +Boolean bondedForCustoms
  }
  class Invoice {
    +Money settledAmount
    +auditAgainst(Tender)
  }
  Consignment "1" --> "0..*" Tender : offers
  Tender "1" --> "1" Carrier : awarded to
  Consignment "1" --> "0..1" Invoice : settles
```

---

<!-- _class: diagram -->

`Entity relationship · settlement schema`

## What rate audit actually joins across.

```mermaid
erDiagram
  SHIPPER ||--o{ CONSIGNMENT : books
  CONSIGNMENT ||--|{ LEG : "moves over"
  LEG }o--|| CARRIER : "hauled by"
  CONSIGNMENT ||--o| INVOICE : settles
  INVOICE ||--|{ ACCESSORIAL : "itemises"
  CARRIER ||--o{ RATE_AGREEMENT : "prices under"
  RATE_AGREEMENT ||--o{ LANE : covers
```

---

<!-- _class: content -->

`Why it was never a CSS fix`

## Mermaid measures a label in the browser that renders it.

- The measurement happened somewhere else
  - The export shelled out to a binary whose page carries none of the deck's fonts, so every label was sized in a fallback face.
- Then the paint moved
  - The finished SVG lands in the deck, where the real face loads — and the box no longer fits the text it was measured for.
- Why mono never showed it
  - Its stack ends in the `monospace` generic, whose fallback metrics nearly match. No hand face has that luck.

---

<!-- _class: diagram -->

`Sequence · legacy renderer`

## Machine-drawn shapes, hand type — the tender API round trip.

```mermaid
sequenceDiagram
  participant S as Shipper portal
  participant B as Booking service
  participant R as Rating engine
  participant C as Carrier API
  S->>B: POST /consignments
  B->>R: price(lane, equipment, readyAt)
  R-->>B: 3 rate options
  B->>C: tender(bestRate)
  C-->>B: 202 Accepted (ref MRD-8841)
  B-->>S: dispatch confirmed
  Note over B,C: tender expires in 45 min
```

---

<!-- _class: diagram -->

`Gantt · legacy renderer`

## The migration plan, in the deck's own voice.

```mermaid
gantt
  dateFormat YYYY-MM-DD
  axisFormat %b
  title Rate audit migration
  section Foundations
    Schema backfill      :done,    a1, 2026-01-06, 40d
    Dual-write shadow    :done,    a2, after a1, 30d
  section Cutover
    Read traffic 10%     :active,  b1, 2026-04-01, 21d
    Read traffic 100%    :         b2, after b1, 28d
  section Decommission
    Retire legacy audit  :         c1, after b2, 35d
```

---

<!-- _class: diagram boardroom -->
<!-- _header: "Meridian Freight · platform review · opted out" -->

`Per-slide opt-out`

## One slide can step out of the finish entirely.

```mermaid
flowchart LR
  A["Booking received"] --> B["Capacity match"]
  B --> C["Dispatch confirmed"]
  C --> D["Track & trace active"]
```

---

<!-- _class: content -->

`Where the shape answer stops`

## Texture outranks the finish, and always did.

- Pattern is data, not decoration
  - On `a11y-*`, `onyx` and `concrete` the per-category texture is how a color-blind or monochrome reader tells nodes apart.
- A hachure cannot carry a tile
  - Painted through a 4px variable-width stroke, four distinct patterns collapse to four grays 5% apart.
- So those decks split the difference
  - Machine-drawn shapes, hand type. Style never overwrites an accessibility affordance.
