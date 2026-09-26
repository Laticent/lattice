---
marp: true
theme: indaco
paginate: true
header: "Lattice · hub-spoke"
---

<!-- _class: title silent -->

# hub-spoke

`Evidence · Canvas · Series`

Hub and spoke — one center, its satellites, and what flows between them.

---

<!-- _class: hub-spoke -->
<!-- _footer: "Default · hub-spoke" -->

`Transformation program · Workstream status · Q3`

## Two of six workstreams are off track.

- Program office
  - Customer onboarding
  - Core platform migration `at-risk`
    - Cutover slipped from August to October
    - Vendor data mapping is 60% complete
  - Data governance
  - Vendor consolidation `blocked`
    - Waiting on the procurement freeze to lift
  - Branch network
  - Workforce reskilling


---

<!-- _class: hub-spoke sized -->
<!-- _footer: "sized · hub-spoke sized — Disc area carries each value." -->

`FY2026 · Partner channel revenue · share of $120M`

## Two partners carry half of channel revenue.

- Channel revenue `$120M`
  - Atlas Distribution `28%`
  - Keystone Resellers `22%`
  - Northgate Systems `18%`
  - Brightline Retail `13%`
  - Summit Online `11%`
  - Harborview Telecom `8%`


---

<!-- _class: hub-spoke flow-out -->
<!-- _footer: "flow-out · hub-spoke flow-out — Arrowheads and stepped connector weight." -->

`Memphis distribution center · Pallets per week`

## The Northeast and Southeast take over half of outbound volume.

- Memphis DC `12,000`
  - Northeast `3,600`
  - Southeast `3,100`
  - Midwest `2,400`
  - Southwest `1,700`
  - West `1,200`
  - Returns center `400` `flow:in`


---

<!-- _class: hub-spoke flow-in -->
<!-- _footer: "flow-in · hub-spoke flow-in — Heads point at the hub." -->

`Data platform · Records ingested per day`

## Billing and the web store send two thirds of what the lake takes in.

- Data lake `45M`
  - Billing `16M`
  - Web store `14M`
  - Mobile app `8M`
  - Call center `4M`
  - Partner feeds `3M`


---

<!-- _class: hub-spoke flow-both -->
<!-- _footer: "flow-both · hub-spoke flow-both — Two-way flow on every spoke." -->

`Shared services · Tickets per month`

## Finance and HR trade the most work with the service desk.

- Service desk `9,400`
  - Finance `2,900`
  - HR `2,600`
  - Facilities `1,500`
  - Legal `1,300`
  - Procurement `1,100`


---

<!-- _class: hub-spoke tiered -->
<!-- _footer: "tiered · hub-spoke tiered — Branches, with leaves off each one." -->

`Platform organization · Service ownership · 2026`

## Four platform teams own eleven services; two are in trouble.

- Platform org
  - Payments
    - Card issuing
    - Acquiring
    - Fraud scoring `at-risk`
  - Data
    - Warehouse
    - Streaming
    - ML platform
  - Identity
    - Login
    - Consent
  - Core banking
    - Ledger `blocked`
    - Accounts
    - Statements


---

<!-- _class: hub-spoke -->
<!-- stress-slide -->
<!-- _footer: "Stress test · hub-spoke — Twelve satellites in four groups — the cap." -->

`Partner ecosystem · By capability`

## Stress test — twelve partners across four capabilities, three apiece.

- Lattice platform
  - Northwind Data `Data`
  - Quarry Analytics `Data`
  - Lumen Warehouse `Data`
  - Halcyon Pay `Payments`
  - Arbor Identity `Payments`
  - Ledgerline `Payments`
  - Beacon Retail `Distribution`
  - Keel Logistics `Distribution`
  - Harbor Freight Co `Distribution`
  - Tessera Cloud `Infrastructure`
  - Stratus Edge `Infrastructure`
  - Pylon Networks `Infrastructure`


---

<!-- _class: hub-spoke dark -->
<!-- _footer: "Composition: dark · hub-spoke dark" -->

`Transformation program · Workstream status · Q3`

## Two of six workstreams are off track.

- Program office
  - Customer onboarding
  - Core platform migration `at-risk`
    - Cutover slipped from August to October
    - Vendor data mapping is 60% complete
  - Data governance
  - Vendor consolidation `blocked`
    - Waiting on the procurement freeze to lift
  - Branch network
  - Workforce reskilling


---

<!-- _class: hub-spoke compact -->
<!-- _footer: "Composition: compact · hub-spoke compact" -->

`Transformation program · Workstream status · Q3`

## Two of six workstreams are off track.

- Program office
  - Customer onboarding
  - Core platform migration `at-risk`
    - Cutover slipped from August to October
    - Vendor data mapping is 60% complete
  - Data governance
  - Vendor consolidation `blocked`
    - Waiting on the procurement freeze to lift
  - Branch network
  - Workforce reskilling


---

<!-- _class: hub-spoke accent -->
<!-- _footer: "Composition: accent · hub-spoke accent" -->

`Transformation program · Workstream status · Q3`

## Two of six workstreams are off track.

- Program office
  - Customer onboarding
  - Core platform migration `at-risk`
    - Cutover slipped from August to October
    - Vendor data mapping is 60% complete
  - Data governance
  - Vendor consolidation `blocked`
    - Waiting on the procurement freeze to lift
  - Branch network
  - Workforce reskilling


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · hub-spoke" -->

## When NOT to reach for hub-spoke.

- A ranking or a share
  - If the point is who is biggest, or how a total splits, use `bar` or `stacked-bar`. A length compares far better than a disc, and `sized` is a supporting cue here, not the evidence.
- A network, not a star
  - Hub-spoke draws one center and its spokes. If the satellites connect to each other, or there are several centers, use `diagram` (Mermaid) for the graph.
- A hue per satellite
  - Satellites are neutral on purpose: each one has its name beside it, so a color per satellite adds nothing and past six it invents false groups. Group them with a pill only when the grouping is part of the claim.
- A process in order
  - Steps that happen one after another are a sequence, not a hub. Use `list-steps`, `funnel` or `timeline-list`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `bar` — the claim is a ranking — lengths compare better than areas
- `stacked-bar` — the claim is how one total splits into shares
- `piechart` — three to six shares of one whole, and the proportion is the story
- `diagram` — the satellites connect to each other, or there is more than one center
- `state-chart` — the arrows are transitions between states, not flows to a center
