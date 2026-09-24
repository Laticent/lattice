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

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
4. Approved `done`
   - `schedule => 5`
5. Scheduled `deferred`
   - `publish => 6`
6. Published `live` `end`

*Deferred draws hollow and dashed, so it never reads as "no status".*

---

<!-- _class: state-chart -->

`Reading-order wrap`

## Ten states wrap instead of shrinking.

Each row reads left to right, and one connector drops to the next.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
4. Approved `done`
   - `schedule => 5`
5. Scheduled
   - `publish => 6`
6. Published `live`
   - `watch => 7`
7. Monitored
   - `archive => 8`
8. Archived
   - `audit => 9`
9. Audited
   - `retire => 10`
10. Retired `end`

*As a single column these names set at 4.6px on this stage.*

---

<!-- _class: state-chart -->

`Reading-order wrap`

## Twelve states take three rows.

The chart scores every row count and keeps the one that sets the type largest.

1. Intake `start`
   - `triage => 2`
2. Triage
   - `assign => 3`
3. Assigned
   - `start => 4`
4. In Progress `live`
   - `review => 5`
5. Code Review
   - `approve => 6`
6. QA `on-track`
   - `stage => 7`
7. Staging
   - `release => 8`
8. Released `done`
   - `announce => 9`
9. Announced
   - `measure => 10`
10. Measured
   - `learn => 11`
11. Retro `deferred`
   - `close => 12`
12. Closed `end`

*A short chain stays on one row: wrapping has to buy a real gain in type size.*

---

<!-- _class: state-chart -->

`Loops`

## Loops nest; they don't cross.

Back-edges ride above their row, skips below, and each lane is ordered against the rest.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
   - `fast track => 5`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
4. Approved `done`
   - `schedule => 5`
5. Scheduled
   - `publish => 6`
6. Published `live`
   - `watch => 7`
7. Monitored
   - `archive => 8`
   - `reopen => 3`
8. Archived `end`

*Every label sits beside its own line, never on another.*

---

<!-- _class: state-chart -->

`Branching`

## A long pipeline with one fork wraps too.

dagre cannot wrap, so a wrapped layout competes with it and wins only by a clear margin.

1. Intake `start`
   - `triage => 2`
2. Triage
   - `assign => 3`
3. Assigned
   - `start => 4`
4. In Progress `live`
   - `review => 5`
   - `block => 9`
5. Code Review
   - `approve => 6`
6. QA `on-track`
   - `stage => 7`
   - `fail => 4`
7. Staging
   - `release => 8`
8. Released `done`
   - `close => 10`
9. Blocked `blocked`
   - `unblock => 4`
10. Closed `end`

*A fan-out that reads best as parallel ranks still goes to dagre.*

---

<!-- _class: state-chart tb -->

`Direction`

## Pin the direction when it carries meaning.

`tb` keeps a ladder top to bottom on a wide stage; it still wraps into columns.

1. Level 1 `start`
   - `escalate => 2`
2. Level 2 `on-track`
   - `escalate => 3`
3. Level 3 `at-risk`
   - `escalate => 4`
   - `resolve => 1`
4. Incident lead
   - `escalate => 5`
5. Executive `end`

*A row pins the same way with `lr`. With neither, the stage's shape decides.*

---

<!-- _class: state-chart dark -->

`Dark mode`

## The same chart on a dark canvas.

Status tiles use the pill's stops, so every state name clears 4.5:1 on every theme.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
   - `block => 7`
4. Approved `done`
   - `schedule => 5`
5. Scheduled
   - `publish => 6`
6. Published `live`
   - `archive => 8`
7. Blocked `blocked`
   - `unblock => 3`
8. Archived `end`

*The ordinal takes the name's ink on a status tile, so it holds contrast too.*
