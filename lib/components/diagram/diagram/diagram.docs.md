# diagram

> Mermaid diagram as the slide's centerpiece.

**Function** evidence · **Form** canvas · **Substance** graph

**Drawn with** `svg` — The mermaid plugin draws the fenced block to `<svg>` downstream — its bake (a headless render worker) on the CLI, mermaid.js in a live preview — so the engine emits a code fence and the exported artifact carries a real drawing. Node labels ride inside `<foreignObject>`, so they wrap like HTML text and export with the figure. Deck `motion: on` animates the diagram like a chart: containers, then boxes, then the arrows between them, then the words (twelve families; `engineering/mermaid.md` § Motion).

**Tags** `flowchart` · `org-chart` · `sequence` · `process`

Use for relational or topological visuals — flowcharts, sequence diagrams, state machines, ER diagrams. The diagram should occupy at least half the slide.

## Agent contract

**By venue** no count budget. Mermaid scales the whole diagram to its box, so no node count marks where it stops fitting.

### Slots

| Slot | Write | Required | Description |
|---|---|---|---|
| `title` | a `## ` heading | yes | Slide heading framing what the diagram shows. |
| `subtitle` | a line of `inline code` | no | Optional eyebrow caption. |
| `mermaid` | a fenced code block tagged `mermaid` | yes | Fenced ```mermaid block, pre-rendered to SVG at build time. |

### Common mistakes

- **Eyebrow written as plain or bold text instead of inline code.** The `subtitle` slot (an eyebrow caption despite its name) matches a `p > code` paragraph — wrap it in backticks; plain or bold text doesn't map to the slot and just renders as an unstyled stray line.

## When to use

- **Relational structure is the message.** Flowcharts, sequence diagrams, state machines, ER diagrams, journey maps. The relationships between nodes carry meaning the audience needs to see at a glance.
- **Diagram occupies at least half the canvas.** If the heading and prose dominate and the diagram is a sidebar, it is a content slide that happens to have a diagram. Reach for diagram when the graph IS the slide.
- **Palette tokens render automatically.** Mermaid blocks are pre-rendered to SVG with palette tokens injected via `%%{init}%%`. Don't hand-set colors — the diagram inherits the active theme so dark / accent variants work without re-authoring.

## When NOT to use

- **Tabular data on axes.** Quantitative datapoints across two axes are not flowchart material. Use quadrant, radar, progress, piechart, or timeline-list — the series-substance components are designed for plotted data.
- **Twenty-node spaghetti.** Past a dozen nodes the diagram stops being scannable. Split into two slides, hide leaf nodes behind a summary node, or move to a multi-page diagram-doc reference.
- **Inline color overrides.** Hand-set node colors break the theme contract. Let palette tokens drive everything; if you need to highlight one node, use mermaid's `class` mechanism so the highlight survives theme remapping.

## Authoring

```markdown
<!-- _class: diagram -->

## How signals move from input to decision.

```mermaid
flowchart LR
  A[Input] --> B[Process]
  B --> C{Decision}
  C -->|yes| D[Path A]
  C -->|no| E[Path B]
```
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

## Universal modifiers

Universal modifiers (`dark`, `compact`, `accent`, state markers, treatments) compose onto this component's class. Every one, by group, is in [the base modifier reference](../../../base/base.modifiers.docs.md), generated from `lib/base/base.manifest.json`.

## Related components

- [`code`](../../code/code/code.docs.md) — the implementation, not the topology, is the argument
- [`quadrant`](../../../plugins/chart-family/kinds/quadrant/quadrant.docs.md) — items positioned by two numeric attributes
- [`radar`](../../../plugins/chart-family/kinds/radar/radar.docs.md) — options rated across several criteria
- [`timeline-list`](../../../plugins/chart-family/kinds/timeline-list/timeline-list.docs.md) — the graph is a sequence in time, not a topology
- [`content`](../../statement/content/content.docs.md) — the diagram is one element in a prose slide

## Demo deck

See [diagram.gallery.light.pdf](./diagram.gallery.light.pdf) for rendered examples of every variant.
