# rows

> Two components stacked on one slide, one above the other.

**Function** layout · **Form** split · **Substance** mixed

**Tags** `overview` · `summary` · `dashboard` · `status`

Use when two wide components make one point together: progress over the table behind it, a line of context over a chart.

## Agent contract

**By venue** no count budget. A host holds two components, each with its own venue budget, so it has nothing of its own to count.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | The slide's title, above both panes. It makes the point; the panes support it. |
| `pane` | `lat-pane` | yes | Two panes, top then bottom. Each opens with `<!-- _pane: component -->` (optional; default `content`) and an optional `### title`, a short label naming what the pane holds. |

### Common mistakes

- **A `##` inside a pane.** A `##` starts a new slide. Use `###` for a pane's title and `####` for a heading inside a pane.
- **Naming a component in the layout's `_class` (`_class: columns bar`).** Each pane names its own component: `<!-- _pane: bar -->` above the pane's `###`.

## When to use

- **Two wide components.** A table, a timeline or a progress list reads across the slide. Stack two of them rather than squeezing each into half the width.
- **Context over evidence.** A short `content` pane on top says what happened; the chart or table below shows it. Give the evidence the larger share: `rows 35/65`.

## When NOT to use

- **Two unrelated points.** Two panes are one argument. If the halves say different things, make two slides.
- **A tall component.** A component that needs height (a `quote`, a `kpi` row, `radar`) does not read in a band; the engine re-orients or splits the slide, and `lint:deck` says so (`pane-arrange`).
- **Three or more things.** A pane layout holds two panes. Three parallel items are `cards-stack` or `list`.

## Authoring

```markdown
<!-- _class: rows -->

## The slide's point, in one line.

### Top pane

- A point
- Another point

### Bottom pane

- A point
- Another point
```

## Variants (component-specific)

### `no-rule` — no rule

Drops the rule between the panes.

```markdown
<!-- _class: rows 35/65 no-rule -->

## Three regions carried the quarter.

### What happened

Two renewals and a price rise lifted EMEA and APAC; North America held.

<!-- _pane: bar -->
### Revenue by region
`$M, Q3`

- North America `4.2`
- EMEA `3.1`
- APAC `1.8`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`columns`](../../layout/columns/columns.docs.md) — the two components read better side by side
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — three or more parallel items, stacked
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — one featured element beside supporting points

## Demo deck

See [rows.gallery.light.pdf](./rows.gallery.light.pdf) for rendered examples of every variant.
