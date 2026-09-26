---
marp: true
theme: indaco
paginate: true
header: "Lattice · flowchart"
---

<!-- _class: title silent -->

# flowchart

`Progression · Canvas · Graph`

A free-form flowchart: shapes, groups and lines, written as a list.

---

<!-- _class: flowchart -->
<!-- _footer: "Default · flowchart" -->

`Incident response`

## Every page reaches a human within 15 minutes.

- Alert fires `:pill` => Auto-triage => Severity?
- Severity? `:diamond`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket -> Mitigate
  - -SEV3-> Backlog `:dotted`
- Page on-call `fail` =ack=> Mitigate => Postmortem
  > Pages the secondary after 5 minutes.
- Postmortem `:doc`

`[{=>, Paging path}, {:dotted, Waits for business hours}]`


---

<!-- _class: flowchart lr -->
<!-- _footer: "Left-to-right · flowchart lr — Pins the flow left to right." -->

## Events land in the warehouse within a minute.

- Web events `:io` => Ingest queue => Stream processor => Warehouse
- Warehouse `:cylinder`
  - -> BI dashboards
  - -nightly-> ML training
- BI dashboards `:doc`


---

<!-- _class: flowchart tb -->
<!-- _footer: "Top-to-bottom · flowchart tb — Pins the flow top to bottom." -->

## The operating model has three lines of reporting.

- Chief executive `:c1`
  - -- Finance & Technology & Operations
- Finance
  - -- Controller & Planning
- Technology
  - -- Platform & Security


---

<!-- _class: flowchart -->
<!-- stress-slide -->
<!-- _footer: "Stress test · flowchart — Three groups, a group-to-shape line and a disconnected shape." -->

`Platform`

## Payments sit between four parties.

- Customers `:c1`
  - Shopper `:circle`
    - -browses-> Storefront
  - Merchant `:circle`
    - -lists items-> Storefront
- Platform `:c2`
  - Storefront
    - => Payments
  - Payments
    - -screens-> Fraud checks
    - <-> Card networks
  - Fraud checks `:diamond`
  - -ships via-> Carriers
- Partners `:c3`
  - Card networks `:square`
  - Carriers `:square`
- Regulators `:doc`


---

<!-- _class: flowchart dark -->
<!-- _footer: "Composition: dark · flowchart dark" -->

`Incident response`

## Every page reaches a human within 15 minutes.

- Alert fires `:pill` => Auto-triage => Severity?
- Severity? `:diamond`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket -> Mitigate
  - -SEV3-> Backlog `:dotted`
- Page on-call `fail` =ack=> Mitigate => Postmortem
  > Pages the secondary after 5 minutes.
- Postmortem `:doc`

`[{=>, Paging path}, {:dotted, Waits for business hours}]`


---

<!-- _class: flowchart compact -->
<!-- _footer: "Composition: compact · flowchart compact" -->

`Incident response`

## Every page reaches a human within 15 minutes.

- Alert fires `:pill` => Auto-triage => Severity?
- Severity? `:diamond`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket -> Mitigate
  - -SEV3-> Backlog `:dotted`
- Page on-call `fail` =ack=> Mitigate => Postmortem
  > Pages the secondary after 5 minutes.
- Postmortem `:doc`

`[{=>, Paging path}, {:dotted, Waits for business hours}]`


---

<!-- _class: flowchart accent -->
<!-- _footer: "Composition: accent · flowchart accent" -->

`Incident response`

## Every page reaches a human within 15 minutes.

- Alert fires `:pill` => Auto-triage => Severity?
- Severity? `:diamond`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket -> Mitigate
  - -SEV3-> Backlog `:dotted`
- Page on-call `fail` =ack=> Mitigate => Postmortem
  > Pages the secondary after 5 minutes.
- Postmortem `:doc`

`[{=>, Paging path}, {:dotted, Waits for business hours}]`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · flowchart" -->

## When NOT to reach for flowchart.

- A sequence dressed as a flowchart
  - Five boxes in a line with arrows between them is a list with decoration. Use `list-steps` or `timeline-list`, which read faster and fit more words.
- Timed interactions or schedules
  - Messages between actors over time are a sequence diagram (`diagram` with Mermaid); work across dates is `gantt` or `roadmap`.
- Color with no key
  - Every slot and status the chart uses shows up in the derived key. Renaming entries is free; painting meaning the reader cannot decode is not.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `state-chart` — a finite-state machine: numbered states, events between them, a start and an end
- `diagram` — you need Mermaid's full grammar: sequence, class or entity diagrams, or a flowchart with subgraph directions and styles this grammar does not cover
- `list-steps` — a linear procedure with no branching and no lines worth drawing
- `roadmap` — parallel workstreams across phases, where time is the axis
