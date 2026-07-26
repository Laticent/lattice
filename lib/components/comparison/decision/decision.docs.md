# decision

> The verdict slide — one chosen path, named explicitly.

**Function** comparison · **Form** canvas · **Substance** structure

**Tags** `recommendation` · `tradeoff` · `strategy`

Use after a comparison slide to land the decision. The justifications render as one unified categorical strip — co-equal cards that together signal a single resolved verdict; the heading carries the decision, not a focal/subordinated split.

## Agent contract

**Density** aim ~20 words per item; past ~32 it reads as a wall of text — each option's tradeoff in a sentence or two.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the decision. |
| `options` | `ul > li` | yes | List items. Authoring contract: a top-level bullet is the option name (renders bold by default); an indented bullet underneath carries the short rationale. The cards render as a unified strip of co-equal categorical tags; the verdict is carried by the heading, not by emphasizing one card. |

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

### `banner-tag` — banner-tag

Headlines each card with its camp.

```markdown
<!-- _class: decision banner-tag -->

## banner-tag headlines each card with its camp.

- DECIDE
  - The banner carries the stance; the body carries the reason.
- RECORD
  - Use when the slide is the decision log's public face.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — the comparison slide that should precede decision
- [`split-compare`](../../comparison/split-compare/split-compare.docs.md) — comparison and verdict on one slide instead of two
- [`closing`](../../anchor/closing/closing.docs.md) — the deck ends without a single-call verdict
- [`big-number`](../../statement/big-number/big-number.docs.md) — the decision is a quantitative commitment

## Demo deck

See [decision.gallery.light.pdf](./decision.gallery.light.pdf) for rendered examples of every variant.
