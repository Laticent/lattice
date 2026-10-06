---
marp: true
theme: indaco
paginate: true
header: "Lattice · state-chart"
---

<!-- _class: title silent -->

# state-chart

`Progression · Timeline · Graph`

Native state machine diagram — states as a list, transitions as arrows to a state's name, on the flowchart's grammar.

---

<!-- _class: state-chart lr -->
<!-- _footer: "Default · state-chart" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
  > Two reviewers must sign off before approval.
- Approved
  - -publish-> Published
- Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: state-chart lr -->
<!-- _footer: "Left-to-right · state-chart lr — States flow left to right." -->

## lr flows the states left to right.

- Source `start`
  - -compile-> Compiled
- Compiled
  - -test-> Tested
- Tested
  - -deploy-> Deployed
  - -fail-> Source
- Deployed `end`


---

<!-- _class: state-chart tb -->
<!-- _footer: "Top-to-bottom · state-chart tb — States flow top to bottom, whatever the stage." -->

## tb stacks the states top to bottom.

- Queued `start`
  - -claim-> Running
- Running `live`
  - -finish-> Complete
  - -crash-> Queued
- Complete `end`


---

<!-- _class: state-chart inline -->
<!-- _footer: "Inline · state-chart inline — The machine as rows with transition chips, beside its prose." -->

## inline sets the chart beside its prose.

- Connecting `start`
  - -retry-> Connecting
  - -ok-> Connected
  - -fail-> Failed
- Connected `live`
  - -disconnect-> Connecting
- Failed `end`


---

<!-- _class: state-chart curved -->
<!-- _footer: "Curved · state-chart curved — Generously rounded corners on the router's lines." -->

## curved rounds the lines between states.

- Draft `start`
  - -submit-> In Review
  - -discard-> Archived
- In Review `at-risk`
  - -approve-> Approved
  - -revise-> In Review
  - -reject-> Draft
- Approved
  - -publish-> Published
- Published `live`
  - -archive-> Archived
- Archived `end`


---

<!-- _class: state-chart unnumbered -->
<!-- _footer: "Unnumbered · state-chart unnumbered — No badges: the states show no place in the list." -->

## unnumbered drops the badges.

- Open `start`
  - -assign-> Assigned
- Assigned `live`
  - -resolve-> Resolved
- Resolved `end`


---

<!-- _class: state-chart rearrange -->
<!-- _footer: "Rearrange · state-chart rearrange — States may leave their written order when that crosses fewer lines." -->

## rearrange lets a side state sit beside the state it leaves.

- Intake `start`
  - -triage-> Triage
- Triage
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


---

<!-- _class: state-chart -->
<!-- stress-slide -->
<!-- _footer: "Stress test · state-chart — A dense machine of states." -->

`Submission lifecycle`

## Stress test — back-edges, skips, self-loop.

- Draft `start`
  - -submit-> Submitted
  - -discard-> Published
- Submitted `on-track`
  - -review-> In Review
  - -withdraw-> Draft
- In Review
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
- Approved `done`
  - -recall-> In Review
  - -publish-> Published
- Published `end`
  - -amend-> In Review


---

<!-- _class: state-chart lr dark -->
<!-- _footer: "Composition: dark · state-chart dark" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
  > Two reviewers must sign off before approval.
- Approved
  - -publish-> Published
- Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: state-chart lr compact -->
<!-- _footer: "Composition: compact · state-chart compact" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
  > Two reviewers must sign off before approval.
- Approved
  - -publish-> Published
- Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: state-chart lr accent -->
<!-- _footer: "Composition: accent · state-chart accent" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

- Draft `start`
  - -submit-> Submitted
- Submitted `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
  > Two reviewers must sign off before approval.
- Approved
  - -publish-> Published
- Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: cards-stack -->
<!-- _footer: "Anti-patterns · state-chart · 1 of 2" -->

## When NOT to reach for state-chart.

- More than ~12 states
  - A long chain wraps onto more lines rather than shrinking, so eight or ten states still read. Past about a dozen the machine stops reading as a machine and starts reading as a list, however it is laid out. Group the states into phases and show one phase at a time, or step back to a higher-level abstraction. The chart's job is to make the topology obvious in one glance.

---

<!-- _class: cards-stack -->
<!-- _footer: "Anti-patterns · state-chart · 2 of 2" -->

## When NOT to reach for state-chart.

- Parallel regions, history or guards
  - A composite state is a sub-list of states, but orthogonal regions, history states and guard conditions are not in this grammar. Those belong in a Mermaid fence via the `diagram` component.
- Continuous processes
  - If the diagram is really a workflow with stages that overlap or block (queue depth, throughput, capacity), a `gantt` or `kanban` chart reads better. State charts are for discrete, mutually-exclusive states the system flips between.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `diagram` — the machine has hierarchical states, parallel regions, or guards that need Mermaid's full state-diagram grammar
- `journey` — the sequence is a user's path through tasks with mood / affect, not a system's discrete states
- `timeline-list` — events are points in time rather than transitions between named states
- `list-steps` — a linear procedure with no branching — state-chart is overkill if there are no choices to make
- `roadmap` — parallel workstreams across phases, not a single machine's transitions
