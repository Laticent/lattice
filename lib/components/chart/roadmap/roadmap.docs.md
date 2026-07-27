# roadmap

> Phased multi-workstream grid — phases across the top, workstreams down the side.

**Function** progression · **Form** matrix · **Substance** structure

**Drawn with** `html` — A real `<table>` of cells carrying state markers. The layout is a grid of text — nothing is positioned by value — so the semantic table is both the right structure for assistive tech and the right layout engine for the cells.

**Tags** `planning` · `swimlane` · `milestones` · `agile`

Use to show what ships in each phase across multiple parallel workstreams. Cells render as state-token discs (pass/warn/fail/skip).

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the plan. |
| `rows` | `table` | yes | A markdown table. The header row lists the phases (each may carry an inline-code date pill, e.g. `Q2 2026`); the first column is the workstream name; each cell leads with a state marker [x]/[-]/[ ]/[/] then the deliverable. |

### Variant decision rule

- **default (no modifier).** A plain phased grid — deliverables with state markers, no extra framing.
- **`horizons`.** The plan is framed as Now/Next/Later strategic horizons rather than literal calendar phases.
- **`status`.** Delivery state itself is the headline read — every cell already labels its own state explicitly, so the auto-emitted legend key is suppressed.
- **`swimlane`.** Each team's track should read as its own lane rather than a uniform grid — emphasizes team ownership over the grid structure.
- **`milestones`.** The phases are named, dated release gates (Beta/RC/GA) rather than generic quarters — pins a dated path.

### Common mistakes

- **Writing the deliverable text before the state marker in a cell.** Each cell must LEAD with the state marker (`[x] Shipped item`), not follow it — a marker placed after the text isn't recognized as the cell's state.

## When to use

- **Phased delivery across workstreams.** When the question is what each team ships in each phase. Workstreams down the side, phases across the top, deliverables in the cells — the whole plan reads in one glance.
- **State markers are the second channel.** Every cell can lead with `[x]` shipped, `[-]` in flight, `[ ]` planned, or `[/]` out of scope. The audience sees both 'what' and 'how it's going' without a separate status slide. A status key is emitted automatically below the grid for the markers present (suppressed only on the `status` variant, which already labels every cell).
- **Phase headers carry meta pills.** Append `` `Q2 2026` `` to a phase header and the renderer anchors a meta pill on the right of the column. Use it for date, owner, or status tags that frame the phase.

## When NOT to use

- **One workstream.** A single row of phases is a `timeline` or `list-steps`, not a roadmap. Roadmap earns its grid only when at least two workstreams move in parallel.
- **No state markers.** A grid of bare deliverables loses half its value. Add `[x]`/`[-]`/`[ ]`/`[/]` so the audience reads progress alongside scope.
- **Past five workstreams.** More than five rows compresses cell text and the lane stripes lose their categorical read. Group adjacent workstreams or split by phase.

## Authoring

```markdown
<!-- _class: roadmap -->

`H2 2026 · Plan`

## What ships in each phase, by workstream.

| Workstream | Foundation `Q2 2026` | Hardening `Q3 2026` | Scale `Q4 2026` |
| --- | --- | --- | --- |
| First workstream | [x] Shipped item | [-] In-flight item | [ ] Planned item |
| Second workstream | [x] Shipped item | [/] Out-of-scope item | [ ] Planned item |

State markers `[x]/[-]/[ ]/[/]` are universal: ✓ shipped, – in flight, ○ planned, ╱ out of scope.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Phased roadmap heading.                │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Q1        │ Q2        │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Track A   │ [x] done  │ [-] wip   │  │
│  │ Track B   │ [ ] plan  │ [/] skip  │  │
│  └───────────┴───────────┴───────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `horizons` — horizons

Bets spread across three horizons.

```markdown
<!-- _class: roadmap horizons -->

`Three-horizon planning`

## horizons spreads the bets across three horizons.

| Workstream    | Horizon 1 `Now`          | Horizon 2 `Next`         | Horizon 3 `Later`         |
| ------------- | ------------------------ | ------------------------ | ------------------------- |
| Signal Intake | [x] Connector v1     | [-] Multi-source dedupe    | [ ] Anomaly auto-routing |
| Scoring       | [x] Equal weights      | [-] Per-team calibration   | [ ] Per-decision profiles |
| Decision Log  | [x] Append-only schema   | [x] Outcome auto-pairing | [ ] Auditor export        |
| Adoption      | [x] One pilot team       | [/] Second team          | [ ] Org-wide enablement   |
```

### `status` — status

Delivery state at a glance.

```markdown
<!-- _class: roadmap status -->

`Layout · roadmap status`

## status reads delivery state at a glance.

| Workstream    | Foundation `Q2 2026` | Hardening `Q3 2026`      | Scale `Q4 2026`           |
| ------------- | -------------------- | ------------------------ | ------------------------- |
| Signal Intake | [x] Connector v1 | [-] Multi-source dedupe    | [ ] Anomaly auto-routing |
| Scoring       | [x] Equal weights    | [-] Per-team calibration | [ ] Per-decision profiles |
| Decision Log  | [x] Append schema    | [x] Outcome pairing      | [ ] Auditor export        |
| Adoption      | [x] One pilot team   | [/] Second team          | [ ] Org-wide enablement   |

State markers `[x]/[-]/[ ]/[/]` are universal: ✓ shipped, – in flight, ○ planned, ╱ out of scope.
```

### `swimlane` — swimlane

One track per team.

```markdown
<!-- _class: roadmap swimlane -->

`Layout · roadmap swimlane`

## swimlane gives each team its own track.

| Workstream    | Foundation `Q2 2026` | Hardening `Q3 2026`    | Scale `Q4 2026`           |
| ------------- | -------------------- | ---------------------- | ------------------------- |
| Signal Intake | Connector v1     | Multi-source dedupe        | Anomaly auto-routing  |
| Scoring       | Equal weights        | Per-team calibration   | Per-decision profiles    |
| Decision Log  | Append schema        | Outcome pairing        | Auditor export            |
| Adoption      | One pilot team       | Second team            | Org-wide enablement       |
```

### `milestones` — milestones

The dated path, pinned.

```markdown
<!-- _class: roadmap milestones -->

`Layout · roadmap milestones`

## milestones pins the dated path.

| Workstream    | Beta `Q2 2026`       | RC `Q3 2026`           | GA `Q4 2026`              |
| ------------- | -------------------- | ---------------------- | ------------------------- |
| Signal Intake | Connector v1     | Multi-source dedupe        | Anomaly auto-routing  |
| Scoring       | Equal weights        | Per-team calibration   | Per-decision profiles    |
| Decision Log  | Append schema        | Outcome pairing        | Auditor export            |
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`gantt`](../../chart/gantt/gantt.docs.md) — continuous task bars across a date axis rather than discrete phase cells
- [`kanban`](../../chart/kanban/kanban.docs.md) — current state by stage rather than phased schedule
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — single workstream sequence without parallel lanes
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — options scored against shared criteria, not phased delivery
- [`checklist`](../../inventory/checklist/checklist.docs.md) — single list with state markers, no workstream dimension

## Demo deck

See [roadmap.gallery.light.pdf](./roadmap.gallery.light.pdf) for rendered examples of every variant.
