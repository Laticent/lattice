# content

> Generic prose slide — heading plus paragraphs or a short list.

**Function** statement · **Form** canvas · **Substance** prose

**Tags** `walkthrough` · `overview` · `summary`

The catch-all for explanatory content that doesn't fit a more structured layout. Resist using it when a more specific component (cards-grid, stats, compare-prose) would shape the content better.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading. |
| `body` | `section > p, section > ul` | yes | Paragraphs or a short bullet list under the heading. Keep under ~40 words. |

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

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`quote`](../../statement/quote/quote.docs.md) — the prose IS a quote — let the quotation chrome carry it
- [`big-number`](../../statement/big-number/big-number.docs.md) — the prose IS a metric — let the number carry it
- [`cards-grid`](../../inventory/cards-grid/cards-grid.docs.md) — the prose IS a parallel list of items
- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — the prose IS a two-way comparison
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — the prose IS an ordered sequence

## Demo deck

See [content.gallery.light.pdf](./content.gallery.light.pdf) for rendered examples of every variant.
