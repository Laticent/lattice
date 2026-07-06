---
marp: true
theme: indaco
paginate: true
header: "Lattice · state-chart"
---

<!-- _class: title silent -->

# state-chart

`Progression · Timeline · Graph`

Native state machine diagram — states as a numbered list, transitions as nested inline-code refs.

---

<!-- _class: state-chart lr -->
<!-- _footer: "Default · state-chart" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
   - Two reviewers must sign off before approval.
4. Approved
   - `publish => 5`
5. Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: state-chart lr -->
<!-- _footer: "Left-to-right · state-chart lr — States flow left to right." -->

## lr flows the states left to right.

1. Source `start`
   - `compile => 2`
2. Compiled
   - `test => 3`
3. Tested
   - `deploy => 4`
   - `fail => 1`
4. Deployed `end`


---

<!-- _class: state-chart inline -->
<!-- _footer: "Inline · state-chart inline — The chart sits beside its prose." -->

## inline sets the chart beside its prose.

1. Connecting `start`
   - `retry => self`
   - `ok => 2`
   - `fail => 3`
2. Connected `live`
   - `disconnect => 1`
3. Failed `end`


---

<!-- _class: state-chart curved -->
<!-- _footer: "Curved · state-chart curved — Eased arrows between states." -->

## curved eases the arrows between states.

1. Draft `start`
   - `submit => 2`
   - `discard => 5`
2. In Review `at-risk`
   - `approve => 3`
   - `revise => self`
   - `reject => 1`
3. Approved
   - `publish => 4`
4. Published `live`
   - `archive => 5`
5. Archived `end`


---

<!-- _class: state-chart -->
<!-- stress-slide -->
<!-- _footer: "Stress test · state-chart — A dense machine of states." -->

`Submission lifecycle`

## Stress test — back-edges, skips, self-loop.

1. Draft `start`
   - `submit => 2`
   - `discard => 5`
2. Submitted `on-track`
   - `review => 3`
   - `withdraw => 1`
3. In Review
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
4. Approved `done`
   - `recall => 3`
   - `publish => 5`
5. Published `end`
   - `amend => 3`


---

<!-- _class: state-chart lr dark -->
<!-- _footer: "Composition: dark · state-chart dark" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
   - Two reviewers must sign off before approval.
4. Approved
   - `publish => 5`
5. Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: state-chart lr compact -->
<!-- _footer: "Composition: compact · state-chart compact" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
   - Two reviewers must sign off before approval.
4. Approved
   - `publish => 5`
5. Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: state-chart lr accent -->
<!-- _footer: "Composition: accent · state-chart accent" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
   - Two reviewers must sign off before approval.
4. Approved
   - `publish => 5`
5. Published `end`

*Rejected drafts return to the author; revisions stay in review.*


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · state-chart" -->

## When NOT to reach for state-chart.

- **More than ~8 states.** Vertical stacks of ten or more states stop reading as a machine and start reading as a list. If the system has many states, group them into phases and show one phase at a time, or step back to a higher-level abstraction. The chart's job is to make the topology obvious in one glance.
- **Hierarchical or parallel states.** v1 grammar is one flat list of states with one outgoing arrow per nested bullet. Composite states, orthogonal regions, history nodes — anything Mermaid's `stateDiagram-v2` does and this layout doesn't — belong in a Mermaid fence via the `diagram` component.
- **Continuous processes.** If the diagram is really a workflow with stages that overlap or block (queue depth, throughput, capacity), a `gantt` or `kanban` chart reads better. State charts are for discrete, mutually-exclusive states the system flips between.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `diagram` — the machine has hierarchical states, parallel regions, or guards that need Mermaid's full state-diagram grammar
- `journey` — the sequence is a user's path through tasks with mood / affect, not a system's discrete states
- `timeline-list` — events are points in time rather than transitions between named states
- `list-steps` — a linear procedure with no branching — state-chart is overkill if there are no choices to make
- `roadmap` — parallel workstreams across phases, not a single machine's transitions
