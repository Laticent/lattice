---
marp: true
theme: indaco
paginate: true
header: "Lattice · callouts on plans and networks · placed by measure"
---

<!-- _class: title silent -->

# Notes pin to the task or the node they name

`Callouts · gantt, hub-spoke, flowchart and state chart`

A ring on a bar, a milestone or a disc, a numbered marker on it, and the words set under the chart in a centered group. Render this deck at 16:9, 4:3, 1:1, 4:5 and 9:16 to watch the notes move.

---

<!-- _class: gantt -->
<!-- _footer: "gantt · a task by its label; its bar is ringed." -->

`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]`

## A gantt lays overlapping work against a shared calendar.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live`
  - Per-team weighting `Q3..Q4` `at-risk`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4`
  - GA `Q4` `milestone`

`@callout{[{Two teams contest the weighting, for=Scoring model v2, detail="The Q3 review decides it."}, {The go/no-go gate, for=GA}]}`

---

<!-- _class: hub-spoke -->
<!-- _footer: "hub-spoke · a spoke by its label; its disc is ringed." -->

`Transformation program · Workstream status · Q3`

## Two of six workstreams are off track.

- Program office
  - Customer onboarding
  - Core platform migration `at-risk`
  - Data governance
  - Vendor consolidation `blocked`
  - Branch network
  - Workforce reskilling

`@callout{[{Cutover slipped to October, for=Core platform migration}, {Waiting on the procurement freeze, for=Vendor consolidation}]}`

---

<!-- _class: flowchart -->

## The queue clears in three steps.

- Intake `pill` => Triage => Severity?
- Severity? `diamond`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket => Mitigate
- Page on-call `fail`
- Mitigate => Postmortem
- Postmortem `doc`

`@callout{[{Pages the secondary after five minutes, for=Page on-call, detail="Then the manager."}, {The slowest step in the loop, for=Mitigate}]}`

---

<!-- _class: state-chart -->

## A release moves one way, then rolls back.

- Draft => Review => Approved => Live
- Live `live`
- Approved `warn`
- Review =changes=> Draft
- Live =rollback=> Approved

`@callout{[{Two reviewers sign off here, for=Approved}, {Rollback is one click, for=Live}]}`
