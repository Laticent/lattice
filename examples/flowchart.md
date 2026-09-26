---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · Flowchart"
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# Flowcharts written as a list.

Every item is a shape, a sub-list makes a group, and an arrow in a row draws a line. The chart lays itself out and routes every line around the shapes.

---

<!-- _class: flowchart -->
<!-- _footer: "A decision flow — outlines, a status, labeled lines, a note and the key" -->

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

*SEV1 pages a human inside five minutes; everything else waits for business hours.*

---

<!-- _class: flowchart tb -->
<!-- _footer: "An org chart — `--` draws a line with no head, `&` fans out, `:loose` stays out of the layout" -->

`Operating model`

## Three lines of reporting, one advisory line.

- Chief executive `:c1`
  - -- Finance & Technology & Operations
- Finance
  - -- Controller & Planning
- Technology
  - -- Platform & Security
- Operations
  - -- Support & Logistics
- Security `:c4`
  - -advises-> Finance `:dotted:loose`

---

<!-- _class: flowchart lr -->
<!-- _footer: "A data flow — groups, the io, cylinder and doc outlines, a line out of a group" -->

`Analytics`

## Every event lands in the warehouse within a minute.

- Sources `:c1`
  - Web events `:io`
  - Mobile events `:io`
  - Billing DB `:cylinder`
  - => Ingest queue
- Pipeline `:c2`
  - Ingest queue
    - => Stream processor
  - Stream processor
    - -enrich-> Feature store
    - => Warehouse
  - Feature store `:cylinder`
  - Warehouse `:cylinder`
    - -> BI dashboards
    - -nightly-> ML training
- BI dashboards `:doc`
- ML training
  - -models-> Feature store

---

<!-- _class: flowchart -->
<!-- _footer: "A system map — tinted groups, a two-way line, a group-to-shape line and a shape with no lines" -->

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

<!-- _class: flowchart lr -->
<!-- _footer: "Lines — heavy, dashed, dotted; open, dot and cross heads; two-way; a slot color" -->

`Line vocabulary`

## What a line says is in the arrow, how it looks is in the span.

- Service `:c2`
  - => Main database
  - -reads-> Cache `:dot`
  - -> Search index `:dashed`
  - -> Audit log `:dotted:open`
  - -> Legacy API `:cross:c6`
  - <-> Partner API
- Main database `:cylinder`
- Cache `:cylinder`
- Legacy API `blocked`

---

<!-- _class: flowchart -->
<!-- _footer: "Written flat — every row names its source, and the chart is the same as the nested form" -->

`Checkout`

## The same grammar reads a flat list.

- Cart `:pill` => Address => Payment => Confirm
- Payment -declined-> Retry
- Retry `at-risk` -> Payment
- Confirm `:pill` -emails-> Receipt
- Receipt `:doc`

---

<!-- _class: flowchart compact -->
<!-- _footer: "Compact — the universal modifier tightens the spacing so a dense chart keeps its type" -->

`Release train`

## Compact spacing buys the type back on a dense chart.

- Plan => Build => Test => Stage => Release
- Build -fails-> Fix
- Fix `fail` -> Build
- Test -flaky-> Quarantine
- Quarantine `warn` -> Test
- Stage -rollback-> Build `:dashed`
- Release `:pill` -> Monitor
- Monitor `live` -alert-> Fix

*Every failure returns to Build; nothing reaches Release without a green Stage.*
