---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Data platform · Decision memo"
---

<!-- _class: title silent -->
<!-- tier: short -->

`Decision memo · 10 June 2026`

# Where our data warehouse runs

We recommend moving to a managed warehouse. Here is the reasoning and the ask.

---

<!-- _class: content -->
<!-- tier: short -->

## Recommendation: move to a managed warehouse, and do it this quarter.

Our self-hosted warehouse is consuming an engineer full-time and still falling behind on query speed. We recommend migrating to a managed warehouse this quarter. It is faster, cheaper at our scale, and frees the team for product work. The rest of this memo is the evidence.

---

<!-- _class: content -->
<!-- tier: standard -->

## The problem: we are paying for a warehouse twice over.

We pay for the servers and we pay an engineer to keep them running. Queries that should take seconds take minutes during peak, and the on-call burden for the warehouse has grown to a day a week. This is infrastructure work we don't need to own.

- One senior engineer spends roughly 40% of their time on warehouse upkeep.
- Peak query latency has tripled over the past year as data grew.

---

<!-- _class: big-number -->
<!-- tier: standard -->

`The hidden cost`

- 40%
  - of one senior engineer's time goes to keeping the self-hosted warehouse alive — about $90K a year in salary.

---

<!-- _class: content -->
<!-- tier: standard -->

## We evaluated three paths against four criteria.

We compared staying self-hosted, moving to Managed-A, and moving to Managed-B. The criteria were cost at our scale, query performance, operational burden, and migration risk. The comparison is on the next slide.

- Cost is modeled on our actual query volume, not list price.
- Migration risk weighs how much of our pipeline must change.

---

<!-- _class: table -->
<!-- tier: short -->

## The three options, side by side.

| Criterion | Self-hosted | Managed-A | Managed-B |
| --- | --- | --- | --- |
| Annual cost at our scale | $310K | $240K | $265K |
| Peak query speed | Slow | Fast | Fast |
| Ops burden | 1 FTE | Near zero | Near zero |
| Migration effort | None | 6 weeks | 9 weeks |
| Lock-in risk | None | Moderate | Moderate |

---

<!-- _class: stats -->
<!-- tier: full -->

`Managed-A · modeled outcome`

## What moving to Managed-A would change in the first year.

`Modeled on twelve months of our actual query volume and current salaries.`

1. −$70K
   - net annual cost
2. 4×
   - faster peak queries
3. 0.8 FTE
   - engineer time returned
4. 6 wk
   - migration window

---

<!-- _class: matrix-2x2 -->
<!-- tier: short -->

## Where each option lands on cost and operational burden.

- **High cost · High burden.**
  - Self-hosted today
- **High cost · Low burden.**
  - Managed-B — strong, but pricier
- **Low cost · High burden.**
  - A second self-hosted cluster
- **Low cost · Low burden.**
  - Managed-A — our recommendation

---

<!-- _class: list takeaway numbered -->
<!-- tier: full -->

## Why Managed-A clears every criterion that matters.

1. Cheapest at our scale
   - $70K a year less than today, modeled on real query volume.
2. Fastest to migrate
   - Six weeks against Managed-B's nine, with less pipeline rework.
3. Lowest ongoing burden
   - Returns 80% of an engineer's time to product work.
4. Acceptable lock-in
   - Standard SQL and open export keep the exit door open.

---

<!-- _class: decision -->
<!-- tier: short -->

## Decision: migrate to Managed-A this quarter.

- Migrate to Managed-A
  - Saves $70K a year, returns an engineer, and ships in six weeks.
- Stay self-hosted
  - No migration cost, but locks in the higher spend and the on-call burden.
- Choose Managed-B
  - Equally capable, but costs more and takes three weeks longer to migrate.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->
<!-- tier: short -->

## The ask: approve the Managed-A migration this quarter.

`Data platform · data-eng@example.com`
