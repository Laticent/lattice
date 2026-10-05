---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · State chart polish"
lexicon:
  "4.5:1": 4.5 to 1
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# State charts that use the whole stage.

A status paints the state, and a long machine wraps in reading order instead of shrinking.

---

<!-- _class: state-chart -->

`Status paints the state`

## A status reads on the state itself.

The same fill, edge and leading accent a gantt bar wears. A state with no status is a quiet tile.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Approved
  - -reject-> Draft
- Approved `done`
  - -schedule-> Scheduled
- Scheduled `deferred`
  - -publish-> Published
- Published `end` `live`

*Deferred draws hollow and dashed, so it never reads as "no status".*

---

<!-- _class: state-chart -->

`Reading-order wrap`

## Ten states wrap instead of shrinking.

Each row reads left to right, and one connector drops to the next.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Approved
- Approved `done`
  - -schedule-> Scheduled
- Scheduled
  - -publish-> Published
- Published `live`
  - -watch-> Monitored
- Monitored
  - -archive-> Archived
- Archived
  - -audit-> Audited
- Audited
  - -retire-> Retired
- Retired `end`

*As a single column these names set at 4.6px on this stage.*

---

<!-- _class: state-chart -->

`Reading-order wrap`

## Twelve states still read.

The chart scores every row count and keeps the one that sets the type largest.

- Intake `start`
  - -triage-> Triage
- Triage
  - -assign-> Assigned
- Assigned
  - -start-> In Progress
- In Progress `live`
  - -review-> Code Review
- Code Review
  - -approve-> QA
- QA `on-track`
  - -stage-> Staging
- Staging
  - -release-> Released
- Released `done`
  - -announce-> Announced
- Announced
  - -measure-> Measured
- Measured
  - -learn-> Retro
- Retro `deferred`
  - -close-> Closed
- Closed `end`

*A short chain stays on one row: wrapping has to buy a real gain in type size.*

---

<!-- _class: state-chart -->

`Loops`

## Loops nest; they don't cross.

Back-edges ride above their row, skips below, and each lane is ordered against the rest.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
  - -fast track-> Scheduled
- In Review `at-risk`
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
- Approved `done`
  - -schedule-> Scheduled
- Scheduled
  - -publish-> Published
- Published `live`
  - -watch-> Monitored
- Monitored
  - -archive-> Archived
  - -reopen-> In Review
- Archived `end`

*Every label sits beside its own line, never on another.*

---

<!-- _class: state-chart -->

`Branching`

## A long pipeline with one fork wraps too.

dagre cannot wrap, so a wrapped layout competes with it and wins only by a clear margin.

- Intake `start`
  - -triage-> Triage
- Triage
  - -assign-> Assigned
- Assigned
  - -start-> In Progress
- In Progress `live`
  - -review-> Code Review
  - -block-> Blocked
- Code Review
  - -approve-> QA
- QA `on-track`
  - -stage-> Staging
  - -fail-> In Progress
- Staging
  - -release-> Released
- Released `done`
  - -close-> Closed
- Blocked `blocked`
  - -unblock-> In Progress
- Closed `end`

*A fan-out that reads best as parallel ranks still goes to dagre.*

---

<!-- _class: state-chart tb -->

`Direction`

## Pin the direction when it carries meaning.

`tb` keeps a ladder top to bottom on a wide stage; it still wraps into columns.

- Level 1 `start`
  - -escalate-> Level 2
- Level 2 `on-track`
  - -escalate-> Level 3
- Level 3 `at-risk`
  - -escalate-> Incident lead
  - -resolve-> Level 1
- Incident lead
  - -escalate-> Executive
- Executive `end`

*A row pins the same way. With neither, the stage's shape decides.*

---

<!-- _class: state-chart dark -->

`Dark mode`

## The same chart on a dark canvas.

Status tiles use the pill's stops, so every state name clears 4.5:1 on every theme.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Approved
  - -reject-> Draft
- Approved `done`
  - -schedule-> Scheduled
- Scheduled `blocked`
  - -publish-> Published
- Published `live`
  - -watch-> Monitored
- Monitored
  - -archive-> Archived
- Archived `end`

*The ordinal takes the name's ink on a status tile, so it holds contrast too.*
