# inventory

> A parallel set of related items of similar weight — one content shape, four interchangeable looks.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `overview` · `summary` · `showcase`

Use for a small register of related items where each carries similar weight. Author the content once (a bold lead + detail per item, optional trailing insight) and pick the look with a variant: the default numbered ledger, a cards grid, a horizontal timeline, or a magazine-style editorial split — no re-authoring. For more than six items, escalate to list-tabular or split across slides.

## Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, list-tabular / split across slides.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one clause of body per part.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-child > code` | no | Optional kicker above the title (lifts into the masthead band under Form). |
| `title` | `h2` | yes | Slide heading. |
| `items` | `ul > li` | yes | Each list item is one entry, authored as `- **Lead.** detail sentence.` — the bold lead is the entry name, the rest is its description. |
| `insight` | `blockquote` | no | Optional trailing insight or takeaway. Renders as an accent band (ledger), a centered pull-quote (cards), a kicker above the run (timeline), or an accent-ruled sidebar (editorial). |

## When to use

- **A parallel register.** Two to six related items of similar weight — a framework's parts, a set of principles, the moving pieces of a system.
- **One content, your choice of look.** Write the items once; switch the variant to re-render the same content as a ledger, cards, timeline, or editorial split — no re-authoring.
- **A bold lead per item.** Each entry reads as a short bold name followed by a one-sentence detail. Equal density across entries keeps every look balanced.
- **An optional closing insight.** A trailing blockquote becomes the look's accent — a band, a pull-quote, a kicker, or a sidebar.

## When NOT to use

- **More than six items.** The looks lose scannability past six entries (the cards/timeline looks past four). Escalate to list-tabular or split across slides.
- **Ordered steps.** If sequence carries meaning, use list-steps or list-criteria. inventory entries are parallel, of similar weight.
- **Nested-bullet authoring.** inventory takes an inline bold lead (`- **Lead.** detail`), not the nested `- Title` / `  - body` shape that card-style components use.
- **Lopsided density.** Equalize the prose when one entry has three sentences and the rest have one — uneven density unbalances every look.

## Authoring

```markdown
<!-- _class: inventory -->

`Eyebrow`

## Slide heading.

- **First entry.** One-sentence description.
- **Second entry.** One-sentence description.
- **Third entry.** One-sentence description.
- **Fourth entry.** One-sentence description.

> Optional trailing insight.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                  LABEL                  │
│               Grid Title                │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Card Title 1 │     │ Card Title 2 │  │
│  │ content      │     │ content      │  │
│  └──────────────┘     └──────────────┘  │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Card Title 3 │     │ Card Title 4 │  │
│  │ content      │     │ content      │  │
│  └──────────────┘     └──────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `cards` — Cards

The register as tiles with a pull-quote.

```markdown
<!-- _class: inventory cards -->

`inventory cards`

## cards deals the parts into tiles.

- **One part per row.** A name and one clause of body.
- **Four parts reads best.** Five fits; six is the hard stop.
- **Bodies stay clauses.** Fourteen words soft, twenty-two hard.
- **Looks reskin the list.** cards, timeline, editorial change form, not content.
```

### `timeline` — Timeline

A numbered run along a line.

```markdown
<!-- _class: inventory timeline -->

`inventory timeline`

## timeline strings the parts along a line.

- **One part per row.** A name and one clause of body.
- **Four parts reads best.** Five fits; six is the hard stop.
- **Bodies stay clauses.** Fourteen words soft, twenty-two hard.
- **Looks reskin the list.** cards, timeline, editorial change form, not content.
```

### `editorial` — Editorial

A magazine split with a sidebar takeaway.

```markdown
<!-- _class: inventory editorial -->

`inventory editorial`

## editorial sets the parts as a column.

- **One part per row.** A name and one clause of body.
- **Four parts reads best.** Five fits; six is the hard stop.
- **Bodies stay clauses.** Fourteen words soft, twenty-two hard.
- **Looks reskin the list.** Same content, magazine form.

> The sidebar carries the register's one takeaway.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`cards-grid`](../../inventory/cards-grid/cards-grid.docs.md) — you want a fixed cards grid with nested-bullet authoring
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — the items carry an explicit sequence
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — more than six rows, or a meta column per row
- [`timeline-list`](../../chart/timeline-list/timeline-list.docs.md) — a vertical dated timeline rather than a parallel register

## Demo deck

See [inventory.gallery.light.pdf](./inventory.gallery.light.pdf) for rendered examples of every variant.
