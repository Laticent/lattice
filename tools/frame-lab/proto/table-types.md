---
marp: true
theme: indaco
paginate: true
header: "Lattice · table types"
---

<!-- _class: title silent -->

# table types

`Prototype · Responsive tables`

Nine kinds of table, each with its own narrow layout.

---

<!-- _class: table no-row-label -->
<!-- _footer: "1 · Record list — row becomes a card" -->

## The launch team spans four cities.

| Name | Role | Location | Since |
| --- | --- | --- | --- |
| Ada Okafor | Engineering lead | Lagos | 2019 |
| Priya Raman | Design director | Bengaluru | 2021 |
| Tomás Ruiz | Product manager | Madrid | 2020 |
| Nia Brooks | Data scientist | Chicago | 2022 |

---

<!-- _class: table -->
<!-- _footer: "2 · Key–value — label above value" -->

## The appliance ships with a short spec.

| Spec | Value |
| --- | --- |
| Throughput | 40 Gb/s sustained, 55 Gb/s burst |
| Power draw | 180 W typical, 240 W peak |
| Footprint | 1U, 43 cm deep |
| Warranty | Five years, next-day replacement |

---

<!-- _class: table -->
<!-- _footer: "3 · Measure over time — labels plus a run of columns" -->

## Revenue grew every quarter while margin held.

| Metric | Q1 | Q2 | Q3 | Q4 | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Revenue ($M) | 40.2 | 44.8 | 51.3 | 58.0 | 194.3 |
| Gross margin | 61% | 62% | 62% | 63% | 62% |
| New customers | 120 | 148 | 171 | 202 | 641 |
| Churn | 2.1% | 1.9% | 1.8% | 1.6% | 1.9% |

---

<!-- _class: table -->
<!-- _footer: "4 · Option comparison — labels plus one option per block" -->

## Plan B covers the team without enterprise cost.

| Criterion | Plan A | **Plan B** | Plan C |
| --- | --- | --- | --- |
| Price per seat | $12 | $24 | $48 |
| Seats included | 10 | 50 | Unlimited |
| Single sign-on | No | Yes | Yes |
| Support | Email | Chat, 8 hours | Phone, 24/7 |
| Audit log | 30 days | 1 year | 7 years |

---

<!-- _class: table -->
<!-- _footer: "5 · Cross-tab — labels plus a run of columns" -->

## EMEA leads on hardware; APAC on services.

| Region | Hardware | Software | Services | Support |
| --- | ---: | ---: | ---: | ---: |
| Americas | 31 | 44 | 18 | 12 |
| EMEA | 47 | 29 | 21 | 15 |
| APAC | 22 | 26 | 39 | 9 |

---

<!-- _class: table no-row-label table-lists -->
<!-- _footer: "6 · Independent lists — each column becomes a block" -->

## The review found three kinds of finding.

| Strengths | Weaknesses | Risks |
| --- | --- | --- |
| Loyal enterprise base | Slow onboarding | Pricing pressure from new entrants |
| Strong API | Thin mobile app | Key-person dependency |
| Clean balance sheet | | Regulatory change in EU |

---

<!-- _class: table no-row-label -->
<!-- _footer: "7 · Ranked list — two-line row" -->

## Five accounts drive half of new revenue.

| Rank | Account | Industry | ARR ($K) |
| ---: | --- | --- | ---: |
| 1 | Northwind | Logistics | 1,240 |
| 2 | Contoso | Retail | 980 |
| 3 | Fabrikam | Manufacturing | 860 |
| 4 | Litware | Software | 710 |
| 5 | Tailspin | Travel | 655 |

---

<!-- _class: table no-row-label -->
<!-- _footer: "8 · Prose register — row becomes a card with paragraphs" -->

## Three risks need an owner this quarter.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Vendor lock-in | Migration costs rise every year we wait. | Abstract storage behind one interface by Q3. |
| Key-person dependency | Two engineers hold the billing knowledge. | Pair rotations and a written runbook. |
| Data residency | EU customers may require local hosting. | Price a Frankfurt region before renewal season. |

---

<!-- _class: table no-row-label -->
<!-- _footer: "9 · Schedule — two-line row with the date on top" -->

## The migration lands in four steps.

| Date | Milestone | Owner |
| --- | --- | --- |
| 12 Jan | Freeze the old schema | Ada Okafor |
| 2 Feb | Dual-write to both stores | Tomás Ruiz |
| 23 Feb | Backfill and verify | Nia Brooks |
| 16 Mar | Cut over and retire | Priya Raman |
