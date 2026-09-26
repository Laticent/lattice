# flowchart

> A free-form flowchart: shapes, groups and lines, written as a list.

**Function** progression · **Form** canvas · **Substance** graph

**Drawn with** `hybrid` — Shapes, line labels, group titles and notes are authored as a list and emitted as an HTML measuring harness; the browser pass measures it in the deck's own fonts, lays the chart out with the shared elbow router and paints every mark into the `<svg>`. Once painted the harness leaves layout, so a drawn slide is SVG in practice; it is hybrid because the harness is what shows until the pass runs, or where it cannot.

**Tags** `org-chart` · `process` · `workflow` · `overview`

Use for a process or decision flow, an org chart, a data flow or a system map: any set of boxes where the lines between them are the point. Every list item is a shape; a sub-list of shapes makes its parent a group; an arrow in a row connects shapes by name. Nothing implies order, so the same grammar draws a tree, a pipeline or a few disconnected boxes.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading: name the takeaway, not the diagram. |
| `eyebrow` | `p > code` | no | Optional eyebrow naming the system or domain. |
| `shapes` | `ul > li` | yes | One item per shape, in any order. The shape's name is its displayed text; other rows refer to it by that name, ignoring case. A trailing inline-code span styles it: an outline (`:box` `:square` `:pill` `:diamond` `:circle` `:cylinder` `:io` `:doc`), a slot `:c1`…`:c8`, one channel `:fill-cN` / `:border-cN` / `:text-cN`, a status word (`done`, `fail`, …) or an id `#kyc` to refer to it by. |
| `groups` | `li > ul` | no | A sub-list of shapes makes its parent item a GROUP, drawn as a tinted background behind its members, like a Mermaid subgraph. `:cN` on a group tints it. Groups nest. A line can start or end at a group. |
| `connections` | `li` | no | An arrow in a row connects shapes: `A -> B`, `A => B` (the heavy main path), `A -- B` (no head), `A <-> B`, `A <- B`. A label sits inside the arrow: `-ships via->`. A row may start with the arrow (`- => B`), meaning "from the item this row sits under", or name its source (`- A => B`). `&` fans out: `A -> B & C`. A trailing span after the target styles the line: `:dashed` `:dotted` `:open` `:dot` `:cross` `:loose` `:cN`. |
| `notes` | `li > blockquote` | no | A `>` blockquote under a shape is a note pinned to it, drawn as a card on a dotted tether. |
| `key` | `p > code` | no | The chart derives its own key from what it uses. One bracketed span right below the list renames entries by the word you typed: `` `[{=>, Happy path}, {:dotted, Later}]` ``. It only renames; it never hides or adds an entry. |
| `caption` | `p > em` | no | An italic paragraph below becomes the chart caption. |

### Variant decision rule

- **default (no modifier).** Almost always. The chart lays itself out both ways and keeps whichever sets the type larger on the stage. A dense chart whose type nears the floor takes the universal `compact` modifier, which tightens the spacing.
- **`lr`.** The flow must read left to right whatever the stage shape (a pipeline, a data flow). On a portrait deck `lr` falls back to `tb`, because a row cannot fit a tall box.
- **`tb`.** The flow must read top to bottom (an org chart, a decision tree).

### Common mistakes

- **Nesting a shape under a connection row.** A sub-list makes its parent a GROUP, so it must sit under a shape's row, never under `- -> B`. Lint names it: flowchart-nested-under-connection.
- **Styling a shape from the line that points at it (`-> B `:diamond``).** A span after a connection's target styles the LINE. Give B its own row and put `:diamond` there.
- **Writing an arrow that is meant as text (`Input -> Output` as one name).** Escape it: `Input \-> Output`. A comparison like `2 => 3` is warned about for the same reason.

## When to use

- **The lines are the point.** A flowchart earns its space when the audience needs to see what connects to what: a decision flow, who reports to whom, where data goes. If the boxes are the point and the order is fixed, a step list or timeline reads faster.
- **Up to about a dozen shapes.** Starting budgets: a decision flow six steps deep with four branches; an org chart three levels deep and eight across; a data flow three groups and twelve shapes; a system map ten shapes. Past that the type shrinks toward the floor; split into an overview and detail slides.
- **Free-form, not a state machine.** For a machine with states and events, where the numbering is the reference, use `state-chart`. A flowchart implies no order and has no start or end markers.

## When NOT to use

- **A sequence dressed as a flowchart.** Five boxes in a line with arrows between them is a list with decoration. Use `list-steps` or `timeline-list`, which read faster and fit more words.
- **Timed interactions or schedules.** Messages between actors over time are a sequence diagram (`diagram` with Mermaid); work across dates is `gantt` or `roadmap`.
- **Color with no key.** Every slot and status the chart uses shows up in the derived key. Renaming entries is free; painting meaning the reader cannot decode is not.

## Authoring

```markdown
<!-- _class: flowchart -->

## The flow in one line.

- Start `:pill` => Check => Decide?
- Decide? `:diamond`
  - -yes-> Ship
  - -no-> Fix -> Check
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Diagram heading.                       │
│                                         │
│       ┌────┐    ┌────┐    ┌────┐        │
│       │ A  │ →  │ B  │ →  │ C  │        │
│       └────┘    └────┘    └────┘        │
│                                         │
│        (Mermaid rendered as SVG)        │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `lr` — Left-to-right

Pins the flow left to right.

```markdown
<!-- _class: flowchart lr -->

## Events land in the warehouse within a minute.

- Web events `:io` => Ingest queue => Stream processor => Warehouse
- Warehouse `:cylinder`
  - -> BI dashboards
  - -nightly-> ML training
- BI dashboards `:doc`
```

### `tb` — Top-to-bottom

Pins the flow top to bottom.

```markdown
<!-- _class: flowchart tb -->

## The operating model has three lines of reporting.

- Chief executive `:c1`
  - -- Finance & Technology & Operations
- Finance
  - -- Controller & Planning
- Technology
  - -- Platform & Security
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`state-chart`](../../chart/state-chart/state-chart.docs.md) — a finite-state machine: numbered states, events between them, a start and an end
- [`diagram`](../../diagram/diagram/diagram.docs.md) — you need Mermaid's full grammar: sequence, class or entity diagrams, or a flowchart with subgraph directions and styles this grammar does not cover
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — a linear procedure with no branching and no lines worth drawing
- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — parallel workstreams across phases, where time is the axis

## Demo deck

See [flowchart.gallery.light.pdf](./flowchart.gallery.light.pdf) for rendered examples of every variant.
