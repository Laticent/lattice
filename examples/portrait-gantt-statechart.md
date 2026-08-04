---
marp: true
size: story
theme: indaco
paginate: true
header: "Lattice · gantt + state-chart portrait"
---

<!-- _class: title silent -->

# Native diagrams, made for the tall box.

`gantt · state-chart · portrait · 2026-06-19`

A Gantt is a horizontal time axis and a state machine is a graph — neither is "Mermaid", and neither has a direction to flip. On a portrait deck they used to strand themselves in a short band. Now each restyles to the box it occupies.

---

<!-- _class: content -->

## Two charts, two different levers.

`gantt` is an HTML/CSS grid, so it reflows in CSS — no kernel change, landscape untouched. `state-chart` is native SVG whose edges are measured in the browser, so it fills the height and re-routes.

- **gantt** — the lane label rides *above* full-width bars; lanes distribute down the canvas; the time axis stays aligned.
- **state-chart** — the vertical default fills the height; an `lr` machine falls back to `tb` where a row can't fit.
- **Landscape is byte-identical** — every change is gated on a tall container.

---

<!-- _class: gantt -->
<!-- _footer: "gantt · lane labels over full-width bars" -->

`2026 Q1 .. 2026 Q4`

## What ships in each phase, by workstream.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live`
  - Per-team weighting `Q3..Q4` `at-risk`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4`
- Governance
  - Decision log `Q1..Q2` `done`
  - Board reporting `Q3..Q4`

---

<!-- _class: state-chart -->
<!-- _footer: "state-chart · vertical default fills the height" -->

`Submission lifecycle`

## Document approval flow.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
4. Approved `done`
   - `publish => 5`
5. Published `end`

---

<!-- _class: state-chart lr -->
<!-- _footer: "state-chart lr · falls back to vertical" -->

`Incident response`

## On-call escalation path.

1. Detected `start`
   - `page => 2`
2. Acknowledged `on-track`
   - `mitigate => 3`
3. Mitigating
   - `resolve => 4`
   - `escalate => self`
4. Resolved `done`
   - `close => 5`
5. Closed `end`

---

<!-- _class: quote -->

## Restyle, don't rearrange.

A Gantt and a journey can't "switch direction" — the constraint is structural. The win is treating a portrait deck as a different box to design for, not a landscape slide that got squeezed.
