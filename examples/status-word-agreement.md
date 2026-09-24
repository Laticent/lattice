---
marp: true
theme: indaco
paginate: true
header: "Lattice · status word agreement"
---

<!-- _class: title silent -->

# Status words agree

`Chart · status vocabulary`

A status word colors the same way wherever the engine accepts it.

---

<!-- _class: kanban -->

`kanban · capitals`

## A capitalized status now tints its card.

- Backlog
  - Lowercase control `S`
    - platform `at-risk`
  - Upper case `M`
    - platform `AT-RISK`
- In progress
  - Title case `M`
    - data `Blocked`
  - Upper pilot `S`
    - data `PILOT`
- Review
  - Mixed case `S`
    - infra `On-Track`
  - No status `S`
    - infra

*Capitals used to paint an untinted card.*

---

<!-- _class: progress -->

`progress · pilot and decision`

## A pilot bar now wears the pilot color.

- Adoption `68%` `on-track`
- Regional pilot `45%` `pilot`
- Pricing call `30%` `decision`
- Data migration `41%` `at-risk`
- No status `52%`

*Bar and pill both read informational; the bar used to stay on slot 1.*

---

<!-- _class: gantt -->

`2026 Q1 .. 2026 Q4`

## Gantt spends the status word on the bar.

- Platform
  - Control `Q1..Q2`
  - Migration `Q2..Q3` `at-risk`
  - Cutover `Q3..Q4` `blocked`
- Data
  - Pilot run `Q1..Q2` `pilot`
  - Launch `Q2..Q4` `live`

*Gantt paints live as running work, apart from done.*

---

<!-- _class: state-chart -->

`Submission lifecycle`

## A state chart puts it on the badge.

1. Draft `start`
   - `submit => 2`
2. Submitted `at-risk`
   - `approve => 3`
3. Approved `fail` `end`

---

<!-- _class: slope -->

`slope · entity status`

## Slope colors the whole line.

- Northwind `fail`
  - Before `18`
  - After `9`
- Contoso
  - Before `12`
  - After `19`
- Fabrikam `on-track`
  - Before `10`
  - After `14`

---

<!-- _class: closing -->

# Same word, same color.

The pill keeps your spelling; the color comes from the lowercase word.
