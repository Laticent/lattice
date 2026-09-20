# gantt

> Gantt chart — task bars across a date axis.

**Function** progression · **Form** timeline · **Substance** series

**Drawn with** `svg` — Bars, milestones, the date axis and every caption are one `<svg>`. A bar's start and length are positions on a shared time axis, so axis and bars must be solved together; CSS boxes would re-derive the same scale per row and drift.

**Tags** `swimlane` · `planning` · `milestones` · `agile`

Use for project plans with overlapping or staggered tasks. Each task is a bar on the time axis; bars can span multiple periods and carry status tints.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the plan. |
| `tasks` | `ul > li` | yes | Outer `li` per workstream LANE; nested bullets per TASK. A task is its name followed by trailing inline-code tokens, in any order. **Span or point:** `Q1..Q3` draws a bar (inclusive — `Q1..Q2` covers both quarters); a single point like `Q4` draws a milestone diamond. `..` is the ONLY span delimiter — a hyphen or en-dash is not recognized. **Time vocabulary:** ISO dates (`2026-03-15`), quarters (`Q1`, or year-qualified `2026 Q1`), or months (`Jan`, `2026 Jan`). One chart uses dates OR ordinals, never both. **Status (optional):** one of on-track / done / live / at-risk / warn / blocked / fail / deferred / pilot / decision. It tints the bar and adds a chip to the key that appears under the chart; a task with no status is a neutral bar and adds no chip. **`after: Task name` (optional):** a dependency, validated but never drawn — it must name another task's exact label (case-insensitive) AND that task must itself carry a parseable span. **`milestone` (optional):** forces the diamond when the point would otherwise read as a span. **The eyebrow** — a paragraph of inline-code pills above the H2 — may carry a `START..END` window that overrides the derived axis, and a `today <point>` marker that draws the now rule. Both optional; the axis derives from the data without them. Every token is checked by `lint:deck`: retired delimiter, malformed span, unknown status, dangling or inverted `after:`. |
| `detail` | `ul > li > ul > li > ul > li` | no | Optional per-task reveal detail. A nested bullet under a TASK (one level deeper than the task) — plain prose: the owner, the blocker, the why — is captured as that task's detail rather than rendered on the bar. It drives two surfaces from one source: (1) on screen (Drawing Board present/practice/preview) the bar/milestone is tagged data-mark and the prose rides an inert `<template class="chart-detail">` the reveal layer shows in a popover on hover/tap, with the active bar lifted + glowing and the rest dimmed (gantt is reveal-only — no 3D tilt, which would skew the time axis); (2) the static PDF — the same detail folds into the slide's speaker note (`Task (span): item · item`) as a Marp-faithful comment. Renders nothing on the chart face, so a chart with no detail bullets is byte-identical. Must be a bullet, not a trailing inline-code token. |

### Common mistakes

- **Writing the detail prose as a trailing inline-code token instead of a nested bullet.** Detail must be a nested bullet ONE level deeper than the task, not a trailing `` `code` `` token — only a nested bullet drives the reveal popover and the speaker note; a trailing-token 'detail' is not recognized at all.
- **Joining two dates with a hyphen or en-dash — `Q1-Q2`, `2026-01-01 – 2026-04-01`.** `..` is the only span delimiter. A hyphen is not read as a span, so the task falls back to a full-width muted placeholder and `lint:deck` flags the retired delimiter.
- **Mixing date spans and quarter/month spans in one chart.** A chart resolves to ONE scale — epoch-days for dates, month-index for ordinals. Pick one vocabulary for every task in the chart; convert the odd one out rather than mixing.
- **Pointing `after:` at a task that carries only a status and no span.** A task with no parseable span is never indexed, so `after:` naming it is flagged dangling even though its label is visibly on the slide. Give the referenced task a span, or drop the dependency.
- **Expecting a status alone to place a task on the axis.** Status is a tint, not a position. A task with `done` and no span renders as a full-width muted placeholder — the shape that says 'this task has no schedule' — rather than being dropped silently.
- **Adding lanes and tasks until the chart no longer fits, expecting it to scale down.** It does not scale down: bars and captions are a fixed size, so the chart grows taller and past the budget it overflows and the render reports CONTENT CLIPPED, naming the first thing cut. About five bar ROWS fit a standard slide, and overlapping tasks stack into extra rows — split the plan across two slides.
- **Writing `today Q3` in the eyebrow and expecting the marker without a window.** The `today` pill works with or without a window pill, but the point has to fall INSIDE the axis the chart resolves to. A `today` outside the derived or declared range draws nothing.

### Data shape

- A chart uses dates OR ordinals (quarters/months) consistently — never mix `2026-03-15` spans with `Q1`/`Jan` spans in the same chart.
- `..` is the only span delimiter — a hyphen or en-dash between two dates isn't recognized as a span.
- `after: Task name` must reference another task's exact (case-insensitive) label AND that task must itself carry a parseable time span — a task with only status pills and no `START..END`/point is never indexed, so `after:` pointing at it is flagged dangling even though the label is on the slide and visibly rendered. Source order doesn't matter otherwise: a forward reference to a spanned task defined later is fine.
- A lane is as many SUB-ROWS as its tasks need, not one row of bars. Tasks whose spans OVERLAP get their own sub-row — `Q1..Q2` and `Q2..Q3` both cover Q2, so they stack rather than one hiding under the other. Tasks that clear each other still share a sub-row, so a sequential lane (`Q1..Q1`, `Q2..Q2`, `Q3..Q3`) stays one row tall however long its task NAMES are — packing reads the bars, never the captions.
- Rows fill in SOURCE ORDER, first fit — task 1 takes the first row, and a later task joins the first row whose last mark clears it. Your bullet order is the reading order down the lane, so order tasks the way you want them read.
- A milestone is a task like any other: a diamond falling inside a bar's span packs onto its own sub-row rather than being drawn on top of the bar. The lane NAME sits on the lane's first row, as the heading for the rows beneath it.
- The chart NEVER shrinks to fit, and it has a BUDGET instead. Bars, captions and row spacing are a fixed size whatever the plan carries; more rows make the chart taller, not smaller. Measured on a 1152x335 chart body (a heading plus a two-line lede): four one-row lanes fit and five overflow; with no lede the stage holds five. The real ceiling is about five BAR ROWS, and a lane is only one row while its tasks do not overlap — two tasks sharing a quarter stack into two rows, so three lanes of concurrent work can cost as much height as five sequential ones. Past that the chart overflows its slide and the render reports CONTENT CLIPPED, naming the first thing cut. Split the plan across two slides rather than expecting it to compress.

## When to use

- **Overlapping work across lanes.** When tasks run in parallel across multiple workstreams and the audience needs to see who is busy when. Overlapping tasks stack into sub-rows, so concurrency is visible as height rather than hidden behind whichever bar was drawn last.
- **Span is the story.** Each bar's length encodes its duration. Use gantt when start dates, end dates, and overlap are what you want the audience to remember.
- **Status pills add a second channel.** Tint bars with `done` / `live` / `at-risk` / `blocked` to layer health onto schedule. The plan reads as both 'when' and 'how it's going' in one chart. Since the bars carry no status text, a swatch+label status key is emitted automatically below the chart for the statuses present.

## When NOT to use

- **Single workstream.** One lane of bars is a timeline, not a gantt. Use `timeline` or `list-steps` when there is no parallel work to coordinate.
- **More than four or five lanes.** The chart does not shrink to absorb them — the bars keep their size and the chart grows taller, so past the capacity budget it overflows the slide and the render says so. Group lanes (collapse 'SDK' subdomains into 'SDK') or split into two slides. Overlapping tasks cost extra rows, so three lanes of concurrent work can reach the limit before five sequential ones do.
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
