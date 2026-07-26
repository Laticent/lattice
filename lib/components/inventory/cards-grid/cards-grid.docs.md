# cards-grid

> 2–4 parallel items, similar weight, scannable in a grid.

**Function** inventory · **Form** grid · **Substance** structure

**Tags** `overview` · `showcase` · `summary`

Use when the audience needs to compare or scan a small set of options at a glance. Avoid for more than 4 items — split into multiple slides. For ordered/numbered steps, use list-steps instead.

## Agent contract

**Capacity** ~3 items (crowds past 4, overflows past 4) — past that, list-tabular / split across slides.

**Density** aim ~15 words per item; past ~24 it reads as a wall of text — a card body is one short clause, not a paragraph.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `cards` | `ul > li` | yes | Each list item becomes one card. Authoring contract: a top-level bullet is the card title (renders bold by default); an indented bullet underneath carries the body text (renders normal weight via the nested-list rule). |
| `insight` | `blockquote` | no | Optional key-insight panel above the cards. |

## When to use

- **Parallel items.** Four cards or fewer, each item gets equal weight in the layout. Audience compares them at a glance.
- **Scannable at a glance.** The audience absorbs the whole set in one look — no scrolling, no eye-leaping between rows.
- **Equal information density.** Each card carries roughly the same text length. Uneven density makes the grid feel unbalanced.
- **Order is decorative.** When sequence carries meaning, use list-steps or list-criteria instead. cards-grid is for parallel options.

## When NOT to use

- **More than 4 items.** Split into multiple slides instead. The grid loses scannability past 4 cards.
- **Order carries meaning.** Use list-steps or list-criteria. cards-grid is for parallel options, not sequences.
- **Lopsided density.** Equalize the prose when one card has three sentences and the rest have one. Otherwise change layout.
- **Inline-code-only body.** A body bullet containing only `code` gets promoted to an eyebrow label. Mix it with surrounding prose.

## Authoring

```markdown
<!-- _class: cards-grid -->

## Slide heading.

- First card title
  - Body text for the first card, one sentence.
- Second card title
  - Body text for the second card, one sentence.
- Third card title
  - Body text for the third card, one sentence.
- Fourth card title
  - Body text for the fourth card, one sentence.
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

### `four` — Four columns

Four columns; pair with compact.

```markdown
<!-- _class: cards-grid four compact -->

## four locks a two-by-two, compact tightens it.

- Quadrant read.
  - Four cells scan as a loop.
- Compact pairing.
  - Padding shrinks so labels stay whole.
- Named corners.
  - Position carries meaning; place cards deliberately.
- Still four.
  - The ceiling does not move.
```

### `three` — Three columns

Three equal columns.

```markdown
<!-- _class: cards-grid three -->

## three widens the grid to three columns.

- Wider cards.
  - Each card earns a third of the row.
- Same budget.
  - Bodies stay one clause, titles stay parallel.
- Sweet spot.
  - Three peers is the count this grid loves.
```

### `numbered` — Numbered cards

Ordered source stamps corner tags.

```markdown
<!-- _class: cards-grid -->

## An ordered list numbers the cards.

1. Numbers appear
   - Markdown's ordered list turns cards into steps.
2. Sequence reads
   - The grid now implies order, so mean it.
3. Budget holds
   - Same one-clause bodies as the unnumbered grid.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — items carry an explicit sequence
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — items stack vertically as full-width rows
- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — two-option comparison, side by side
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — comparing options against shared criteria

## Demo deck

See [cards-grid.gallery.light.pdf](./cards-grid.gallery.light.pdf) for rendered examples of every variant.
