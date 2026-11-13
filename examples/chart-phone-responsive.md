---
marp: true
theme: indaco
paginate: true
header: "Lattice · charts on a phone page"
---

<!-- _class: title silent -->

# Charts that fit a phone page

`Responsive charts · kanban, roadmap, journey, progress, timeline, word cloud, slope, flowchart notes`

Render at `--size mobile`, `story`, `4:5` or `square`: each chart fits its page at the 11pt text size, and one that fits a page stays on one page. One that cannot fit at 11pt is drawn whole and a little smaller.

---

<!-- _class: kanban -->

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

<!-- _class: roadmap -->

`H2 2026 · Rollout plan`

## The roadmap grids workstreams against phases.

| Workstream | Foundation `{Q2 2026}`   | Hardening `{Q3 2026}`      | Scale `{Q4 2026}`         |
| ---------- | ---------------------- | ------------------------ | ----------------------- |
| Framework  | [x] Signal taxonomy    | [-] Scoring model v2     | [ ] Per-team weights  |
| Governance | [x] Decision log       | [x] Calibration cadence  | [?] Board reporting     |
| Tooling    | [!] Intake form        | [/] Dashboards           | [ ] Self-serve  |

---

<!-- _class: journey -->

## The journey scores each stage of the path.

- Evaluate
  - Read case study `{who=prospect, mood=5}`
  - Book demo `{who=prospect, mood=4}`
  - Live demo `{who=prospect, mood=4}` `{who=sales}`
- Trial
  - Trial signup `{who=prospect, mood=3}`
  - Workspace setup `{who=user, mood=1}` `{who=onboarding}`
- Activate
  - First report `{who=user, mood=3}`
  - Daily use `{who=user, mood=5}`

---

<!-- _class: progress -->

`H1 2026 · Phase 1 readiness`

## Progress bars race toward their targets.

Snapshot at 14:00 UTC. Status pills reflect the most optimistic reading of the available data.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`

---

<!-- _class: timeline-list -->

`chart · timeline-list`

## The timeline pins events to their dates.

Four milestones show the shape; the date chips carry the when.

1. `Q1` The first milestone
   - One clause says what changed here.
2. `Q2` The second, marked `decision`
   - A tag names the milestone's kind.
3. `Q3` The third milestone
   - Sixteen words is each entry's budget.
4. `Q4` The fourth milestone
   - Four to six entries reads best.

---

<!-- _class: timeline-list -->

`chart · timeline-list · six entries`

## Six milestones run long on a square page.

On a square page this spine does not fit at 11pt, so it is drawn whole and a little smaller.

1. `2025 Q1` Discovery interviews with the first design partners
   - Twelve teams, two weeks each, one shared intake form.
2. `2025 Q2` Scoring model drafted and reviewed `decision`
   - The architecture review signs off the first weighting.
3. `2025 Q3` Pilot with one team for a full quarter `pilot`
   - Eighteen decisions logged, three of them reversed.
4. `2025 Q4` Calibration against the pilot's outcomes
   - Weights move for two of the five signals.
5. `2026 Q1` Production for every product team `live`
   - Policy live; twelve percent adoption in the first month.
6. `2026 Q2` Phase two: per-team weights
   - Each team tunes its own signals within a shared range.

---

<!-- _class: flowchart -->

`chart · flowchart · notes`

## The queue clears in three steps.

- Intake `pill` => Triage => Severity?
- Severity? `diamond`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket => Mitigate
- Page on-call `fail`
- Mitigate => Postmortem
- Postmortem `doc`

`@callout{[{Pages the secondary after five minutes, for=Page on-call, detail="Then the manager."}, {The slowest step in the loop, for=Mitigate}]}`

---

<!-- _class: word-cloud -->

## Weight is meaning in a word cloud.

- time-to-value `5`
- security `4`
- onboarding `4`
- pricing `3`
- integrations `3`
- support `2`
- roadmap `2`
- contracts `1`
- residency `1`

---

<!-- _class: slope -->

## Kestrel took the lead; Northwind gave it up.

- Northwind `fail`
  - 2023 `31%`
  - 2026 `24%`
- Kestrel Group `live`
  - 2023 `22%`
  - 2026 `29%`
- Vantage
  - 2023 `19%`
  - 2026 `21%`
- Meridian Partners
  - 2023 `17%`
  - 2026 `16%`
- Everyone else
  - 2023 `11%`
  - 2026 `10%`
