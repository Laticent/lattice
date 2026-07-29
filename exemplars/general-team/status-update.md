---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Lumen Platform · Weekly status"
---

<!-- _class: title silent -->
<!-- tier: short -->

`Platform team · Week of 8 June 2026`

# Lumen Platform

The checkout migration is on track for 1 July — one risk needs a decision today.

---

<!-- _class: content -->
<!-- tier: short -->

## Bottom line: we ship checkout on Lumen 1 July, on plan, with one open call.

The migration of checkout to the Lumen platform is 78% complete and tracking to the 1 July cutover. Eleven of fourteen services are live in production. The only thing standing between us and the date is a load-testing decision I need from this room today.

---

<!-- _class: content -->
<!-- tier: standard -->

## Why this matters now: the legacy checkout stack goes end-of-support 31 July.

The vendor pulls security patches for the legacy stack at the end of July. Migrating to Lumen before then keeps us supported and cuts our per-transaction cost by a third. Slipping past 1 July compresses the buffer between cutover and end-of-support to nothing.

- A clean two-week buffer is the difference between a calm launch and a forced one.
- Every week of delay is roughly $40K in avoidable legacy hosting spend.

---

<!-- _class: kpi compact -->
<!-- tier: short -->

## Eleven of fourteen live; latency and errors on target.

1. 78%
   - Services migrated
2. 142 ms
   - p99 latency
3. 0.02%
   - Error rate

---

<!-- _class: stats -->
<!-- tier: standard -->

`Shadow traffic · last 7 days`

## What the shadow deployment is telling us before we cut over.

`Lumen running in parallel with legacy, mirroring 100% of live checkout traffic.`

1. 4.1M
   - shadow txns processed
2. 99.98%
   - parity with legacy
3. 38
   - mismatches investigated
4. 0
   - unresolved discrepancies

---

<!-- _class: timeline-list -->
<!-- tier: standard -->

`Progress · Q2 2026`

## How the migration has unfolded since April.

1. `2026 Apr` Foundation services cut over `done`
   - Identity, pricing, and inventory moved to Lumen with zero customer-facing incidents.
2. `2026 May` Shadow traffic enabled `done`
   - Full live traffic mirrored to Lumen for parity validation; 99.98% match sustained.
3. `2026 Jun` Payment services migrating `live`
   - Three of four payment integrations live; the fourth lands this week.
4. `2026 Jul` Cutover and legacy decommission `decision`
   - Final switch on 1 July, pending the load-testing decision.

---

<!-- _class: roadmap -->
<!-- tier: short -->

`Path to cutover · 1 July`

## What remains, by workstream, before we flip the switch.

| Workstream | This week `Wk of 8 Jun` | Next week `Wk of 15 Jun` | Cutover `Wk of 29 Jun` |
| --- | --- | --- | --- |
| Services | [x] Payments 3 of 4 | [-] Final service | [ ] Decommission |
| Load testing | [-] Peak-load run | [ ] Sign-off | [ ] Standby |
| Runbook | [x] Draft complete | [-] Dry run | [ ] On-call brief |

---

<!-- _class: matrix-2x2 -->
<!-- tier: full -->

## Where our open risks sit by likelihood and impact.

- **Low likelihood · Low impact.**
  - Documentation lag on internal APIs
- **Low likelihood · High impact.**
  - Payment-gateway timeout under peak load
- **High likelihood · Low impact.**
  - Minor dashboard parity gaps post-cutover
- **High likelihood · High impact.**
  - Unrehearsed peak load on cutover day

---

<!-- _class: checklist -->
<!-- tier: full -->

## Cutover readiness as of today.

- [x] Shadow parity sustained above 99.9% `7 days`
- [x] Runbook drafted and reviewed `Eng + SRE`
- [-] Peak-load run `awaiting decision`
- [-] Rollback procedure `dry-run pending`
- [ ] Final payment service live `this week`
- [ ] Executive go / no-go `25 Jun`

---

<!-- _class: decision -->
<!-- tier: short -->

## Decision today: run a full peak-load rehearsal before cutover.

- Run the peak-load rehearsal
  - One day of effort buys certainty that checkout holds at Black-Friday volume.
- Cut over on synthetic tests only
  - Saves a day but leaves the highest-impact risk unrehearsed on launch day.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->
<!-- tier: short -->

## On track for 1 July — pending your call on load testing.

`Priya Venkat · platform-team@lumen.example`
