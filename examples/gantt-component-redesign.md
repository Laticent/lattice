---
marp: true
theme: indaco
paginate: true
header: "Lattice · gantt redesign"
---

<!-- _class: title silent -->

# The gantt, rebuilt on real time.

`gantt · typed list · continuous axis · 2026-06-21`

Same nested-list muscle memory, now with validated tokens, milestones, dependencies, and a continuous time scale that speaks both quarters and real dates.

---

<!-- _class: gantt -->
<!-- _footer: "Quarters, a milestone, and a today line · gantt" -->

`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]`

## A rollout plan, by workstream.

The at-risk bar quietly gates the rollout; GA is a milestone; the today line marks where the plan stands.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`

---

<!-- _class: gantt -->
<!-- _footer: "Real calendar dates, axis auto-derived · gantt" -->

`[{Timeline, today=2026-04-01}]`

## The same shape, with real dates.

Write ISO dates and the bars land on a day-accurate scale — the month ticks come straight from the data, no window pill required.

- Build
  - Foundations `2026-01-01..2026-03-15` `done`
  - Core engine `2026-03-01..2026-06-01` `live` `after: Foundations`
  - Hardening `2026-05-15..2026-07-15` `at-risk` `after: Core engine`
- Launch
  - Beta `2026-06-01..2026-07-01` `after: Core engine`
  - GA `2026-07-15` `milestone` `after: Hardening`

---

<!-- _class: gantt -->
<!-- _footer: "Multi-year, year-qualified quarters · gantt" -->

`[{Timeline, 2027 Q3 .. 2028 Q4}]`

## Year-qualified quarters span multiple years.

Qualify a quarter with its year (`2027 Q3`) and a plan can cross the calendar boundary without ambiguity.

- Discovery & design
  - Process mapping `2027 Q3..2027 Q4` `done`
  - Solution design `2027 Q4..2028 Q1` `live` `after: Process mapping`
- Delivery
  - Core platform `2028 Q1..2028 Q3` `at-risk` `after: Solution design`
  - Cutover `2028 Q4` `milestone` `after: Core platform`

---

<!-- _class: gantt dark -->
<!-- _footer: "Dark composition · gantt dark" -->

`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]`

## Every status, on the dark canvas.

- Delivery
  - Discovery `Q1..Q2` `done`
  - Build `Q2..Q3` `live`
  - Recalibration `Q3..Q4` `at-risk`
- Risk
  - Rollback tooling `Q3..Q4` `blocked`
- Governance
  - Decision log `Q1..Q2` `done`
  - Sign-off `Q4` `milestone`

---

<!-- _class: gantt compact -->
<!-- _footer: "Portrait reflow adapts the same source · gantt compact" -->

`[{Timeline, Jan .. Jun}]`

## Months work too.

- Engineering
  - Spike `Jan..Feb` `done`
  - Implementation `Feb..Apr` `live`
  - Hardening `Apr..Jun` `at-risk`
- Release
  - Docs `Mar..May`
  - Launch `Jun` `milestone`

---

<!-- _class: list -->
<!-- _footer: "What the linter now catches · gantt" -->

## Loud at author time, never silent garbage.

- **Retired delimiter.** `Q1 → Q2` errors with a "use `..`" fix — old decks fail loudly, with the correction inline.
- **Bad span or status.** `Q9..Zz` or a misspelled status surfaces instead of rendering wrong.
- **Dangling dependency.** `after: Phase 9` errors when no task named "Phase 9" is on the slide.
- **Inverted dependency.** A task that begins before its prerequisite even starts is flagged.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `roadmap` — phased grid of deliverables across workstreams without continuous spans
- `timeline` — a single sequence of events, no parallel lanes
- `kanban` — current state by stage rather than schedule by lane
