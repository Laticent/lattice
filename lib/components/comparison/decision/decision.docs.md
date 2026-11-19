# decision

> The verdict slide — one chosen path, named explicitly.

**Function** comparison · **Form** canvas · **Substance** structure

**Tags** `recommendation` · `tradeoff` · `strategy`

Use after a comparison slide to land the decision. The justifications render as one unified categorical strip — co-equal cards that together signal a single resolved verdict; the heading carries the decision, not a focal/subordinated split.

## Agent contract

**Density** aim ~20 words per item; past ~32 it reads as a wall of text — each option's tradeoff in a sentence or two.

**By venue** (`venue:`, ~20 words each) it holds laptop ~5 · huddle ~4 · conference ~3 · hall ~2 items. At ~6 words each: 10 · 9 · 7 · 5. Past the room's number the slide still renders at the venue's size, because a venue is a fixed setting the engine never shrinks to fit, so it clips: `lint:deck` warns first (`capacity-scale`), and the export's `⚠ OVERFLOW` line and the Studio's ring name it. Measured at a wide @size by `tools/calibrate-capacity.js`; see engineering/decisions/2026-09-25-font-scale-fit.md.

### Slots

| Slot | Write | Required | Description |
|---|---|---|---|
| `title` | a `## ` heading | yes | Slide heading framing the decision. |
| `options` | a list | yes | List items. Authoring contract: a top-level bullet is the option name (renders bold by default); an indented bullet underneath carries the short rationale. The cards render as a unified strip of co-equal categorical tags; the verdict is carried by the heading, not by emphasizing one card. |

### Variant decision rule

- **default (no modifier).** The reasoning carries the weight — a quiet corner tag labels each justification without competing with the verdict heading.
- **`tag-band`.** The camp or stance itself is worth headlining — converts the quiet corner tag into a full-width banner strip per card. `tag-band` is the shared card-tag placement (formerly `banner-tag`, which still works); it, or `tag: band` deck-wide, works on every tagged layout.

### Common mistakes

- **Reordering justification cards, expecting their categorical accent color to travel with the same justification.** The accent color is assigned purely by card POSITION (an `nth-child` cycle through the categorical palette), not by content — reordering cards in the markdown reassigns colors; they don't follow the justification.
- **Manually bolding the option name with `**…**`.** The lead text auto-lifts to `<strong>` (the corner-tag CSS keys off it), and the lift step already skips an already-bolded lead — a manually bolded lead and a plain one produce byte-identical output. Wrapping it yourself is a harmless no-op, not a defect, but it's also unnecessary — write plain text and let the lift handle the weight.

## When to use

- **Land the verdict.** Follows a comparison slide to make the chosen path unambiguous. The heading carries the verb of the decision; the cards substantiate it.
- **Two to four justifications.** Each card is one short rationale — the chosen path first, then a Why-not card for each rejected alternative. More than four crowds the horizontal strip.
- **After the comparison.** Pair with `compare-prose` or `split-compare` upstream — that slide does the weighing, this slide lands the answer. Reaching for decision without a prior comparison reads as edict.

## When NOT to use

- **No clear chosen path.** If the cards don't resolve to a single verdict, the slide is back to being a comparison. Use `compare-prose` or `split-compare`; reserve decision for the resolved call.
- **Long body per card.** Each card is one sentence of rationale. Paragraphs belong on the comparison slide upstream, not on the verdict slide.
- **Generic heading.** The h2 carries the decision verb — Build, not buy. Adopt the framework. Pause the rollout. A heading like Next steps wastes the focal real estate.

## Authoring

```markdown
<!-- _class: decision -->

## What we are doing.

- Chosen path
  - One-line rationale for the decision.
- Rejected option
  - One-line rationale for why this didn't fit.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│            Decision heading.            │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  CHOSEN       Option B     Option C     │
│  rationale    rationale    rationale    │
│  └─────────┘  └─────────┘  └─────────┘  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `tag-band` — tag-band

Headlines each card with its camp.

```markdown
<!-- _class: decision tag-band -->

## tag-band headlines each card with its camp.

- DECIDE
  - The banner carries the stance; the body carries the reason.
- RECORD
  - Use when the slide is the decision log's public face.
```

## Universal modifiers

Universal modifiers (`dark`, `compact`, `accent`, state markers, treatments) compose onto this component's class. Every one, by group, is in [the base modifier reference](../../../base/base.modifiers.docs.md), generated from `lib/base/base.manifest.json`.

## Related components

- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — the comparison slide that should precede decision
- [`split-compare`](../../comparison/split-compare/split-compare.docs.md) — comparison and verdict on one slide instead of two
- [`closing`](../../anchor/closing/closing.docs.md) — the deck ends without a single-call verdict
- [`big-number`](../../statement/big-number/big-number.docs.md) — the decision is a quantitative commitment

## Demo deck

See [decision.gallery.light.pdf](./decision.gallery.light.pdf) for rendered examples of every variant.
