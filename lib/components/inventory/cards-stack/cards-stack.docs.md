# cards-stack

> Parallel items stacked vertically, full-width cards.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `overview` · `summary` · `reference`

Use when the items want vertical reading order — sequential exploration rather than a-glance comparison. 2–4 items work best (a fourth fits with the `compact` modifier).

## Agent contract

**Capacity** ~3 items (crowds past 4, overflows past 4) — past that, list-tabular / split across slides.

**Density** aim ~16 words per item; past ~26 it reads as a wall of text — a stacked card is a short paragraph at most.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `cards` | `ul > li` | yes | Each list item becomes one stacked card. Authoring contract: a top-level bullet is the card title (renders bold by default); an indented bullet underneath carries the body text. An optional trailing inline `code` on the title line renders as a right-anchored pill. |

### Variant decision rule

- **default (no modifier).** Vertical, top-to-bottom priority reading — the base look.
- **`horizontal`.** The sequence reads more naturally left-to-right, e.g. a timeline — pivots the stack onto its side.
- **`numbered`.** The vertical rank should be explicit rather than implied by position — author as an ordered list to stamp corner numbers.

### Common mistakes

- **Adding a `numbered` class to the slide, expecting it to turn on corner numbers.** There is no `numbered` CSS class — the ranking numbers come purely from authoring the cards as an ordered list (`1.`) instead of `-`.
- **Adding a fourth card without the `compact` modifier.** A fourth card at or near the density budget (16-26 words) needs `compact` to avoid overflowing the frame — the component's own stress sample demonstrates `cards-stack compact` at four full-budget rows. Four short cards can fit without it; `compact` is a density fix, not a hard card-count switch.

## When to use

- **Vertical reading order.** The audience scans top-to-bottom, not grid-style. Use when each card builds on the previous one as the eye moves down the slide.
- **Two sentences per card.** More body than cards-grid can hold without crowding. cards-stack lets each card carry one or two short sentences without losing the layout balance.
- **Two or three items.** Sweet spot is three. Past that the slide overflows — split across multiple slides or switch to cards-grid with shorter body text per card.

## When NOT to use

- **Five or more items.** A fourth card fits with the `compact` modifier; past four the stack overflows. For five or more parallel items reach for cards-grid four, or split across slides.
- **One-line cards.** If each card is a single short phrase, the stack reads as a padded list. Drop to `list` (or its `takeaway` variant) and reclaim the vertical space.
- **Forced sequence.** Cards-stack is parallel content read in vertical order, not a numbered sequence. For explicit steps, use list-steps or list-criteria.

## Authoring

```markdown
<!-- _class: cards-stack -->

## Slide heading.

- First card title
  - Body text for the first stacked card, two short sentences max.
- Second card title
  - Body text for the second stacked card.
- Third card title
  - Body text for the third stacked card.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Stacked-cards heading.                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Card title 1 — claim or label     │  │
│  │ body text fills the wide row      │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Card title 2 — claim or label     │  │
│  └───────────────────────────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `horizontal` — Horizontal cards

The stack pivots sideways.

```markdown
<!-- _class: cards-stack horizontal -->

## horizontal lays the stack on its side.

- Rows become columns.
  - The ranking now reads left to right.
- Same card anatomy.
  - Title, body, optional status pill.
- Use for timelines.
  - Sequence feels natural sideways.
```

### `numbered` — Numbered stack

Corner numbers make rank explicit.

```markdown
<!-- _class: cards-stack -->

## An ordered list makes the ranking explicit.

1. Numbers stamp the rank
   - The stack's order stops being implicit.
2. Three still rules
   - Numbering does not raise the ceiling.
3. Parallel or nothing
   - Ranked cards must match shapes.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`cards-grid`](../../inventory/cards-grid/cards-grid.docs.md) — three or four parallel items in a scannable grid
- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — exactly two items, side by side
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — items carry an explicit, ordered sequence

## Demo deck

See [cards-stack.gallery.light.pdf](./cards-stack.gallery.light.pdf) for rendered examples of every variant.
