---
marp: true
theme: indaco
pagination: true
header: "Lattice · roadmap"
---

<!-- @meta{layout=title, class=silent} -->

# roadmap

`Progression · Matrix · Structure`

Phased multi-workstream grid — phases across the top, workstreams down the side.

---

<!-- @meta{layout=roadmap, footer=Default · roadmap} -->

`H2 2026 · Rollout plan`

## The roadmap grids workstreams against phases.

| Workstream | Foundation `{Q2 2026}`   | Hardening `{Q3 2026}`      | Scale `{Q4 2026}`         |
| ---------- | ---------------------- | ------------------------ | ----------------------- |
| Framework  | [x] Signal taxonomy    | [-] Scoring model v2     | [ ] Per-team weights  |
| Governance | [x] Decision log       | [x] Calibration cadence  | [?] Board reporting     |
| Tooling    | [!] Intake form        | [/] Dashboards           | [ ] Self-serve  |


---

<!-- @meta{layout=roadmap, class=horizons, footer="horizons · roadmap horizons — Bets spread across three horizons."} -->

`Three-horizon planning`

## horizons spreads the bets across three horizons.

| Workstream    | Horizon 1 `{Now}`          | Horizon 2 `{Next}`         | Horizon 3 `{Later}`         |
| ------------- | ------------------------ | ------------------------ | ------------------------- |
| Signal Intake | [x] Connector v1     | [-] Dedupe pass    | [ ] Auto-routing |
| Scoring       | [x] Equal weights      | [-] Per-team weights   | [/] Decision profiles |


---

<!-- @meta{layout=roadmap, class=status, footer="status · roadmap status — Delivery state at a glance."} -->

`Layout · roadmap status`

## status reads delivery state at a glance.

| Workstream    | Foundation `{Q2 2026}` | Hardening `{Q3 2026}`      | Scale `{Q4 2026}`           |
| ------------- | -------------------- | ------------------------ | ------------------------- |
| Signal Intake | [x] Connector v1 | [-] Dedupe pass    | [?] Auto-routing |
| Scoring       | [x] Equal weights    | [-] Per-team weights | [ ] Decision profiles |
| Decision Log  | [x] Append schema    | [!] Outcome pairing      | [ ] Auditor export        |


---

<!-- @meta{layout=roadmap, class=swimlane, footer="swimlane · roadmap swimlane — One track per team."} -->

`Layout · roadmap swimlane`

## swimlane gives each team its own track.

| Workstream    | Foundation `{Q2 2026}` | Hardening `{Q3 2026}`    | Scale `{Q4 2026}`           |
| ------------- | -------------------- | ---------------------- | ------------------------- |
| Signal Intake | Connector v1     | Dedupe pass        | Auto-routing  |
| Scoring       | Equal weights        | Per-team weights   | Decision profiles    |
| Decision Log  | Append schema        | Outcome pairing        | Auditor export            |


---

<!-- @meta{layout=roadmap, class=milestones, footer="milestones · roadmap milestones — The dated path, pinned."} -->

`Layout · roadmap milestones`

## milestones pins the dated path.

| Workstream    | Beta `{Q2 2026}`       | RC `{Q3 2026}`           | GA `{Q4 2026}`              |
| ------------- | -------------------- | ---------------------- | ------------------------- |
| Signal Intake | Connector v1     | Dedupe pass        | Auto-routing  |
| Scoring       | Equal weights        | Per-team weights   | Decision profiles    |
| Decision Log  | Append schema        | Outcome pairing        | Auditor export            |


---

<!-- @meta{layout=roadmap, footer="Stress test · roadmap — Four phases — the ceiling, and what portrait paginates."} -->
<!-- @meta{stress-slide} -->

`roadmap · stress`

## Three workstreams by four phases.

| Workstream | Phase one | Phase two | Phase three | Phase four |
| --- | --- | --- | --- | --- |
| First | [x] Done cell | [-] Active cell | [ ] Planned | [ ] The last one |
| Second | [x] Every cell filled | [-] No blanks | [ ] The honest grid | [ ] Four words max |
| Third | [x] Short labels | [-] Four words max | [ ] Or it wraps | [ ] The ceiling |


---

<!-- @meta{layout=roadmap, class=dark, footer=Composition: dark · roadmap dark} -->

`H2 2026 · Rollout plan`

## The roadmap grids workstreams against phases.

| Workstream | Foundation `{Q2 2026}`   | Hardening `{Q3 2026}`      | Scale `{Q4 2026}`         |
| ---------- | ---------------------- | ------------------------ | ----------------------- |
| Framework  | [x] Signal taxonomy    | [-] Scoring model v2     | [ ] Per-team weights  |
| Governance | [x] Decision log       | [x] Calibration cadence  | [?] Board reporting     |
| Tooling    | [!] Intake form        | [/] Dashboards           | [ ] Self-serve  |


---

<!-- @meta{layout=roadmap, class=compact, footer=Composition: compact · roadmap compact} -->

`H2 2026 · Rollout plan`

## The roadmap grids workstreams against phases.

| Workstream | Foundation `{Q2 2026}`   | Hardening `{Q3 2026}`      | Scale `{Q4 2026}`         |
| ---------- | ---------------------- | ------------------------ | ----------------------- |
| Framework  | [x] Signal taxonomy    | [-] Scoring model v2     | [ ] Per-team weights  |
| Governance | [x] Decision log       | [x] Calibration cadence  | [?] Board reporting     |
| Tooling    | [!] Intake form        | [/] Dashboards           | [ ] Self-serve  |


---

<!-- @meta{layout=roadmap, class=accent, footer=Composition: accent · roadmap accent} -->

`H2 2026 · Rollout plan`

## The roadmap grids workstreams against phases.

| Workstream | Foundation `{Q2 2026}`   | Hardening `{Q3 2026}`      | Scale `{Q4 2026}`         |
| ---------- | ---------------------- | ------------------------ | ----------------------- |
| Framework  | [x] Signal taxonomy    | [-] Scoring model v2     | [ ] Per-team weights  |
| Governance | [x] Decision log       | [x] Calibration cadence  | [?] Board reporting     |
| Tooling    | [!] Intake form        | [/] Dashboards           | [ ] Self-serve  |


---

<!-- @meta{layout=cards-grid, class=three claim-hero, footer=Anti-patterns · roadmap} -->

## When NOT to reach for roadmap.

- One workstream
  - A single row of phases is a `timeline` or `list-steps`, not a roadmap. Roadmap earns its grid only when at least two workstreams move in parallel.
- No state markers
  - A grid of bare deliverables loses half its value. Add state markers (`\[x]` `\[-]` `\[!]` `\[?]` `\[ ]` `\[/]`) so the audience reads progress alongside scope.
- Past five workstreams
  - More than five rows compresses cell text and the lane stripes lose their categorical read. Group adjacent workstreams or split by phase.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `gantt` — continuous task bars across a date axis rather than discrete phase cells
- `kanban` — current state by stage rather than phased schedule
- `list-steps` — single workstream sequence without parallel lanes
- `verdict-grid` — options scored against shared criteria, not phased delivery
- `checklist` — single list with state markers, no workstream dimension
