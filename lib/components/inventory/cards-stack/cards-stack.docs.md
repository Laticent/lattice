# cards-stack

> Parallel items stacked vertically, full-width cards.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `overview` · `summary` · `reference`

**Capacity** ~3 items (crowds past 4, overflows past 4) — past that, list-tabular / split across slides.

**Density** aim ~16 words per item; past ~26 it reads as a wall of text — a stacked card is a short paragraph at most.

Use when the items want vertical reading order — sequential exploration rather than a-glance comparison. 2–4 items work best (a fourth fits with the `compact` modifier).

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

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `cards` | `ul > li` | yes | Each list item becomes one stacked card. Authoring contract: a top-level bullet is the card title (renders bold by default); an indented bullet underneath carries the body text. An optional trailing inline `code` on the title line renders as a right-anchored pill. |

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

Stacked rows pivot to a left-aligned title column with the body to its right — useful when the card titles are short labels and the body carries the weight.

```markdown
<!-- _class: cards-stack horizontal -->

## Three patterns, each with its own pull.

- Inventory.
  - Equal-weight items the audience scans without ordering. The cards-grid family lives here — grid, stack, wide, side.
- Comparison.
  - Two or more items weighed against shared criteria. The verdict and compare families live here — they take sides.
- Progression.
  - Items that carry an explicit sequence. The list-steps and timeline families live here — order is load-bearing.
```

### `numbered` — Numbered stack

Authored as `ol` (`1.` source). Each row carries a flush corner number — use when the stack carries an implicit count ("three options", "four phases") even if the order is interchangeable.

```markdown
<!-- _class: cards-stack -->

## Three reasons to keep cards-stack at three items.

1. Cognitive load
   - Three is the threshold the audience can hold without effort. Past three, the slide demands working memory the room shouldn't have to spend.
2. Vertical real estate
   - Each stacked card needs ~30% of the slide height to breathe. Four cards force you to shrink the cards until they stop reading as cards.
3. Build path symmetry
   - cards-stack pairs with cards-grid (3-4 items) for at-a-glance comparison. One stack layout, not two, keeps the family's choices clean.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`cards-grid`](../../inventory/cards-grid/cards-grid.docs.md) — three or four parallel items in a scannable grid
- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — exactly two items, side by side
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — items carry an explicit, ordered sequence

## Demo deck

See [cards-stack.gallery.light.pdf](./cards-stack.gallery.light.pdf) for rendered examples of every variant.
