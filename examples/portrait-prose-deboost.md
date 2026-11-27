---
marp: true
theme: indaco
size: story
pagination: true
---

<!-- @meta{layout=title, class=silent} -->

# Dense layouts that fit the tall frame.

`Lattice · portrait prose de-boost`

The same content-dense layouts, on a 9:16 frame. Body prose de-boosts so the title and last item stay on the slide — hero type keeps its presence.

---

<!-- @meta{layout=cards-grid} -->

## The framework has four components.

- Signal Intake
  - Weekly structured collection across conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and relevance. Weights reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted to actual outcomes, adjusting the weights.

---

<!-- @meta{layout=actors} -->

## Who owns each part of the lifecycle.

- Signal custody `{Signal owner}`
  - Runs intake quality. Never tunes the weights — only picks which signals surface.
- Policy `{Framework operator}`
  - Owns scoring policy, calibration cadence, and the rollback playbook. One person.
- Consumption `{Product team}`
  - Holds scoring profiles; runs intake and decision-logging; finds the bugs first.
- Oversight `{Auditor}`
  - Reads the audit trail, cannot edit weights, and is the only role anyone fears.

---

<!-- @meta{layout=cards-stack} -->

## Four failure modes the framework prevents.

- False signal amplification
  - One loud voice dominates the decision. The model caps any single source at 30% of weight.
- Signal hoarding
  - Teams collect signals but never log decisions, so the calibration loop has nothing to learn from.
- Recency bias drift
  - The newest signal feels most urgent; without recency weighting it overrides calibrated history.
- Confidence inflation
  - Owners self-mark signals high-confidence; the model audits that against realized outcomes.

---

<!-- @meta{layout=matrix-2x2} -->

## Signal value versus effort to capture.

- High value, low effort
  - Win/loss interviews. Already happening; just needs structured capture.
- High value, high effort
  - Longitudinal cohort tracking. Worth it, but staff it deliberately.
- Low value, low effort
  - Sentiment tags. Cheap to collect, rarely change a decision.
- Low value, high effort
  - Open-ended surveys. Expensive to analyze, low signal density.

---

<!-- @meta{layout=decision} -->

## What we recommend, and why.

- Build
  - Full control, but 2–3 engineer-quarters and ongoing maintenance.
- Buy
  - Ship in 6 weeks; redirect engineering to product-layer features.
- Partial
  - Hybrid splits ownership and doubles the integration surface.
- Defer
  - Costs a quarter of signal data we can never reconstruct later.

---

<!-- @meta{layout=compare-prose} -->

## The scoring model, before and after calibration.

- Before calibration
  - Equal weights across all three dimensions. Confidence, recency, and relevance each contribute 33%. Simple and consistent, but blind to what your market rewards.
- After calibration
  - Weights reflect your team's historical accuracy. If recency has been the weakest predictor, it gets downweighted. The model becomes a record of what you have learned.

The shift takes two retrospective cycles to stabilize.

---

<!-- @meta{layout=split-compare} -->

## Build the data layer or buy it?

Both paths are viable. The difference is where we spend the next 18 months.

- Build in-house
  - Full control over schema and roadmap
  - 2–3 engineer-quarters to feature parity
  - Ongoing maintenance stays internal
- Buy + configure
  - Ship in 6 weeks, not 9 months
  - Engineering redirects to product features
  - Exit risk manageable via data export

> Buy the infrastructure. Build the differentiation.

---

<!-- @meta{layout=closing} -->

## Hero type stays; dense prose adapts.

`Lattice · portrait prose de-boost`
