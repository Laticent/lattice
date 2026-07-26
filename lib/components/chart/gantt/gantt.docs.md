# gantt

> Gantt chart — task bars across a date axis.

**Function** progression · **Form** timeline · **Substance** series

**Tags** `swimlane` · `planning` · `milestones` · `agile`

Use for project plans with overlapping or staggered tasks. Each task is a bar on the time axis; bars can span multiple periods and carry status tints.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the plan. |
| `tasks` | `ul > li` | yes | Outer li per workstream lane; nested bullets per task. Each task carries trailing inline-code tokens, in any order: a span `START..END` (a bar) or a single time point (a milestone diamond); an optional status; an optional `after: Task name` dependency; an optional `milestone` keyword. `..` is the only span delimiter. Time points are ISO dates (2026-03-15), quarters (Q1 or 2026 Q1), or months (Jan); a chart uses dates OR ordinals, not both. Status vocabulary: on-track / done / live / at-risk / warn / blocked / fail / deferred / pilot / decision. The axis derives from the data; the eyebrow may override it with a `START..END` window and add a `today <point>` marker. Tokens are validated by the linter (retired delimiter, bad span/status, dangling or inverted `after:`). |
| `detail` | `ul > li > ul > li > ul > li` | no | Optional per-task reveal detail. A nested bullet under a TASK (one level deeper than the task) — plain prose: the owner, the blocker, the why — is captured as that task's detail rather than rendered on the bar. It drives two surfaces from one source: (1) on screen (Drawing Board present/practice/preview) the bar/milestone is tagged data-mark and the prose rides an inert `<template class="chart-detail">` the reveal layer shows in a popover on hover/tap, with the active bar lifted + glowing and the rest dimmed (gantt is reveal-only — no 3D tilt, which would skew the time axis); (2) the static PDF — the same detail folds into the slide's speaker note (`Task (span): item · item`) as a Marp-faithful comment. Renders nothing on the chart face, so a chart with no detail bullets is byte-identical. Must be a bullet, not a trailing inline-code token. |

### Common mistakes

- **Writing the detail prose as a trailing inline-code token instead of a nested bullet.** Detail must be a nested bullet ONE level deeper than the task, not a trailing `` `code` `` token — only a nested bullet drives the reveal popover and speaker note; a trailing-token 'detail' isn't recognized at all.

### Data shape

- A chart uses dates OR ordinals (quarters/months) consistently — never mix `2026-03-15` spans with `Q1`/`Jan` spans in the same chart.
- `..` is the only span delimiter — a hyphen or en-dash between two dates isn't recognized as a span.
- `after: Task name` must reference another task's exact label already defined earlier in the chart, or the dependency is dangling.

## When to use

- **Overlapping work across lanes.** When tasks run in parallel across multiple workstreams and the audience needs to see who is busy when. The lane-stacked bars make concurrency visible at a glance.
- **Span is the story.** Each bar's length encodes its duration. Use gantt when start dates, end dates, and overlap are what you want the audience to remember.
- **Status pills add a second channel.** Tint bars with `done` / `live` / `at-risk` / `blocked` to layer health onto schedule. The plan reads as both 'when' and 'how it's going' in one chart. Since the bars carry no status text, a swatch+label status key is emitted automatically below the chart for the statuses present.

## When NOT to use

- **Single workstream.** One lane of bars is a timeline, not a gantt. Use `timeline` or `list-steps` when there is no parallel work to coordinate.
- **More than five lanes.** Past five workstreams the bars compress and the labels crowd. Group lanes (collapse 'SDK' subdomains into 'SDK') or split into two slides.
- **No spans at all.** A gantt mixes bars with the odd milestone — but if every task is a point-in-time event with no durations, use `timeline` or `roadmap milestones`. gantt earns its chrome only when bars carry meaningful length.

## Authoring

```markdown
<!-- _class: gantt -->

`2026 Q1 .. 2026 Q4` `today Q3`

## What ships in each phase, by workstream.

- First workstream
  - First task `Q1..Q2` `done`
  - Second task `Q2..Q3` `live` `after: First task`
  - Milestone `Q4` `milestone` `after: Second task`
- Second workstream
  - First task `Q1..Q2` `done`
  - Second task `Q2..Q3`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Gantt chart heading.                   │
│                                         │
│  Task A         ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░    │
│  Task B         ▓▓▓▓▓▓▓▓░░░░░░░░░░░░    │
│  Task C         ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░    │
│  Task D         ▓▓▓▓▓▓░░░░░░░░░░░░░░    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — phased grid of deliverables across workstreams without continuous spans
- [`kanban`](../../chart/kanban/kanban.docs.md) — current state by stage rather than schedule by lane
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — sequential process with descriptive steps, no parallel lanes

## Demo deck

See [gantt.gallery.light.pdf](./gantt.gallery.light.pdf) for rendered examples of every variant.
