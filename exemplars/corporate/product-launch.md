---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Lumen · Trace launch"
---

<!-- _class: title silent -->
<!-- tier: short -->

`Product launch · 2026`

# Lumen Trace

Find the cause of an incident in seconds — not by reading logs, but by asking.

---

<!-- _class: content -->
<!-- tier: short -->

## Debugging production has shifted from searching logs to asking questions.

For twenty years, finding the cause of an outage meant grepping logs and squinting at dashboards at 3am. Lumen Trace ends that. You ask what broke, in plain English, and get the answer with the evidence attached.

- The shift: from manual log archaeology to a system that explains itself.
- Teams still grepping are paying for every minute the old way costs.

---

<!-- _class: content -->
<!-- tier: standard -->

## Every minute of an outage is measured in revenue, and the clock is the cause.

The median production incident takes 47 minutes to diagnose — most of it spent finding the cause, not fixing it. At scale, that's not an engineering annoyance; it's a line item.

- Cause-finding is 70% of mean-time-to-resolution, the fixing is the easy part.
- A single hour of downtime costs a mid-market SaaS company a median of $140K.

---

<!-- _class: big-number -->
<!-- tier: standard -->

`Where the outage clock runs`

- 70%
  - of incident resolution time is spent finding the cause — before anyone writes a single line of the fix.

---

<!-- _class: content -->
<!-- tier: short -->

## Imagine asking "why did checkout fail?" and getting the answer, with proof.

Lumen Trace correlates every log, metric, and trace into a causal graph. You ask in plain language, and it walks back from the symptom to the root cause — the bad deploy, the saturated queue, the slow dependency — and shows you the evidence chain.

---

<!-- _class: cards-stack compact -->
<!-- tier: standard -->

## Lumen Trace answers the question; the platform keeps you ahead of it.

- Ask in plain English
  - Type the symptom, get the root cause and its evidence chain in seconds — no query language.
- Causal graph
  - Every signal correlated so cause and effect are explicit.
- Deploy correlation
  - Ties incidents to the change that caused them automatically.
- Anomaly watch
  - Flags the drift before it becomes the outage.

---

<!-- _class: cards-grid -->
<!-- tier: full -->

## Four ways Lumen Trace gets to the cause faster than a human can.

- Correlate
  - Stitches logs, metrics, and traces into one causal graph the moment an alert fires.
- Ask
  - Answers plain-language questions about what broke, no query syntax to learn.
- Trace back
  - Walks from symptom to root cause and shows every step of evidence in between.
- Prevent
  - Surfaces the same failure pattern before it recurs, with a suggested guardrail.

---

<!-- _class: stats -->
<!-- tier: full -->

`Beta · Early-access teams`

## What 40 beta teams measured against their own incident history.

`Measured across 40 engineering teams, 90-day beta, vs prior-quarter incidents.`

1. −68%
   - time to diagnose
2. 47 to 9 min
   - median MTTR
3. 3.4×
   - incidents auto-explained
4. +22
   - dev NPS

---

<!-- _class: kpi compact -->
<!-- tier: short -->

## Beta teams cut diagnosis time by two-thirds.

1. 9 min
   - Median MTTR
   - down from 47 `5.2× faster`
2. −68%
   - Time-to-diagnose
   - across 40 teams `Measured`
3. 92%
   - Incidents auto-explained
   - root cause surfaced `Verified`

---

<!-- _class: roadmap -->
<!-- tier: short -->

`Launch · H2 2026`

## How Lumen Trace rolls out from GA to enterprise.

| Workstream | GA `Q3 2026` | Expand `Q4 2026` | Scale `Q1 2027` |
| --- | --- | --- | --- |
| Product | [x] Ask + causal graph | [-] Custom runbooks | [ ] Predictive alerts |
| Platforms | [x] Kubernetes, AWS | [-] Azure, GCP | [ ] On-prem agent |
| Go-to-market | [x] Self-serve | [-] Sales-assisted | [ ] Enterprise tier |

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->
<!-- tier: short -->

## Stop searching. Start asking.

`Priya Anand · lumen.example/trace · trace@lumen.example`
