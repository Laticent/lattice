---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · Graph charts: rearrange"
acronyms:
  QA: Q A
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# A chart may move a state to cross fewer lines.

`rearrange` lets a wrapped state chart or flowchart leave the written order when that draws a cleaner chart. It is off unless you ask.

---

<!-- _class: state-chart -->
<!-- _footer: "1 — written order (the default)" -->

`Written order`

## Blocked is written last, so it lands at the end.

- Intake `start`
  - -triage-> Triage
- Triage
  - -assign-> Assigned
- Assigned
  - -start-> In Progress
- In Progress `on-track`
  - -review-> Code Review
  - -block-> Blocked
- Code Review
  - -approve-> QA
  - -reject-> In Progress
- QA
  - -stage-> Staging
  - -fail-> In Progress
- Staging
  - -release-> Released
- Released `live`
  - -close-> Closed
- Blocked `blocked`
  - -unblock-> In Progress
- Closed `end`

*Its two lines to In Progress reach back a whole row.*

---

<!-- _class: state-chart rearrange -->
<!-- _footer: "2 — the same machine, rearrange" -->

`rearrange`

## With rearrange, Blocked sits beside the state it leaves.

- Intake `start`
  - -triage-> Triage
- Triage
  - -assign-> Assigned
- Assigned
  - -start-> In Progress
- In Progress `on-track`
  - -review-> Code Review
  - -block-> Blocked
- Code Review
  - -approve-> QA
  - -reject-> In Progress
- QA
  - -stage-> Staging
  - -fail-> In Progress
- Staging
  - -release-> Released
- Released `live`
  - -close-> Closed
- Blocked `blocked`
  - -unblock-> In Progress
- Closed `end`

*The badges still number each state by its place in your list.*

---

<!-- _class: flowchart -->
<!-- _footer: "3 — a flowchart in written order" -->

`Written order`

## Detours written last run back across the flow.

- Lead `pill` => Qualify => Demo => Proposal => Negotiate => Sign => Onboard => Renew
- Renew `pill`
- Negotiate -legal review-> Legal
- Legal -cleared-> Sign
- Demo -needs trial-> Trial
- Trial -converted-> Proposal

*Legal and Trial are written after the main flow.*

---

<!-- _class: flowchart rearrange -->
<!-- _footer: "4 — the same flowchart, rearrange" -->

`rearrange`

## With rearrange, each detour sits beside its step.

- Lead `pill` => Qualify => Demo => Proposal => Negotiate => Sign => Onboard => Renew
- Renew `pill`
- Negotiate -legal review-> Legal
- Legal -cleared-> Sign
- Demo -needs trial-> Trial
- Trial -converted-> Proposal

*The chart moves a shape only when that draws a cleaner chart.*

---

<!-- _class: state-chart rearrange -->
<!-- _footer: "5 — a chain, rearrange" -->

`Nothing to fix`

## A chart that already reads cleanly draws as written.

- Draft `start`
  - -submit-> Submitted
- Submitted
  - -triage-> Triaged
- Triaged
  - -assign-> Assigned
- Assigned
  - -start-> Building
- Building
  - -finish-> Review
- Review
  - -approve-> Approved
- Approved `done`
  - -merge-> Merged
- Merged
  - -deploy-> Deployed
- Deployed `live`
  - -verify-> Closed
- Closed `end`

*With no crossing to remove, rearrange changes nothing.*
