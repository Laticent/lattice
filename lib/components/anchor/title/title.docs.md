# title

> Opening slide. Dark canvas, centered, no chrome.

**Function** anchor · **Form** bookend · **Substance** prose

**Tags** `pitch` · `board-deck` · `showcase` · `kickoff`

First slide of every deck. Sets the topic and the visual tone. Suppresses header, footer, and pagination (or use the universal `silent` modifier for the same effect in one token).

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h1` | yes | Deck title. |
| `eyebrow` | `p > code` | no | Optional category label rendered above the h1 (authored as an inline-code paragraph immediately after the h1; flex `order` lifts it above). |
| `subtitle` | `p` | no | Optional plain-paragraph subtitle below the h1. |

### Common mistakes

- **Eyebrow written as bold or plain text instead of inline code, e.g. `**Category · Date**`.** Wrap the eyebrow paragraph in backticks. The eyebrow CSS matches `h1 + p:has(> code:only-child)`; without the code span the paragraph falls through to the general subtitle rule instead — it still renders styled, just as a second subtitle line, not the uppercase mono eyebrow lifted above the h1.
- **Something other than the eyebrow paragraph sits directly after the `# heading` — e.g. the subtitle comes first, or a blank comment intervenes.** The eyebrow match is an immediate-next-sibling selector (`h1 + p:has(> code:only-child)`). Keep the source order heading → eyebrow → subtitle; anything between the h1 and the inline-code paragraph disqualifies it from the eyebrow style.
- **Inline emphasis (`**bold**`, `_italic_`) inside the h1 itself.** Keep the h1 to plain text. The centered, oversized type already carries full weight — nested emphasis at that scale reads as noise, not emphasis.

## When to use

- **First slide of every deck.** Sets topic, audience, and visual tone in one glance. The dark canvas anchors the deck visually so subsequent slides feel like a continuous document.
- **Brand or section bookends.** Pair with `divider` (mid-deck section breaks) and `closing` (the final slide) for the full anchor trio. All three share the dark-bookend treatment.
- **Pitch and proposal openings.** When the audience needs the headline and the framing line before any data. The subtitle paragraph is where the framing line goes.

## When NOT to use

- **Mid-deck statements.** Use `big-number` or `content` for emphatic statements inside a deck. Reaching for the title chrome mid-deck breaks the bookend signal.
- **Multi-line h1.** Keep the h1 to one editorial line. The layout is centered and large — two-line titles get cramped and lose impact.
- **Header or footer overrides.** Don't add back `_header:` or `_footer:` on a title slide. The dark canvas is meant to be uninterrupted; chrome belongs on body slides.

## Authoring

```markdown
<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Deck title goes here

`Category · Date or audience`

One-line subtitle that frames the deck.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│                                         │
│              EYEBROW LABEL              │
│                                         │
│           Display Title Here            │
│           Subtitle or tagline           │
│                                         │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`divider`](../../anchor/divider/divider.docs.md) — mid-deck section breaks — same dark-bookend chrome
- [`closing`](../../anchor/closing/closing.docs.md) — the final slide — closes the bookend pair

## Demo deck

See [title.gallery.light.pdf](./title.gallery.light.pdf) for rendered examples of every variant.
