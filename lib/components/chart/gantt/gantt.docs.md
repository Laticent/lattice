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
| `tasks` | `ul > li` | yes | Outer `li` per workstream LANE; nested bullets per TASK. A task is its name followed by trailing inline-code tokens, in any order. **Span or point:** `Q1..Q3` draws a bar (inclusive — `Q1..Q2` covers both quarters); a single point like `Q4` draws a milestone diamond. `..` is the ONLY span delimiter — a hyphen or en-dash is not recognized. **Time vocabulary:** ISO dates (`2026-03-15`), quarters (`Q1`, or year-qualified `2026 Q1`), or months (`Jan`, `2026 Jan`). One chart uses dates OR ordinals, never both. **Status (optional):** one of on-track / done / live / at-risk / warn / blocked / fail / pilot / decision / deferred — and that is the order the key emits them in, not an alphabetical list. It tints the bar and adds a chip to the key that appears under the chart. A task with NO status is a neutral bar, and when the chart already draws a key it adds a `no status` chip so the reader can tell it from `deferred`, which takes the same neutral ramp and is drawn hollow with a DASHED edge. The key is one centered row that does not wrap, so the extra chip is DROPPED rather than pushed past the frame once the row is full. Where the row fills depends on the label lengths and the frame, so it is a width, not a count: taking the ten status words in the emitted order above, the neutral chip still fits alongside eight of them in landscape and five in portrait. The bars still differ; only the label goes. **`after: Task name` (optional):** a dependency, validated but never drawn — it must name another task's exact label (case-insensitive) AND that task must itself carry a parseable span. **`milestone` (optional):** forces the diamond when the point would otherwise read as a span. **The eyebrow** — a paragraph of inline-code pills above the H2 — may carry a `START..END` window that overrides the derived axis, and a `today <point>` marker that draws the now rule. Both optional; the axis derives from the data without them. Every token is checked by `lint:deck`: retired delimiter, malformed span, unknown status, dangling or inverted `after:`. |
| `detail` | `ul > li > ul > li > ul > li` | no | Optional per-task reveal detail. A nested bullet under a TASK (one level deeper than the task) — plain prose: the owner, the blocker, the why — is captured as that task's detail rather than rendered on the bar. It drives two surfaces from one source: (1) on screen (Drawing Board present/practice/preview) the bar/milestone is tagged data-mark and the prose rides an inert `<template class="chart-detail">` the reveal layer shows in a popover on hover/tap, with the active bar lifted + glowing and the rest dimmed (gantt is reveal-only — no 3D tilt, which would skew the time axis); (2) the static PDF — the same detail folds into the slide's speaker note (`Task (span): item · item`) as a Marp-faithful comment. Renders nothing on the chart face, so a chart with no detail bullets is byte-identical. Must be a bullet, not a trailing inline-code token. |

### Common mistakes

- **Writing the detail prose as a trailing inline-code token instead of a nested bullet.** Detail must be a nested bullet ONE level deeper than the task, not a trailing `` `code` `` token — only a nested bullet drives the reveal popover and the speaker note; a trailing-token 'detail' is not recognized at all.
- **Joining two dates with a hyphen or en-dash — `Q1-Q2`, `2026-01-01 – 2026-04-01`.** `..` is the only span delimiter. A hyphen is not read as a span, so the task falls back to a full-width muted placeholder and `lint:deck` flags the retired delimiter.
- **Mixing date spans and quarter/month spans in one chart.** A chart resolves to ONE scale — epoch-days for dates, month-index for ordinals. Pick one vocabulary for every task in the chart; convert the odd one out rather than mixing.
- **Pointing `after:` at a task that carries only a status and no span.** A task with no parseable span is never indexed, so `after:` naming it is flagged dangling even though its label is visibly on the slide. Give the referenced task a span, or drop the dependency.
- **Expecting a status alone to place a task on the axis.** Status is a tint, not a position. A task with `done` and no span renders as a full-width muted placeholder — the shape that says 'this task has no schedule' — rather than being dropped silently.
- **Adding lanes and tasks until the chart no longer fits, expecting it to scale down.** It does not scale down: bars and captions are a fixed size, so the chart grows taller and past the budget it overflows and the render reports CONTENT CLIPPED, naming the first thing cut. About five bar ROWS fit a standard slide, and overlapping tasks stack into extra rows — split the plan across two slides. **That report has a blind band and it is worth knowing:** both of its checks are read against a 12px noise budget, so a chart painting up to 12px outside its stage does not reach either of them (#2252 measured one at 10.2px). The export now prints an ADVISORY naming those slides and their overshoot — useful, but not a verdict, and it starts at 3px. `npm run check:chart-fit -- <deck>` is the gate that adjudicates the band: it measures the painted chart against the stage with 1.5px of slack rather than asking the export.
- **Writing `today Q3` in the eyebrow and expecting the marker without a window.** The `today` pill works with or without a window pill, but the point has to fall INSIDE the axis the chart resolves to. A `today` outside the derived or declared range draws nothing.
- **Reading a pale bar as 'deferred' without checking the key.** A `deferred` bar and a bar with no status share the neutral ramp. `deferred` is drawn hollow with a DASHED edge; an unstated bar is solid. When a chart carries both, the key names the second one `no status` — so the answer is on the slide rather than in the author's head.

### Data shape

- A chart uses dates OR ordinals (quarters/months) consistently — never mix `2026-03-15` spans with `Q1`/`Jan` spans in the same chart.
- `..` is the only span delimiter — a hyphen or en-dash between two dates isn't recognized as a span.
- `after: Task name` must reference another task's exact (case-insensitive) label AND that task must itself carry a parseable time span — a task with only status pills and no `START..END`/point is never indexed, so `after:` pointing at it is flagged dangling even though the label is on the slide and visibly rendered. Source order doesn't matter otherwise: a forward reference to a spanned task defined later is fine.
- A lane is as many SUB-ROWS as its tasks need, not one row of bars. Tasks whose spans OVERLAP get their own sub-row — `Q1..Q2` and `Q2..Q3` both cover Q2, so they stack rather than one hiding under the other. Tasks that clear each other still share a sub-row, so a sequential lane (`Q1..Q1`, `Q2..Q2`, `Q3..Q3`) stays one row tall however long its task NAMES are — packing reads the bars, never the captions.
- Rows fill in SOURCE ORDER, first fit — task 1 takes the first row, and a later task joins the first row whose last mark clears it. Your bullet order is the reading order down the lane, so order tasks the way you want them read.
- A milestone is a task like any other: a diamond falling inside a bar's span packs onto its own sub-row rather than being drawn on top of the bar. The lane NAME sits on the lane's first row, as the heading for the rows beneath it.
- The chart NEVER shrinks to fit, and it has a BUDGET instead. Bars, captions and row spacing are a fixed size whatever the plan carries; more rows make the chart taller, not smaller. **Count BAR ROWS, not lanes** — a lane is one row only while its tasks do not overlap, and inclusive spans overlap more than authors expect: `Q1..Q2` followed by `Q2..Q3` both cover Q2, so a sequential-looking plan written that way costs two rows per lane. Write `Q1..Q2` then `Q3..Q4` when the phases really are sequential. **And the status key costs about a whole extra lane** (21 viewBox units), which matters because nearly every real gantt carries one. Measured with a key on a 1152x335 chart body (a heading plus a two-line lede): four one-row lanes fit with ~16px to spare and five overflow; on a roomier stage — a one-line lede — five fit and six overflow. Past that the chart overflows and the render reports CONTENT CLIPPED, naming the first thing cut. **The report is not a zero-tolerance gate**: both of its checks carry a 12px noise budget, so a chart over its stage by less than that is cut without a word (#2252; the export now prints an advisory naming those slides, but it is an advisory, not a verdict). `npm run check:chart-fit -- <deck>` adjudicates that band — it compares the painted chart to the stage with 1.5px of slack. Split the plan across two slides rather than expecting it to compress.

## When to use

- **Overlapping work across lanes.** When tasks run in parallel across multiple workstreams and the audience needs to see who is busy when. Overlapping tasks stack into sub-rows, so concurrency is visible as height rather than hidden behind whichever bar was drawn last.
- **Span is the story.** Each bar's length encodes its duration. Use gantt when start dates, end dates, and overlap are what you want the audience to remember.
- **Status pills add a second channel.** Tint bars with `done` / `live` / `at-risk` / `blocked` to layer health onto schedule. The plan reads as both 'when' and 'how it's going' in one chart. Since the bars carry no status text, a swatch+label status key is emitted automatically below the chart for the statuses present — plus a `no status` chip when some task carries none, because `deferred` and an unstated task share the neutral ramp (dropped, with the bars still distinct, when the key is already full at nine statuses). `deferred` is told apart by DRAWING rather than by hue: a hollow body and a dashed edge, which survive a color-vision-deficiency palette, grayscale print and a photocopy, where a second shade of neutral does not.

## When NOT to use

- **Single workstream.** One lane of bars is a timeline, not a gantt. Use `timeline` or `list-steps` when there is no parallel work to coordinate.
- **More rows than the stage holds.** Count ROWS, not lanes: overlapping tasks stack, and inclusive spans overlap more than they look (`Q1..Q2` then `Q2..Q3` share Q2). With a status key, four one-row lanes fit an ordinary slide and five overflow. The chart does not shrink to absorb them — the bars keep their size, the chart grows taller, and past the budget it overflows and the render says so. Group lanes (collapse 'SDK' subdomains into 'SDK'), make genuinely sequential phases non-overlapping, or split into two slides.
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
