# state-chart

> Native state machine diagram — states as a list, transitions as arrows to a state's name, on the flowchart's grammar.

**Function** progression · **Form** timeline · **Substance** graph

**Drawn with** `hybrid` — States are authored as a list and emitted as an HTML measuring harness (every state a tile with its badge, every transition label and composite title a box); the browser pass measures it in the deck's own fonts, lays the machine out with Trama, the graph-chart library the flowchart shares, and paints every mark into the `<svg>`. LAYOUT IS CHOSEN BY FIT: Trama scores its candidates against the real stage and keeps the one that sets the type largest. A CHAIN is laid out on a reading-order grid, one row or several that all run the same way, and needs no layout engine at all; a machine that branches, or has a composite state, is laid out by dagre unless a wrapped grid beats it by a clear margin. With no direction modifier both directions compete; `lr` or `tb` pins it. Lines are the router's elbows, which never cross a state; their labels sit on the line. Once painted the harness leaves layout, so a default slide is SVG in practice; the `inline` variant's rows stay HTML.

**Tags** `flowchart` · `states` · `workflow`

Use to show a finite-state machine — the discrete states a system can be in and the events that move between them. Authors write a list of states; a sub-item that starts with an arrow is a transition to a state named by its text (`- -approve-> Approved`). Each state wears a badge with its place in the list, which is the machine's READING ORDER: a chain reads 1, 2, 3 along its row and wraps onto the next row when one row would shrink the type. A machine that branches is laid out by dagre, because no single line can show a fan-out.

## Agent contract

**By venue** no count budget. A chart scales its marks to the box instead of clipping, so no count marks where it stops fitting.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the state machine. |
| `eyebrow` | `p > code` | no | Optional eyebrow naming the machine or domain. |
| `states` | `ul > li` | yes | One list item per state, named by its text (matched case-insensitively; a `#id` at the lead of its span names it for long text or twins). Numbered and bulleted lists mean the same thing; the badge shows the state's place in the list. A trailing code span styles the state: `start` or `end` (the machine's entry and end), a status word (on-track, done, live, at-risk, warn, blocked, fail, pilot, decision, deferred), a palette slot `c1`…`c8`, one channel `fill=cN` `border=cN` `text=cN`, or a shape word such as `diamond`; several go in one record, in any order: `\{#id, diamond, c2}`. A status PAINTS the state — its tinted fill, edge and leading accent, as on a gantt bar — and wins over a slot on the same state, as on the flowchart; a state with neither is a neutral tile. With no `start`, the first state is the start; with no `end`, every state with no way out is an end. |
| `transitions` | `ul > li > ul > li (starts with an arrow)` | no | A sub-item that starts with an arrow is a transition from its state: `- -submit-> Submitted` (the event label sits inside the arrow), `- -> Done` (no label), `- =ship=> Shipped` (heavy: the main path). A state's own name as the target is a self-loop. The flowchart's arrows and line words apply: `<-`, `<->`, `--`, a trailing `dashed` `dotted` `open` `dot` `cross` `cN` span, several in one record (`\{dashed, cross}`). The label sits ON its line, which is cut under it. |
| `composites` | `ul > li > ul > li (starts with a name)` | no | A sub-item that starts with a NAME is a member state, which makes its parent a composite state (a group), drawn as a box around its members. Groups nest; a transition may leave or enter a group. |
| `detail` | `ul > li > blockquote` | no | A `>` blockquote under a state is its HIDDEN DETAIL: the slide never shows it. It appears when the state is hovered or tapped in Present, Practice and Preview (the chart family's detail substrate: the tile carries `data-mark`, the text rides an inert `<template class="chart-detail">`), and it is folded into the slide's speaker note. A PDF does not show it: text the page must carry belongs in a caption. |
| `key` | `p > code ([…] after the list)` | no | The key is derived from what the chart uses (statuses, heavy and patterned lines, slots on composites); one bracketed span after the list renames entries, `[{=>, Happy path}]`, as on the flowchart. Words that paint the same tone share one entry. |

### Variant decision rule

- **default (no modifier).** Almost always. The chart picks its direction and how many lines it runs on by whichever sets the type largest in the stage, so a long chain wraps onto a second line in reading order instead of shrinking.
- **`lr`.** The flow must read left to right whatever the stage shape (a pipeline, a funnel of stages). The chart may still wrap onto more rows.
- **`tb`.** The flow must read top to bottom whatever the stage shape (a ladder, an escalation). The chart may still wrap into more columns.
- **`inline`.** The chart needs to sit directly beside its explanatory prose rather than take the full canvas.
- **`curved`.** Softer, generously rounded corners fit the deck's visual tone better than tight elbows. The lines are still the router's: they never cross a state.
- **`unnumbered`.** The list order means nothing to the audience, and the badges would suggest a sequence that is not there.
- **`rearrange`.** The chart wraps and its lines cross, and where each state sits matters more than the order you wrote them in: a side state written last (Blocked, Escalated) moves beside the state it leaves. The chart moves a state only when that draws a cleaner chart (fewer crossings, or a line no longer through a state), so with nothing to fix it draws as before. The badges still show each state's place in your list.

### Common mistakes

- **Targeting a state by its number (`- -approve-> 4`) the way v1 did.** A transition names its target state by its text: `- -approve-> Approved`. A number is read as a new state named "4", and `lint:deck` warns when a new name looks like an existing one.
- **Writing a note as a sub-bullet under a state.** A sub-item that starts with a name is a MEMBER state and makes its parent a composite. A note is a `>` blockquote under the state, which is hidden detail shown on hover and in the speaker notes.

## When to use

- **Finite, named states with discrete events.** When the slide is about a system with a small set of named places it can be in (Draft / Submitted / Approved / Archived) and the events that move between them (submit, approve, reject). Listing the states forces you to enumerate every one up front; the arrows force you to be explicit about every transition.
- **Sequential authoring as a forcing function.** The list order is the reading order the badges show: reading the list top to bottom is reading the machine from start to end, the forcing function `list-steps` and `agenda` apply.
- **Native theming without Mermaid overhead.** Mermaid's `stateDiagram-v2` works but requires a CSS override cascade with `!important` to theme cleanly (see `docs/theming.md`). A native state chart uses palette tokens directly — no overrides, no mmdc subprocess, no version-coupled SVG class names.

## When NOT to use

- **More than ~12 states.** A long chain wraps onto more lines rather than shrinking, so eight or ten states still read. Past about a dozen the machine stops reading as a machine and starts reading as a list, however it is laid out. Group the states into phases and show one phase at a time, or step back to a higher-level abstraction. The chart's job is to make the topology obvious in one glance.
- **Parallel regions, history or guards.** A composite state is a sub-list of states, but orthogonal regions, history states and guard conditions are not in this grammar. Those belong in a Mermaid fence via the `diagram` component.
- **Continuous processes.** If the diagram is really a workflow with stages that overlap or block (queue depth, throughput, capacity), a `gantt` or `kanban` chart reads better. State charts are for discrete, mutually-exclusive states the system flips between.

## Authoring

```markdown
<!-- _class: state-chart -->

`Submission lifecycle`

## Document approval flow.

How a draft moves from author to archive.

- Draft `start`
  - -submit-> Submitted
  - -discard-> Archived
- Submitted `on-track`
  - -review-> In Review
- In Review
  - -approve-> Approved
  - -reject-> Draft
  - -revise-> In Review
- Approved `done`
  - -publish-> Published
- Published `live`
  - -archive-> Archived
- Archived `end`

*Rejected drafts return to the author; revisions stay in review.*
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│          State machine heading          │
│                                         │
│     [Draft ] → [Review] → [Pub   ]      │
│                                         │
│       (back-edge: Review → Draft)       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `lr` — Left-to-right

States flow left to right.

```markdown
<!-- _class: state-chart lr -->

## lr flows the states left to right.

- Source `start`
  - -compile-> Compiled
- Compiled
  - -test-> Tested
- Tested
  - -deploy-> Deployed
  - -fail-> Source
- Deployed `end`
```

### `tb` — Top-to-bottom

States flow top to bottom, whatever the stage.

```markdown
<!-- _class: state-chart tb -->

## tb stacks the states top to bottom.

- Queued `start`
  - -claim-> Running
- Running `live`
  - -finish-> Complete
  - -crash-> Queued
- Complete `end`
```

### `inline` — Inline

The machine as rows with transition chips, beside its prose.

```markdown
<!-- _class: state-chart inline -->

## inline sets the chart beside its prose.

- Connecting `start`
  - -retry-> Connecting
  - -ok-> Connected
  - -fail-> Failed
- Connected `live`
  - -disconnect-> Connecting
- Failed `end`
```

### `curved` — Curved

Generously rounded corners on the router's lines.

```markdown
<!-- _class: state-chart curved -->

## curved rounds the lines between states.

- Draft `start`
  - -submit-> In Review
  - -discard-> Archived
- In Review `at-risk`
  - -approve-> Approved
  - -revise-> In Review
  - -reject-> Draft
- Approved
  - -publish-> Published
- Published `live`
  - -archive-> Archived
- Archived `end`
```

### `unnumbered` — Unnumbered

No badges: the states show no place in the list.

```markdown
<!-- _class: state-chart unnumbered -->

## unnumbered drops the badges.

- Open `start`
  - -assign-> Assigned
- Assigned `live`
  - -resolve-> Resolved
- Resolved `end`
```

### `rearrange` — Rearrange

States may leave their written order when that draws a cleaner chart.

```markdown
<!-- _class: state-chart rearrange -->

## rearrange lets a side state sit beside the state it leaves.

- Intake `start`
  - -triage-> Triage
- Triage
  - -start-> In Progress
- In Progress `live`
  - -review-> Code Review
  - -block-> Blocked
- Code Review
  - -approve-> QA
- QA `on-track`
  - -stage-> Staging
  - -fail-> In Progress
- Staging
  - -release-> Released
- Released `done`
  - -close-> Closed
- Blocked `blocked`
  - -unblock-> In Progress
- Closed `end`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`diagram`](../../diagram/diagram/diagram.docs.md) — the machine has hierarchical states, parallel regions, or guards that need Mermaid's full state-diagram grammar
- [`journey`](../../chart/journey/journey.docs.md) — the sequence is a user's path through tasks with mood / affect, not a system's discrete states
- [`timeline-list`](../../chart/timeline-list/timeline-list.docs.md) — events are points in time rather than transitions between named states
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — a linear procedure with no branching — state-chart is overkill if there are no choices to make
- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — parallel workstreams across phases, not a single machine's transitions

## Demo deck

See [state-chart.gallery.light.pdf](./state-chart.gallery.light.pdf) for rendered examples of every variant.
