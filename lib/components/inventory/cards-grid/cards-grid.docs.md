# cards-grid

> 2–4 parallel items, similar weight, scannable in a grid.

**Function** inventory · **Form** grid · **Substance** structure

**Tags** `overview` · `showcase` · `summary`

**Capacity** ~3 items (crowds past 4, overflows past 4) — past that, list-tabular / split across slides.

**Density** aim ~15 words per item; past ~24 it reads as a wall of text — a card body is one short clause, not a paragraph.

Use when the audience needs to compare or scan a small set of options at a glance. Avoid for more than 4 items — split into multiple slides. For ordered/numbered steps, use list-steps instead.

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

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `cards` | `ul > li` | yes | Each list item becomes one card. Authoring contract: a top-level bullet is the card title (renders bold by default); an indented bullet underneath carries the body text (renders normal weight via the nested-list rule). |
| `insight` | `blockquote` | no | Optional key-insight panel above the cards. |

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

Four equal columns instead of two. Pair with `compact` so the cards retain breathing room.

```markdown
<!-- _class: cards-grid four compact -->

## Four phases, four owners.

- Intake.
  - PM. Collect raw signals.
- Score.
  - Analyst. Apply weights.
- Decide.
  - Lead. Pick the call.
- Calibrate.
  - Team. Compare to actuals.
```

### `three` — Three columns

Three equal columns instead of the default two. The 2+1 last-child span rule is reset to `auto`.

```markdown
<!-- _class: cards-grid three -->

## The framework has three components.

- Signal Intake.
  - Weekly structured collection across customer conversations, market data, and competitive moves. Normalized into a common schema.
- Scoring Model.
  - Each signal scored on three dimensions — confidence, recency, strategic relevance. Weights are reviewed quarterly.
- Decision Log.
  - Every decision recorded with the signals that informed it, the options considered, and the criteria applied.
```

### `numbered` — Numbered cards

Authored as `ol` (`1.` source), the grid stamps a flush top-left accent corner tag on each card. Sublist must be indented 3 spaces to clear the `1. ` prefix.

```markdown
<!-- _class: cards-grid -->

## Signal Intake produces three outputs.

1. Weekly Signal Brief
   - A ranked list of the top 10 signals from the prior week, with confidence scores and source attribution. Distributed to product leads every Monday.
2. Anomaly Alerts
   - Real-time flags when a signal exceeds the 2σ threshold on any dimension. Routed to the accountable PM with a 4-hour response SLA.
3. Monthly Signal Index
   - The source of truth for the calibration loop. Required reading before each retrospective.
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
