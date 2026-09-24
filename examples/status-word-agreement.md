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

`progress · capitals`

## Progress reads the word in any case.

- Adoption `68%` `on-track`
- Regional pilot `45%` `PILOT`
- Pricing call `30%` `decision`
- Data migration `41%` `at-risk`
- Vendor swap `37%` `AT-RISK`
- No status `52%`

*Both at-risk rows share one color; capitals used to fall back to info.*

---

<!-- _class: timeline-list -->

`timeline-list · capitals`

## A timeline pill keeps your spelling and the color.

1. `2026 Q1` Framework approved `decision`
   - Signed off by the steering group.
2. `2026 Q2` Vendor migration `AT-RISK`
   - Contract slipped a quarter.
3. `2026 Q3` Regional launch `On-Track`
   - Two of three markets live.

*Capitals used to paint the info fallback.*

---

<!-- _class: gantt -->

`2026 Q1 .. 2026 Q4`

## Gantt spends the status word on the bar.

- Platform
  - Control `Q1..Q2`
  - Migration `Q2..Q3` `AT-RISK`
  - Cutover `Q3..Q4` `blocked`
- Data
  - Pilot run `Q1..Q2` `pilot`
  - Launch `Q2..Q4` `live`

*Gantt paints live as running work, apart from done.*

---

<!-- _class: state-chart lr -->

`Submission lifecycle · lr`

## A state chart puts it on the badge.

1. Draft `start`
   - `submit => 2`
2. Submitted `AT-RISK`
   - `review => 3`
3. Reviewed `on-track`
   - `approve => 4`
   - `reject => 1`
4. Approved `end`

---

<!-- _class: slope -->

`slope · entity status`

## Slope colors the whole line.

- Northwind `fail`
  - Before `18`
  - After `9`
- Contoso `AT-RISK`
  - Before `12`
  - After `19`
- Fabrikam `on-track`
  - Before `10`
  - After `14`

---

<!-- _class: closing -->

# Same word, same color.

Six components, one rule: case folds, and the pill keeps your spelling.
