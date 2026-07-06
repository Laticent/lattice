---
marp: true
theme: indaco
paginate: true
header: "Lattice · gantt"
---

<!-- _class: title silent -->

# gantt

`Progression · Timeline · Series`

Gantt chart — task bars across a date axis.

---

<!-- _class: gantt -->
<!-- _footer: "Default · gantt" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The gantt lays the work against the calendar.

Three workstreams across four quarters; the one at-risk bar quietly gates the rollout, GA is a milestone, and the today line marks where the plan stands.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
    - Two teams contest the weighting; the Q3 review decides it, and the rollout waits on the outcome.
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: gantt -->
<!-- stress-slide -->
<!-- _footer: "Stress test · gantt — A full quarter of overlapping tracks." -->

`2026 Q1 .. 2026 Q4`

## Stress test — four workstreams, twelve tasks, one recalibration bar nobody wants to own.

- Signal Intake
  - Connector v1 `Q1..Q2` `done`
  - Multi-source dedupe `Q2..Q3` `live`
  - Anomaly auto-routing `Q3..Q4` `at-risk`
- Scoring
  - Equal-weights model `Q1..Q2` `done`
  - Per-team calibration `Q2..Q3` `live`
  - Weight rollback tooling `Q3..Q4` `blocked`
- Decision Log
  - Append-only schema `Q1..Q3` `done`
  - Outcome auto-pairing `Q2..Q4` `live`
  - Auditor evidence pack `Q3..Q4`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide enablement `Q2..Q4` `at-risk`
  - Per-decision profiles `Q3..Q4`


---

<!-- _class: gantt dark -->
<!-- _footer: "Composition: dark · gantt dark" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The gantt lays the work against the calendar.

Three workstreams across four quarters; the one at-risk bar quietly gates the rollout, GA is a milestone, and the today line marks where the plan stands.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
    - Two teams contest the weighting; the Q3 review decides it, and the rollout waits on the outcome.
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: gantt compact -->
<!-- _footer: "Composition: compact · gantt compact" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The gantt lays the work against the calendar.

Three workstreams across four quarters; the one at-risk bar quietly gates the rollout, GA is a milestone, and the today line marks where the plan stands.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
    - Two teams contest the weighting; the Q3 review decides it, and the rollout waits on the outcome.
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: gantt accent -->
<!-- _footer: "Composition: accent · gantt accent" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The gantt lays the work against the calendar.

Three workstreams across four quarters; the one at-risk bar quietly gates the rollout, GA is a milestone, and the today line marks where the plan stands.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
    - Two teams contest the weighting; the Q3 review decides it, and the rollout waits on the outcome.
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · gantt" -->

## When NOT to reach for gantt.

- **Single workstream.** One lane of bars is a timeline, not a gantt. Use `timeline` or `list-steps` when there is no parallel work to coordinate.
- **More than five lanes.** Past five workstreams the bars compress and the labels crowd. Group lanes (collapse 'SDK' subdomains into 'SDK') or split into two slides.
- **No spans at all.** A gantt mixes bars with the odd milestone — but if every task is a point-in-time event with no durations, use `timeline` or `roadmap milestones`. gantt earns its chrome only when bars carry meaningful length.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `roadmap` — phased grid of deliverables across workstreams without continuous spans
- `kanban` — current state by stage rather than schedule by lane
- `list-steps` — sequential process with descriptive steps, no parallel lanes
