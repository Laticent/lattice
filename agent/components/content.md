# content

> Generic prose slide — heading plus paragraphs or a short list.

**Function** statement · **Form** canvas · **Substance** prose

**Tags** `walkthrough` · `overview` · `summary`

The catch-all for explanatory content that doesn't fit a more structured layout. Resist using it when a more specific component (cards-grid, stats, compare-prose) would shape the content better. **`content` is also the DEFAULT**: a slide that names no component at all resolves to it (#1292), so writing nothing and writing `_class: content` are the same thing. That is why its prose reads at the body tier rather than the slide-statement tier — it has to sit correctly beside a Key Insight, a below-note and a table, all of which are body-tier.

## Agent contract

**Capacity** ~5 items at a wide @size (crowds past 6, overflows past 7).

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading. |
| `body` | `section > p, section > ul` | yes | Paragraphs or a short bullet list under the heading. Keep under ~40 words — an editorial target for a slide you chose this layout for, not a limit the engine enforces; a slide that merely fell back to `content` is bound by the overflow oracle, not by this. |

### Common mistakes

- **Nesting a second level of bullets to add sub-points, expecting them to read with the same weight as the top level.** A nested list steps DOWN one type tier (top level is --fs-body, nested is --fs-body-compact) — nested items read as supporting asides, not equal peers. If the items should carry equal weight, keep them all at the top level.
- **Expecting a trailing paragraph to stay body copy after a list or a table.** It is promoted to a below-note — hairline rule, muted ink. A paragraph after a PARAGRAPH is never promoted, so ordinary prose is unaffected. When the trailing sentence really is the conclusion of the list rather than a footnote to it, add `no-note` to the slide `_class` and it stays body copy. A deck-wide `class: no-note` in front matter works too, and reaches every slide — including the ones that name their own `_class:`.

## When to use

- **Explanatory prose that doesn't shape.** A paragraph that develops one idea. No comparisons to spell out, no inventory to grid, no metric to highlight — just prose with a heading. The catch-all when shape would be forced.
- **Under forty words.** Content slides earn their place when they're brief. Past 40 words the slide becomes a wall of text and the audience stops reading. Trim or split into two slides.
- **Optional short bullet list.** If the paragraph wants two or three loose qualifications, a bullet list below the prose is fine. For more than that, the content is really structured — move to a `list` or `cards-stack` slide.

## When NOT to use

- **Forced shape into prose.** If the content is a comparison, use compare-prose. If it's a list of options, use cards-grid. If it's a sequence, use list-steps. Reaching for content when shape exists wastes the slide.
- **Wall of text.** More than 40 words and the audience tunes out. The layout doesn't fight back — it'll happily render a 200-word paragraph that nobody reads. Split or trim.
- **Multiple headings.** Content carries one heading and one idea. Two h2s on one slide reads as two slides crammed together. Split into two content slides or use a structured layout.

## Authoring

```markdown
<!-- _class: content -->

## Slide heading.

The explanatory paragraph that develops the heading goes here. Keep the slide under forty words.

- Optional supporting point one.
- Optional supporting point two.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  EYEBROW                                │
│  Single-idea heading.                   │
│                                         │
│  Paragraph carries the slide.           │
│  One idea expanded into prose,          │
│  no lists, no chrome.                   │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`quote`](./quote.md) — the prose IS a quote — let the quotation chrome carry it
- [`big-number`](./big-number.md) — the prose IS a metric — let the number carry it
- [`cards-grid`](./cards-grid.md) — the prose IS a parallel list of items
- [`compare-prose`](./compare-prose.md) — the prose IS a two-way comparison
- [`list-steps`](./list-steps.md) — the prose IS an ordered sequence

## Demo deck

