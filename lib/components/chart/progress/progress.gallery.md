---
marp: true
theme: indaco
paginate: true
header: "Lattice · progress"
---

<!-- _class: title silent -->

# progress

`Evidence · Canvas · Series`

Horizontal progress bars — one row per item, percentage filled.

---

<!-- _class: progress -->
<!-- _footer: "Default · progress" -->

`H1 2026 · Phase 1 readiness`

## Progress bars race toward their targets.

Snapshot at 14:00 UTC. Status pills reflect the most optimistic reading of the available data.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`


---

<!-- _class: progress -->
<!-- stress-slide -->
<!-- _footer: "Stress test · progress — A full wall of tracks — the ceiling." -->

`H1 2026 · Phase 1 readiness`

## Stress test — eight workstreams, full status range, one honest pill.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Per-team calibration `34%` `deferred`
- Adoption `12%` `blocked`
- Decision-log audit trail `100%` `done`
- Recalibration playbook `45%` `deferred`
- Auditor export rollout `73%` `on-track`


---

<!-- _class: progress dark -->
<!-- _footer: "Composition: dark · progress dark" -->

`H1 2026 · Phase 1 readiness`

## Progress bars race toward their targets.

Snapshot at 14:00 UTC. Status pills reflect the most optimistic reading of the available data.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`


---

<!-- _class: progress compact -->
<!-- _footer: "Composition: compact · progress compact" -->

`H1 2026 · Phase 1 readiness`

## Progress bars race toward their targets.

Snapshot at 14:00 UTC. Status pills reflect the most optimistic reading of the available data.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`


---

<!-- _class: progress accent -->
<!-- _footer: "Composition: accent · progress accent" -->

`H1 2026 · Phase 1 readiness`

## Progress bars race toward their targets.

Snapshot at 14:00 UTC. Status pills reflect the most optimistic reading of the available data.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · progress" -->

## When NOT to reach for progress.

- Comparing unrelated metrics
  - Revenue % of target, latency vs SLO, and headcount fill aren't comparable on a shared bar scale. Use `kpi` for value/target/status tiles or `stats` for an independent metric row.
- More than eight rows
  - Past eight workstreams the bars compress and the labels truncate. Split the view by owner or workstream group; the audience can't scan twelve bars at once anyway.
- Decorative status pills
  - Don't invent new status words for tone. `on-track`, `at-risk`, `blocked`, `deferred`, `done` are the vocabulary the engine recognises; everything else renders as a plain pill and breaks the at-a-glance read.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `kpi` — value + target + status tiles, not a single percent
- `stats` — independent headline metrics, no completion scale
- `gantt` — the rows are time-bound and need a date axis
- `checklist` — binary done / not-done across a flat list
- `timeline-list` — the workstreams complete in sequence, not in parallel
