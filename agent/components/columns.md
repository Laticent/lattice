# columns

> Two components side by side on one slide, at a ratio you choose.

**Function** layout · **Form** split · **Substance** mixed

**Tags** `contrast` · `transformation` · `overview` · `summary`

Use when two components make one point together: a chart and what it means, before and after, a list beside a table.

## Agent contract

**By venue** no count budget. A host holds two components, each with its own venue budget, so it has nothing of its own to count.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | The slide's title, above both panes. It makes the point; the panes support it. |
| `pane` | `lat-pane` | yes | Two panes. Each opens with `<!-- _pane: component -->` (optional; default `content`) and an optional `### title`, a short label naming what the pane holds. |

### Common mistakes

- **A `##` inside a pane.** A `##` starts a new slide. Use `###` for a pane's title and `####` for a heading inside a pane.
- **Naming a component in the layout's `_class` (`_class: columns bar`).** Each pane names its own component: `<!-- _pane: bar -->` above the pane's `###`.

## When to use

- **A chart and what it means.** Put the evidence in one pane and the reading of it in the other: a `bar` beside a `list`, a `table` beside a `content` pane. The slide's `##` states the conclusion both panes support.
- **Before and after.** Two `###` titles with no markers make two text panes: the quickest way to set two states side by side.
- **An unequal pair.** Give the pane that needs room the larger share: `columns ratio-60-40`, `columns ratio-35-65`. Shares run 25 to 75 in 5% steps.

## When NOT to use

- **Two unrelated points.** Two panes are one argument. If the halves say different things, make two slides.
- **A binary decision with a verdict.** Weighing two options and landing a recommendation is `split-compare`, whose verdict card this layout does not have.
- **Three or more things.** A pane layout holds two panes. Three parallel items are `cards-grid` or `compare-prose`.

## Authoring

```markdown
<!-- _class: columns -->

## The slide's point, in one line.

### First pane

- A point
- Another point

### Second pane

- A point
- Another point
```

## Variants (component-specific)

### `no-rule` — no rule

Drops the spine between the panes.

```markdown
<!-- _class: columns ratio-45-55 no-rule -->

`Support · after the migration`

## The migration halved support tickets.

### Before

- 1,240 tickets a month
- 31 hours to first reply

### After

- 610 tickets a month
- 6 hours to first reply
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`rows`](./rows.md) — the two components are wide and read better stacked
- [`split-panel`](./split-panel.md) — one featured element beside supporting points, not two components
- [`split-compare`](./split-compare.md) — two options and a recommendation
- [`compare-prose`](./compare-prose.md) — two or three co-equal options in prose

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/layout/columns>
