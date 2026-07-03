# quote

> A pulled quotation, centered, with attribution.

**Function** statement · **Form** canvas · **Substance** prose

**Tags** `pull-quote` · `quotation` · `showcase`

Use to land a phrase verbatim — customer voice, expert claim, mission statement. Keep under ~25 words. The quote IS the slide; the attribution is the supporting credit.

## When to use

- **Verbatim language matters.** When the audience needs to hear the words exactly as they were said — customer feedback, expert claim, regulatory text, mission statement. Paraphrasing would lose the impact.
- **One breath of reading.** Keep the quotation under ~25 words. The audience reads silently in one breath; longer than that and they're scanning, not feeling the words.
- **Attribution earns the quote.** Anonymous quotes feel weak. Attribute the speaker, their role, and the context ("Head of Product, Pilot Team 3" beats just "a customer"). The attribution is the credibility.

## When NOT to use

- **Paragraph-length quotes.** If the quote runs past 25 words, the slide is reading like a wall of text. Trim aggressively or use `split-panel pullquote` (gives the quote half the slide alongside spelled-out implications).
- **Multiple quotes per slide.** Two quotes on one canvas dilute both. The whole point is that one quote earns the whole slide. For a montage of customer voices, use successive quote slides.
- **Decorative quotes.** If the quote could be paraphrased without losing anything, the slide doesn't need to be a quote slide. Move the idea into `content` and skip the chrome.

## Authoring

```markdown
<!-- _class: quote -->

> The quoted sentence sits here, kept short enough to read in one breath.

— Person, Role
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `quotation` | `blockquote > p` | yes | The quoted text. |
| `attribution` | `section > p:last-child` | no | Attribution line below the quote. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                                         │
│       "A pulled quote that fills        │
│        the centre of the slide."        │
│                                         │
│          — Attribution, source          │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — the quote needs implications spelled out alongside it
- [`content`](../../statement/content/content.docs.md) — the language is paraphrasable — let prose carry it
- [`big-number`](../../statement/big-number/big-number.docs.md) — the most memorable thing is a metric, not a phrase

## Demo deck

See [quote.gallery.light.pdf](./quote.gallery.light.pdf) for rendered examples of every variant.
