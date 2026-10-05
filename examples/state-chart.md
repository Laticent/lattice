---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · State chart"
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# Native state machines in plain markdown.

A list of states, arrows to a state's name, palette-blind SVG. The flowchart's grammar, on the same graph library.

---

<!-- _class: divider light -->

## What this deck shows.

A finite-state machine, authored as a list. Each item is a state, named by its text; its badge shows its place in the list. A sub-item that starts with an arrow is a transition to a state named by its text: `-submit-> Submitted`, or the state's own name for a self-loop. A sub-list of states makes a composite state, and a `>` blockquote under a state is hidden detail. The browser measures the states and Trama lays the machine out: a chain wraps into rows, a machine that branches is ranked, and every line is an elbow that never crosses a state. `lr` and `tb` pin the direction, `inline` renders rows of chips, `curved` rounds the corners.

---

<!-- _class: state-chart -->
<!-- _footer: "Default — laid out to fit the stage, with SVG edges" -->

`Submission lifecycle`

## Document approval flow.

How a draft moves from author to archive.

- Draft `start`
  - -submit-> Submitted
  - -discard-> Archived
- Submitted `on-track`
  - -review-> In Review
- In Review
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
- Approved `done`
  - -publish-> Published
- Published `live`
  - -archive-> Archived
- Archived `end`

*Rejected drafts return to the author; revisions stay in review.*

---

<!-- _class: state-chart -->
<!-- _footer: "Self-loop + branching" -->

## Connection retry.

- Connecting `start`
  - -retry-> Connecting
  - -ok-> Connected
  - -fail-> Failed
- Connected `live`
  - -disconnect-> Connecting
- Failed `end`

---

<!-- _class: state-chart -->
<!-- _footer: "Composite state — a sub-list of states is a group" -->

## An order ships in stages.

- Placed `start`
  - -pay-> Fulfillment
- Fulfillment
  - Picking
    - -packed-> Shipping
  - Shipping `live`
    - -arrive-> Delivered
  - -cancel-> Refunded
- Delivered `done` `end`
- Refunded `end`

*A transition from the composite leaves every state inside it.*

---

<!-- _class: state-chart lr -->
<!-- _footer: "Hidden detail — a blockquote shows on hover and in the notes" -->

## Every incident ends in a review.

- Open `start`
  - -triage-> Mitigating
- Mitigating `at-risk`
  - -resolve-> Resolved
  > Paging stays on until the error rate is back under target.
- Resolved
  - -review-> Closed
  > The postmortem is written within five working days.
- Closed `end`

*Hover a state in Present to read its detail.*

---

<!-- _class: state-chart inline -->
<!-- _footer: "Inline — same source, transitions as chips" -->

## Inline rendering.

- Draft `start`
  - -submit-> Submitted
  - -discard-> Archived
- Submitted `on-track`
  - -review-> In Review
- In Review
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
- Approved `done`
  - -publish-> Published
- Published `live`
  - -archive-> Archived
- Archived `end`

---

<!-- _class: state-chart lr -->
<!-- _footer: "lr — left-to-right (Mermaid direction LR)" -->

## Build pipeline.

- Source `start`
  - -compile-> Compiled
- Compiled
  - -test-> Tested
- Tested
  - -deploy-> Deployed
  - -fail-> Source
- Deployed `end`

---

<!-- _class: divider light -->

## Why a native state chart.

Mermaid's `stateDiagram-v2` works, but theming it cleanly requires a CSS override cascade with `!important` (see `docs/theming.md`). The native chart uses palette tokens directly — `var(--cat-1-fill)`, `var(--diagram-stroke)`, `var(--diagram-line)`, `var(--cat-on-fill)` — and inherits dark / light, every theme, automatically. No mmdc subprocess, no opaque SVG class names, no version coupling. Composite states are a sub-list; parallel regions, history states and guards are not in the grammar. When you need those, `<!-- _class: diagram -->` is the Mermaid escape hatch.

---

<!-- _class: divider -->

`Lattice · State chart`

## The list is the reading order.
