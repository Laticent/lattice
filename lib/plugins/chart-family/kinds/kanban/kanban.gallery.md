---
marp: true
theme: indaco
paginate: true
header: "Lattice · kanban"
---

<!-- @meta{layout=title, class=silent} -->

# kanban

`Progression · Timeline · Series`

Kanban board — columns of cards by stage.

---

<!-- _class: kanban -->
<!-- @meta{footer=Default · kanban} -->

`chart · kanban`

## The board tracks cards across lanes.

- Backlog
  - Waiting cards `S`
- In progress
  - The active limit `M`
- Review
  - Almost done `S`
- Done
  - Shipped work `L`


---

<!-- _class: kanban keyline -->
<!-- @meta{footer="keyline · kanban keyline — Hairlines rule the lanes apart."} -->

`kanban keyline`

## keyline rules the lanes apart.

- Backlog
  - Ruled lanes `S`
- In progress
  - Same board `M`
- Done
  - New look `L`


---

<!-- _class: kanban tinted -->
<!-- @meta{footer="tinted · kanban tinted — Each lane takes a colored wash."} -->

`kanban tinted`

## tinted colors each lane's wash.

- Backlog
  - Lane wash `S`
- In progress
  - Color coded `M`
- Done
  - Reads faster `L`


---

<!-- _class: kanban compact -->
<!-- @meta{stress-slide} -->
<!-- @meta{footer="Stress test · kanban — Six lanes — the board's hard ceiling."} -->

`kanban · stress`

## Six lanes is the board's hard ceiling.

- Intake
  - New arrivals `S`
  - Unsorted `S`
- Backlog
  - Prioritized queue `M`
- In progress
  - The WIP limit `L`
- Review
  - Awaiting eyes `M`
- Staging
  - Nearly out `S`
- Done
  - The sixth lane `S`


---

<!-- @meta{layout=kanban, class=dark, footer=Composition: dark · kanban dark} -->

`chart · kanban`

## The board tracks cards across lanes.

- Backlog
  - Waiting cards `S`
- In progress
  - The active limit `M`
- Review
  - Almost done `S`
- Done
  - Shipped work `L`


---

<!-- @meta{layout=kanban, class=compact, footer=Composition: compact · kanban compact} -->

`chart · kanban`

## The board tracks cards across lanes.

- Backlog
  - Waiting cards `S`
- In progress
  - The active limit `M`
- Review
  - Almost done `S`
- Done
  - Shipped work `L`


---

<!-- @meta{layout=kanban, class=accent, footer=Composition: accent · kanban accent} -->

`chart · kanban`

## The board tracks cards across lanes.

- Backlog
  - Waiting cards `S`
- In progress
  - The active limit `M`
- Review
  - Almost done `S`
- Done
  - Shipped work `L`


---

<!-- @meta{layout=cards-grid, class=three claim-hero, footer=Anti-patterns · kanban} -->

## When NOT to reach for kanban.

- Schedule, not status
  - If the question is when each task ships rather than where it sits today, reach for `gantt` (spans) or `roadmap` (phases). Kanban is a snapshot, not a timeline.
- More than five lanes
  - Past five columns the cards compress and the column headers crowd. Group adjacent stages or split into two boards (e.g. by team) instead.
- Cards without meta
  - A board of bare titles wastes the layout's affordances. Add at least a size badge and a lane label so the audience can scan workload and ownership at a glance.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `gantt` — schedule of overlapping tasks across lanes, not current state
- `roadmap` — phased grid of deliverables across workstreams
- `checklist` — single list of items with done/in-flight/planned states
- `verdict-grid` — options scored against shared criteria, not stage-tracked
