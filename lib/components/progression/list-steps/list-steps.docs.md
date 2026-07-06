# list-steps

> Horizontal row of ordered step cards, each with a full description body (the `vertical` variant stacks them instead).

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `process` · `walkthrough` · `planning`

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, timeline-list / split across slides.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one sentence per step, not a paragraph.

Use for richer sequential processes where each step needs a paragraph rather than a label. More verbose than timeline; more structured than a plain ordered list.

## When to use

- **Steps need a sentence each.** When each step carries a label plus a sentence of description. Lighter rosters of steps with short labels use the `timeline` variant; richer descriptions belong on the default cards.
- **Three to five steps.** Two steps wastes the layout's ledger feel; six begins to crowd. Group adjacent steps or split the process at a natural phase break.
- **Prefix word names the unit.** The default `STEP` prefix can swap to `PHASE`, `STAGE`, `MILESTONE`, `RANK`, or `TIER`. Pick the noun that matches how the audience already thinks about the process.

## When NOT to use

- **Light labels, no body.** If each step is a single label with no description, use the `timeline` variant (dots on a spine). The default step cards earn their chrome only when the body adds substance.
- **Parallel options.** If the rows are alternatives the audience compares, use `cards-grid` or `verdict-grid`. The numbered prefix here reads as sequence — using it for parallel items mis-cues the audience.
- **Author-typed step numbers.** Don't write `**STEP 01**` into the markdown. The badge is CSS-generated from the `ol` counter; manual numbering double-stamps and breaks on reordering.

## Authoring

```markdown
<!-- _class: list-steps -->

## How to roll this out.

1. First step — a sentence describing what you do here.
2. Second step — a sentence describing what you do here.
3. Third step — a sentence describing what you do here.
4. Fourth step — a sentence describing what you do here.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the process. |
| `steps` | `ol > li` | yes | Ordered list; each li gets a step number. Body can be one paragraph or a nested bullet list. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Step-by-step heading (horizontal).     │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  STEP 01      STEP 02      STEP 03      │
│  label        label        label        │
│  body         body         body         │
│  └─────────┘  └─────────┘  └─────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `vertical` — vertical

Steps stack down the page.

```markdown
<!-- _class: list-steps vertical compact -->

## vertical stacks the steps down the page.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `timeline` — timeline

Steps string along a line.

```markdown
<!-- _class: list-steps timeline -->

## timeline strings the steps along a line.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `phase` — phase

Each step blocks as an era.

```markdown
<!-- _class: list-steps phase -->

## phase blocks each step as an era.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `milestone` — milestone

Steps mark as checkpoints.

```markdown
<!-- _class: list-steps milestone lettered -->

## milestone marks the steps as checkpoints.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `lettered` — lettered

Letters count the steps.

```markdown
<!-- _class: list-steps lettered -->

## lettered counts the steps with letters.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `stage` — Stage

Stage tags prefix each step.

```markdown
<!-- _class: list-steps stage -->

## stage prefixes each step with its stage tag.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `rank` — Rank

Numbers read as standings.

```markdown
<!-- _class: list-steps rank -->

## rank reads the numbers as standings.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `tier` — Tier

Steps render as service tiers.

```markdown
<!-- _class: list-steps tier roman -->

## tier renders the steps as service tiers.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

### `roman` — Roman numerals

Numerals count the phases.

```markdown
<!-- _class: list-steps phase roman -->

## roman counts the phases in numerals.

1. First
   - Three steps demo a look best.
2. Second
   - The look changes; the grammar holds.
3. Third
   - Body budgets do not move.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-criteria`](../../progression/list-criteria/list-criteria.docs.md) — gating requirements rather than a sequence of actions
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — phase label + heading on the left, steps on the right
- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — phased grid across multiple workstreams
- [`list`](../../inventory/list/list.docs.md) — tenets or values (the `principles` variant) rather than a sequence

## Demo deck

See [list-steps.gallery.light.pdf](./list-steps.gallery.light.pdf) for rendered examples of every variant.
