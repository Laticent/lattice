---
marp: true
theme: indaco
paginate: true
header: "Lattice · gantt lane packing"
---

<!-- _class: title silent -->

# Gantt lane packing

`Chart · gantt · sub-rows`

What a lane looks like when two tasks run at the same time.

---

<!-- _class: gantt -->
<!-- _footer: "Concurrency is the point — and now it is visible." -->

`2026 Q1 .. 2026 Q4` `today Q3`

## Three tasks, one lane, two of them running together.

Scoring model v2 overlaps both its neighbors, so it takes a row of its own; the two that clear each other still share one.

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
<!-- _footer: "A sequential lane costs no extra height." -->

`2026 Q1 .. 2026 Q4`

## Tasks that clear each other still share a row.

Packing only spends height where the data needs it. Nothing here overlaps, so every lane is one row — the same geometry these charts have always had.

- Platform
  - Schema freeze `Q1..Q1` `done`
  - Migration `Q2..Q2` `done`
  - Cutover `Q3..Q3` `live`
  - Decommission `Q4..Q4`
- Clients
  - SDK v2 `Q1..Q2` `done`
  - Partner rollout `Q3..Q4` `at-risk`

---

<!-- _class: gantt -->
<!-- _footer: "Three mutually overlapping tasks earn three rows." -->

`2026 Q1 .. 2026 Q4`

## When everything overlaps, every task gets its own row.

The decision log's three workstreams run across each other end to end. On one row the last one drawn would have been the only one visible.

- Decision Log
  - Append-only schema `Q1..Q3` `done`
  - Outcome auto-pairing `Q2..Q4` `live`
  - Auditor evidence pack `Q3..Q4`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide enablement `Q2..Q4` `at-risk`
  - Per-decision profiles `Q3..Q4`

---

<!-- _class: gantt -->
<!-- _footer: "A milestone inside a bar's span is a separate task." -->

`2026 Q1 .. 2026 Q4`

## A milestone never sits on top of a bar.

GA falls inside the rollout's span. It is its own task, so it takes its own row and its diamond reads on any canvas.

- Launch
  - Beta `Q1..Q2` `done`
  - Rollout `Q2..Q4` `live`
  - GA `Q3` `milestone`
  - Post-launch review `Q4` `milestone`

---

<!-- _class: gantt -->
<!-- _footer: "Dense: the band compresses rather than letterboxing." -->

`2026 Jan .. 2026 Dec`

## A dense plan keeps the width it has.

Twelve tasks over four workstreams on a month axis. The row band tightens so the unit keeps its aspect instead of scaling down into a narrow column.

- Signal Intake
  - Connector v1 `Jan..Apr` `done`
  - Multi-source dedupe `Mar..Aug` `live`
  - Anomaly auto-routing `Jul..Dec` `at-risk`
- Scoring
  - Equal-weights model `Jan..Apr` `done`
  - Per-team calibration `Mar..Aug` `live`
  - Weight rollback tooling `Jul..Dec` `blocked`
- Decision Log
  - Append-only schema `Jan..Jun` `done`
  - Outcome auto-pairing `Apr..Nov` `live`
  - Auditor evidence pack `Sep..Dec`
- Adoption
  - Pilot onboarding `Jan..Apr` `done`
  - Org-wide enablement `Apr..Nov` `at-risk`
  - Per-decision profiles `Sep..Dec`

---

<!-- _class: gantt dark -->
<!-- _footer: "Dark · the today rule is a reference, not a status." -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The now line reads as chrome on either canvas.

It takes the neutral every other reference line in the family takes, so it never wears the same ink as a `live` bar it crosses — and it sits behind the marks.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live`
  - Per-team weighting `Q3..Q4` `at-risk`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4`
  - GA `Q4` `milestone`

---

<!-- _class: closing silent index -->

## What changed.

`gantt lane packing`

- `sub-rows` — tasks that overlap on the axis get their own row; ones that clear each other still share
- `captions` — a caption's budget is the next mark on its own row, not the next task in the lane
- `accent` — the bar's leading edge is clipped to the bar, so it cannot escape the corner
- `key` — the swatch centers on the label it keys
- `today` — a neutral reference rule, painted behind the marks
