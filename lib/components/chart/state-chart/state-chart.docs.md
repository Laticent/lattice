# state-chart

> Native state machine diagram — states as a numbered list, transitions as nested inline-code refs.

**Function** progression · **Form** timeline · **Substance** graph

**Drawn with** `hybrid` — States are authored as an HTML `<ol>`; the browser pass measures those boxes and paints the nodes, edges and edge labels into the `<svg>` overlay, hiding the list. Edge routing depends on each state's measured box, so the HTML has to exist first — and the legend and the chip variant stay HTML.

**Tags** `flowchart` · `states` · `workflow`

Use to show a finite-state machine — the discrete states a system can be in and the events that move between them. Authors write a numbered list; each state's index becomes its stable ref so transitions cite numbers, not names. The numbering is the layout: state i renders at row i, so there is no auto-layout problem to solve.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the state machine. |
| `eyebrow` | `p > code` | no | Optional eyebrow naming the machine or domain. |
| `states` | `ol > li` | yes | One li per state. Index is the stable ref. Trailing inline code is a closed metadata vocabulary: `start`, `end`, or one of the chart-status keywords (on-track, at-risk, blocked, done, live, decision, deferred, warn, pilot, fail). Multiple metadata tokens allowed; order is irrelevant. Unknown trailing codes are left in the rendered label. |
| `transitions` | `ol > li > ul > li` | no | Outgoing transitions from a state — one per nested bullet. Each carries a single inline-code arrow `event=>N` or `=>N` (event optional). Target is a state index or the literal `self` for self-loops. Whitespace inside the inline code is insignificant. |
| `detail` | `ol > li > ul > li (prose, no arrow)` | no | Optional per-state reveal detail (the shared chart-family detail substrate). A nested bullet under a state that is NOT an inline-code transition (plain prose — the entry/exit action, the rule, the why) is captured as that state's detail rather than a transition. It drives two surfaces from one source: (1) Present/Practice/Preview — the state node is tagged `data-mark` and the prose rides an inert `<template class="chart-detail">` the reveal layer shows in a popover on hover/tap, with the active node lifted, the rest dimmed, and the whole figure tilting (the edge-router skips re-measuring while the tilt is live, so the routed edges stay aligned); (2) the static PDF — the same detail folds into the slide's speaker note (`Label (status): item · item`) as a Marp-faithful comment. Renders nothing on the slide face, so a machine with no prose bullets is byte-identical. Must be a bullet (`-`/`*`), not numbered. |

### Variant decision rule

- **default (no modifier).** The default top-to-bottom vertical stack — the plainest read, no extra framing needed.
- **`lr`.** The states read more naturally as a left-to-right flow (e.g. a pipeline direction) than top-to-bottom.
- **`inline`.** The chart needs to sit directly beside its explanatory prose rather than take the full canvas.
- **`curved`.** Eased, curved connectors fit the deck's visual tone better than straight arrows.

### Common mistakes

- **Writing a transition's event/target as plain text instead of a single inline-code arrow.** The transition/detail distinction is purely mechanical — a nested bullet whose SOLE content is one inline-code token matching `event => N` or `=> N` (N a digit or `self`) is a transition; anything else — plain text, or an inline-code token with a non-numeric target like `` `approve => Approved` `` — is captured as detail prose instead. A transition written as plain text (or with a named target) is silently treated as detail, not as an edge, and no arrow renders.
- **Using a state's NAME instead of its numeric index as a transition target (`` `approve => Approved` `` instead of `` `approve => 4` ``).** Transitions target the state's INDEX — its position in the numbered list, which is the stable ref — not its name; a name in the target position won't resolve to any state.

## When to use

- **Finite, named states with discrete events.** When the slide is about a system with a small set of named places it can be in (Draft / Submitted / Approved / Archived) and the events that move between them (submit, approve, reject). The numbered authoring forces you to enumerate every state up front; the inline refs force you to be explicit about every transition.
- **Sequential authoring as a forcing function.** Numbering the states makes the author commit to an order. Reading the list top-to-bottom is reading the machine from start to terminal. This is the same forcing function that `list-steps` and `agenda` apply — a sequence the reader can scan in one pass.
- **Native theming without Mermaid overhead.** Mermaid's `stateDiagram-v2` works but requires a CSS override cascade with `!important` to theme cleanly (see `docs/theming.md`). A native state chart uses palette tokens directly — no overrides, no mmdc subprocess, no version-coupled SVG class names.

## When NOT to use

- **More than ~8 states.** Vertical stacks of ten or more states stop reading as a machine and start reading as a list. If the system has many states, group them into phases and show one phase at a time, or step back to a higher-level abstraction. The chart's job is to make the topology obvious in one glance.
- **Hierarchical or parallel states.** v1 grammar is one flat list of states with one outgoing arrow per nested bullet. Composite states, orthogonal regions, history nodes — anything Mermaid's `stateDiagram-v2` does and this layout doesn't — belong in a Mermaid fence via the `diagram` component.
- **Continuous processes.** If the diagram is really a workflow with stages that overlap or block (queue depth, throughput, capacity), a `gantt` or `kanban` chart reads better. State charts are for discrete, mutually-exclusive states the system flips between.

## Authoring

```markdown
<!-- _class: state-chart -->

`Submission lifecycle`

## Document approval flow.

How a draft moves from author to archive.

1. Draft `start`
   - `submit => 2`
   - `discard => 6`
2. Submitted `on-track`
   - `review => 3`
3. In Review
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
4. Approved `done`
   - `publish => 5`
5. Published `live`
   - `archive => 6`
6. Archived `end`

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

1. Source `start`
   - `compile => 2`
2. Compiled
   - `test => 3`
3. Tested
   - `deploy => 4`
   - `fail => 1`
4. Deployed `end`
```

### `inline` — Inline

The chart sits beside its prose.

```markdown
<!-- _class: state-chart inline -->

## inline sets the chart beside its prose.

1. Connecting `start`
   - `retry => self`
   - `ok => 2`
   - `fail => 3`
2. Connected `live`
   - `disconnect => 1`
3. Failed `end`
```

### `curved` — Curved

Eased arrows between states.

```markdown
<!-- _class: state-chart curved -->

## curved eases the arrows between states.

1. Draft `start`
   - `submit => 2`
   - `discard => 5`
2. In Review `at-risk`
   - `approve => 3`
   - `revise => self`
   - `reject => 1`
3. Approved
   - `publish => 4`
4. Published `live`
   - `archive => 5`
5. Archived `end`
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
