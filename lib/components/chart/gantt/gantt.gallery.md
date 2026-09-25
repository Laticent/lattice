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

## A gantt lays overlapping work against a shared calendar.

Bars are spans, diamonds are moments, color is status, and tasks that run at the same time stack rather than hide each other.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
    - Two teams contest the weighting; the Q3 review decides it.
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: gantt -->
<!-- stress-slide -->
<!-- _footer: "Stress test · gantt — Twelve months, every lane overlapping." -->

`2026 Jan .. 2026 Dec`

## Every lane overlaps, at the row budget.

- Signal Intake
  - Connector v1 `Jan..Apr` `done`
  - Multi-source dedupe and replay `Mar..Aug` `live`
- Scoring
  - Equal-weights model `Jan..May` `done`
  - Weight rollback tooling `Jun..Dec` `blocked`
- Adoption
  - Pilot onboarding `Jan..Jun` `done`
  - Org-wide enablement `Apr..Nov` `at-risk`
  - GA `Dec` `milestone`


---

<!-- _class: gantt dark -->
<!-- _footer: "Composition: dark · gantt dark" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## A gantt lays overlapping work against a shared calendar.

Bars are spans, diamonds are moments, color is status, and tasks that run at the same time stack rather than hide each other.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
    - Two teams contest the weighting; the Q3 review decides it.
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: gantt compact -->
<!-- _footer: "Composition: compact · gantt compact" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## A gantt lays overlapping work against a shared calendar.

Bars are spans, diamonds are moments, color is status, and tasks that run at the same time stack rather than hide each other.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
    - Two teams contest the weighting; the Q3 review decides it.
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: gantt accent -->
<!-- _footer: "Composition: accent · gantt accent" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## A gantt lays overlapping work against a shared calendar.

Bars are spans, diamonds are moments, color is status, and tasks that run at the same time stack rather than hide each other.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
    - Two teams contest the weighting; the Q3 review decides it.
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.


---

<!-- _class: cards-stack compact cards-stretch -->
<!-- _footer: "Anti-patterns · gantt" -->

## When NOT to reach for gantt.

- Single workstream
  - One lane of bars is a timeline, not a gantt. Use `timeline` or `list-steps` when there is no parallel work to coordinate.
- More rows than the stage holds
  - Count ROWS, not lanes: overlapping tasks stack, and inclusive spans overlap more than they look (`Q1..Q2` then `Q2..Q3` share Q2). With a status key, four one-row lanes fit an ordinary slide and five overflow. The chart does not shrink to absorb them — the bars keep their size, the chart grows taller, and past the budget it overflows and the render says so. Group lanes (collapse 'SDK' subdomains into 'SDK'), make genuinely sequential phases non-overlapping, or split into two slides.
- No spans at all
  - A gantt mixes bars with the odd milestone — but if every task is a point-in-time event with no durations, use `timeline` or `roadmap milestones`. gantt earns its chrome only when bars carry meaningful length.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `roadmap` — phased grid of deliverables across workstreams without continuous spans
- `kanban` — current state by stage rather than schedule by lane
- `list-steps` — sequential process with descriptive steps, no parallel lanes
