# list-steps

> Horizontal row of ordered step cards, each with a full description body (the `vertical` variant stacks them instead).

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `process` · `walkthrough` · `planning`

Use for richer sequential processes where each step needs a paragraph rather than a label. More verbose than timeline; more structured than a plain ordered list.

## Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, timeline-list / split across slides.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one sentence per step, not a paragraph.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the process. |
| `steps` | `ol > li` | yes | Ordered list; each li gets a step number. Body can be one paragraph or a nested bullet list. |

### Variant decision rule

- **`capsule`.** The tone is warmer and more editorial than an ops checklist — a personal or reflective process (a practice, a ritual, a habit). One class carries the whole look: centered masthead and cards, a pill badge per step in its own categorical hue, a serif title, no connector arrows, and no masthead hairline. Add `rule-full` if you want the hairline back.
- **`vertical`.** The frame is narrow or portrait, or the step bodies need more vertical room — stacks steps down the page instead of across a row.
- **`chevron`.** The story argues through cascading stages (problem → vision → approach → plan) — down-chevron tabs read as a persuasive cascade rather than a neutral sequence.
- **`converge`.** The process narrows toward one outcome — a qualitative funnel shape without literal conversion percentages (use `funnel` when you have numbers).
- **`ghost`.** The argument is the point and the process is secondary — a faint chevron watermark behind one hero description, editorial in tone.
- **`timeline`.** Steps are light labels with no body copy — dots on a spine, not full description cards.
- **`phase`.** The audience already thinks of the sequence as phases rather than steps — swaps the badge prefix word; `stage`/`milestone`/`rank`/`tier` swap it to match other vocabularies the same way.
- **`lettered`.** The audience reads order as letters (A, B, C) rather than numbers — swaps the counter format; combine with a prefix-word variant (e.g. `milestone lettered`).
- **`roman`.** The sequence reads as eras or acts rather than a numbered checklist — swaps the counter format to roman numerals; typically paired with `phase`.

### Common mistakes

- **Authoring steps as a bullet list (`-`) instead of a numbered list (`1.`).** The card chrome — background, border, STEP badge, connector arrow — is scoped to `ol > li` specifically; a `ul` renders as plain unstyled text with no cards, no counter, no badge.
- **Deleting or reordering a step without checking other steps' prose for a stale reference to its old position (e.g. "as covered in step 3").** The STEP/PHASE/… badge is generated purely from a CSS `counter()` on the `ol` position — it renumbers automatically, but any prose that names a step by number does not.

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

### `chevron` — chevron

Down-chevron tabs cascade into keyed description cards.

```markdown
<!-- _class: list-steps chevron -->

## Make the case, one stage at a time.

1. Problem
   - Define the problem that is causing the pain.
2. Vision
   - Show what the world looks like once it is solved.
3. Approach
   - Detail the moves that get from here to there.
4. Plan
   - Commit to concrete steps, owners, and a date.
```

### `converge` — converge

Tapering bands narrow onto the final stage (a qualitative funnel).

```markdown
<!-- _class: list-steps converge -->

## Many concerns narrow onto one plan.

1. Problem
   - Define the problem that is causing the pain.
2. Vision
   - Show what the world looks like once it is solved.
3. Approach
   - Detail the moves that get from here to there.
4. Plan
   - Commit to concrete steps, owners, and a date.
```

### `ghost` — ghost

Faint chevron watermark, eyebrow label, hero description — editorial.

```markdown
<!-- _class: list-steps ghost -->

## The argument, stated plainly.

1. Problem
   - Define the problem that is causing the pain.
2. Vision
   - Show what the world looks like once it is solved.
3. Approach
   - Detail the moves that get from here to there.
4. Plan
   - Commit to concrete steps, owners, and a date.
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

### `capsule` — capsule

Centered editorial group: pill badge per step in its own categorical hue, serif title, no connector arrows, no masthead hairline.

```markdown
<!-- _class: list-steps capsule -->

## Turn the framework into a habit.

1. Name it
   - Say the verb and the reach you operate at today.
2. Pick the next move
   - One deeper verb, or the same verb carried wider.
3. Keep the evidence
   - A doc, a metric, a postmortem — proof the shift happened.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-criteria`](../../progression/list-criteria/list-criteria.docs.md) — gating requirements rather than a sequence of actions
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — phase label + heading on the left, steps on the right
- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — phased grid across multiple workstreams
- [`list`](../../inventory/list/list.docs.md) — tenets or values (the `principles` variant) rather than a sequence
- [`funnel`](../../chart/funnel/funnel.docs.md) — a value-driven funnel with conversion percentages, rather than the qualitative `converge` variant

## Demo deck

See [list-steps.gallery.light.pdf](./list-steps.gallery.light.pdf) for rendered examples of every variant.
