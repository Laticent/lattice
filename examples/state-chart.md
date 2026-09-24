---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · State chart"
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Feature deck`

# Native state machines in plain markdown.

Numbered list, inline-code transitions, palette-blind SVG. No Mermaid, no charting library, no layout engine.

---

<!-- _class: divider light -->

## What this deck shows.

A finite-state machine authored as an ordered list. Each top-level item is a state; the index becomes a stable ref. Nested bullets carry the outgoing transitions, each a single inline-code arrow like `submit => 2` or `revise => self`. Whitespace inside the inline code is insignificant. The browser measures the laid-out nodes and draws the SVG edges, so it sizes to any content. Two orthogonal modifier classes: direction — `lr` (left-to-right, Mermaid `direction LR`), `tb` (top-to-bottom), or neither, which lets the chart pick whichever direction and row count sets the type largest — and presentation — `inline` (transitions as chips, no SVG). They compose. `dark` composes on top.

---

<!-- _class: state-chart -->
<!-- _footer: "Default — laid out to fit the stage, with SVG edges" -->

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

---

<!-- _class: state-chart -->
<!-- _footer: "Minimal — three states, linear flow" -->

## Job runner.

1. Idle `start`
   - `start => 2`
2. Running
   - `done => 3`
   - `fail => 1`
3. Done `end`

---

<!-- _class: state-chart -->
<!-- _footer: "Self-loop + branching" -->

## Connection retry.

1. Connecting `start`
   - `retry => self`
   - `ok => 2`
   - `fail => 3`
2. Connected `live`
   - `disconnect => 1`
3. Failed `end`

---

<!-- _class: state-chart inline -->
<!-- _footer: "Inline — same source, transitions as chips" -->

## Inline rendering.

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

---

<!-- _class: state-chart lr -->
<!-- _footer: "lr — left-to-right (Mermaid direction LR)" -->

## Build pipeline.

1. Source `start`
   - `compile => 2`
2. Compiled
   - `test => 3`
3. Tested
   - `deploy => 4`
   - `fail => 1`
4. Deployed `end`

---

<!-- _class: divider light -->

## Why a native state chart.

Mermaid's `stateDiagram-v2` works, but theming it cleanly requires a CSS override cascade with `!important` (see `docs/theming.md`). The native chart uses palette tokens directly — `var(--cat-1-fill)`, `var(--diagram-stroke)`, `var(--diagram-line)`, `var(--cat-on-fill)` — and inherits dark / light, every theme, automatically. No mmdc subprocess, no opaque SVG class names, no version coupling. The trade-off: no hierarchical states, no parallel regions, no guards in v1. When you need those, `<!-- _class: diagram -->` is the Mermaid escape hatch.

---

<!-- _class: divider -->

`Lattice · State chart`

## Numbered authoring is the layout.
