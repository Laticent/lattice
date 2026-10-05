---
marp: true
theme: indaco
paginate: true
header: "Lattice · charts"
footer: "Chart lead blocks — every block before the figure renders"
---

<!-- _class: title silent -->

# Every block before a chart renders

`Charts · lead blocks`

---

<!-- _class: bar -->

`Query cost · p95`

## One index took the report query under budget.

Milliseconds per query, p95 over a week.

```sql
CREATE INDEX orders_by_region ON orders (region, closed_at);
```

- Before `840`
- After `190`
- Budget `250`

*The code block above used to be dropped without a warning.*

---

<!-- _class: line -->

`Churn · monthly`

## Churn fell once onboarding moved to week one.

Logo churn, percent of accounts.

> The drop starts the month the onboarding call moved from week three to week one.

- Jan
  - Churn `4.1`
- Feb
  - Churn `3.9`
- Mar
  - Churn `2.6`
- Apr
  - Churn `2.2`
- May
  - Churn `2.1`

---

<!-- _class: bar -->

`Revenue mix · FY26`

## Services outgrew licenses for the first time.

Revenue by line, $M.

| Line | FY25 | FY26 |
| --- | --: | --: |
| Licenses | 45 | 42 |
| Services | 39 | 47 |

- Licenses `42`
- Services `47`
- Support `18`

---

<!-- _class: progress -->

`H1 2026 · Phase 1 readiness`

## Adoption is the one blocked workstream.

Percent of exit criteria met.

<div class="note">Blocked on the data-sharing agreement, not on engineering.</div>

- Signal intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision log `81%` `on-track`
- Adoption `12%` `blocked`

---

`Query cost · A chart pane`

## A pane keeps its code block too.

<!-- _class: columns ratio-55-45 -->
<!-- _pane: bar -->

p95 milliseconds.

```sql
CREATE INDEX ON orders (region);
```

- Before `840`
- After `190`
- Budget `250`

<!-- _pane: list -->

- The report query was a full scan
- One composite index fixed it
- Budget is 250ms at p95

---

<!-- _class: closing silent -->

# Nothing an author writes is dropped

`Charts · lead blocks`
