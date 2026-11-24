---
marp: true
theme: indaco
pagination: true
header: "Lattice · state-chart"
---

<!-- @meta{layout=title, class=silent} -->

# state-chart

`Progression · Timeline · Graph`

Native state machine diagram — states as a list, transitions as arrows to a state's name, on the flowchart's grammar.

---

<!-- _class: state-chart lr -->
<!-- @meta{footer=Default · state-chart} -->

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
<!-- @meta{footer="Left-to-right · state-chart lr — States flow left to right."} -->

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
<!-- @meta{footer="Top-to-bottom · state-chart tb — States flow top to bottom, whatever the stage."} -->

## tb stacks the states top to bottom.

- Queued `start`
  - -claim-> Running
- Running `live`
  - -finish-> Complete
  - -crash-> Queued
- Complete `end`


---

<!-- _class: state-chart inline -->
<!-- @meta{footer="Inline · state-chart inline — The machine as rows with transition chips, beside its prose."} -->

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
<!-- @meta{footer="Curved · state-chart curved — Generously rounded corners on the router's lines."} -->

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
<!-- @meta{footer="Unnumbered · state-chart unnumbered — No badges: the states show no place in the list."} -->

## unnumbered drops the badges.

- Open `start`
  - -assign-> Assigned
- Assigned `live`
  - -resolve-> Resolved
- Resolved `end`


---

<!-- _class: state-chart rearrange -->
<!-- @meta{footer="Rearrange · state-chart rearrange — States may leave their written order when that draws a cleaner chart."} -->

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
<!-- @meta{stress-slide} -->
<!-- @meta{footer="Stress test · state-chart — A dense machine of states."} -->

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

<!-- @meta{layout=state-chart, class=lr dark, footer=Composition: dark · state-chart dark} -->

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

<!-- @meta{layout=state-chart, class=lr compact, footer=Composition: compact · state-chart compact} -->

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

<!-- @meta{layout=state-chart, class=lr accent, footer=Composition: accent · state-chart accent} -->

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

<!-- @meta{layout=cards-grid, class=three claim-hero, footer=Anti-patterns · state-chart} -->

## When NOT to reach for state-chart.

- More than ~12 states
  - Past about a dozen states the machine reads as a list. Group them into phases and show one phase at a time.
- Parallel regions, history or guards
  - A composite state is a sub-list, but orthogonal regions, history states and guards are not in this grammar. Use a Mermaid fence via `diagram`.
- Continuous processes
  - Stages that overlap or block (queue depth, throughput, capacity) read better as `gantt` or `kanban`. A state chart is for discrete, mutually exclusive states.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `diagram` — the machine has hierarchical states, parallel regions, or guards that need Mermaid's full state-diagram grammar
- `journey` — the sequence is a user's path through tasks with mood / affect, not a system's discrete states
- `timeline-list` — events are points in time rather than transitions between named states
- `list-steps` — a linear procedure with no branching — state-chart is overkill if there are no choices to make
- `roadmap` — parallel workstreams across phases, not a single machine's transitions
