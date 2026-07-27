---
size: portrait
theme: indaco
paginate: true
form: standard
autosplit: on
header: "Lattice · connected members"
footer: "split relationship signal"
---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 01 · The four relationships`

## When a split atomizes, the relationship has to survive it.

---

<!-- _class: list -->

## One member per slide, and the set still reads as one thing.

- Sequence
  - Each page names the step that follows it.
- Cycle
  - The last page points back to stage one.
- Hierarchy
  - What this tier governs, and what governs it.
- Comparison
  - Which option, of how many, on which criteria.

> A split that loses the relationship has not paginated the idea. It has scattered it.

---

<!-- _class: list-steps -->

## How a scoring policy change ships.

1. Draft the change
   - The owner writes the proposed weights and the reason, in the policy repo, as a pull request.
1. Circulate for comment
   - Five working days with the scoring council. Silence counts as assent, which is how the last two changes passed.
1. Recalibrate the backtest
   - Re-score the last two quarters under the new weights and publish the delta against the shipped scores.
1. Sign off
   - The council chair signs the policy hash. Unsigned weights do not deploy.
1. Publish and announce
   - The weights go live at the next scoring cycle, with the delta report attached.

---

<!-- _class: cycle -->

## The calibration loop never really ends.

- Score
  - Signals arrive and are scored under the current published weights.
- Decide
  - The scored signals feed the weekly review, and the decisions are logged against them.
- Observe
  - Six weeks later the outcomes are known, and the log says what each decision was based on.
- Recalibrate
  - Weak predictors get downweighted, the policy hash changes, and scoring resumes.

---

<!-- _class: authority-chain -->

## Where the data-residency requirement actually comes from.

1. Statute
   - Cross-border transfer is prohibited absent an adequacy finding or an approved mechanism.
1. Implementing regulation
   - Names the approved mechanisms and the records the operator must keep for each.
1. Regulator guidance
   - Non-binding, but it is what an audit is run against, and it changes often.
1. Case law
   - Two decisions narrowing the "approved mechanism" reading, both on facts close to ours.
1. Internal policy
   - Stricter than the statute on purpose, so a regulatory change is not a re-architecture.

---

<!-- _class: verdict-grid -->

## Which option meets the residency criteria.

- **Build in region.**
  - [x] Residency
  - [x] Self-serve
  - [-] SOC 2
  - Fully compliant and fully ours, including the two engineers it takes to keep it that way.
- **Regional vendor.**
  - [x] Residency
  - [ ] Self-serve
  - [x] SOC 2
  - Compliant and certified, but every tenant change is a support ticket with a two-day turnaround.
- **Global vendor with an addendum.**
  - [-] Residency
  - [x] Self-serve
  - [x] SOC 2
  - Fastest to ship and the weakest residency story — the addendum relies on a narrowed mechanism.
- **Do nothing this year.**
  - [ ] Residency
  - [x] Self-serve
  - [-] SOC 2
  - Cheapest today, and the only option with a live regulatory exposure attached to it.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Section 02 · What the split carries`

## The cover, the footnote, the takeaway.

---

<!-- _class: checklist -->

## The readiness checklist for the rollout.

This framing paragraph is masthead material: it hoists to the run's cover instead of repeating on every body page, and the room it frees is room the split can use.

- Scoring policy signed by the council chair
- Backtest delta published against the shipped scores
- Runbook updated with the new weights and the rollback path
- On-call briefed, with the policy hash in the incident template
- Customer-facing changelog drafted and reviewed by support
- Regional residency review closed with no open findings
- Data-retention job re-pointed at the new signal store
- Dashboard queries updated for the renamed score column

The closing note belongs to the content immediately above it, so it rides the last body page one size down rather than repeating on each.

> Readiness is a checklist until the first incident. After that it is a habit.
