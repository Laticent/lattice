# closing

> Final slide. Dark canvas mirror of title.

**Function** anchor · **Form** bookend · **Substance** prose

**Tags** `summary` · `takeaway` · `board-deck`

Last slide of every deck. Restates the takeaway or call-to-action. Like title, suppresses header/footer/pagination — the dark canvas signals "we're done."

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Closing line — takeaway, thank-you, or call to action. |
| `eyebrow` | `p > code` | no | Optional category label. |
| `subtitle` | `p` | no | Optional supporting line. |

### Variant decision rule

- **default (no modifier).** A single-sentence takeaway or call-to-action closes the deck — the common case.
- **`numbered`.** The deck's dividers also use the `numbered` variant — keeps the closing's corner stamp consistent with that numbering scheme.
- **`qr`.** The audience should leave with a scannable link (docs URL, contact card) rather than just a text call-to-action.
- **`index`.** The closing is a reference/see-also list of multiple next steps or resources, not a single takeaway sentence.

### Common mistakes

- **Eyebrow written as bold or plain text instead of inline code.** The eyebrow match is `h2 + p:has(> code:only-child)` — wrap it in backticks immediately after the heading; without the code span it falls through to the general italic subtitle rule instead of the uppercase mono eyebrow lifted above the heading.
- **The subtitle paragraph is authored before the eyebrow paragraph instead of after it.** The eyebrow match is an immediate-next-ELEMENT-sibling selector (`h2 + p:has(> code:only-child)`) — keep the source order heading → eyebrow → subtitle.
- **In the `index` variant, the leading reference key isn't wrapped in inline code, e.g. `docs — the component catalog` instead of leading with a backtick-wrapped key.** The `index` variant's mono reference-key styling (`section.closing.index :is(ul,ol) li code`) only applies to an actual `<code>` element — wrap the leading key in backticks so it renders as a mono chip, not plain text.

## When to use

- **Last slide of every deck.** Closes the bookend pair with title. Restates the takeaway, the call to action, or the next-steps line. The dark canvas tells the audience visually that the presentation is over.
- **Single takeaway line.** The h2 is the slide. Keep it to one editorial line that summarizes the whole deck or names the action the audience should take. The eyebrow can carry a sub-line or link.
- **Accent modifier for emphasis.** Pair with the universal `accent` modifier to recolor the focal heading. Useful when the closing line is a quote or a key decision the deck has been building toward.

## When NOT to use

- **Multi-line heading.** Keep the closing line to one editorial sentence. The layout is centered and large — two-line closings get cramped and lose impact.
- **Header or footer overrides.** Don't reinstate `_header:` or `_footer:` on the closing. The dark canvas is the "we're done" signal; chrome breaks it. Use the `silent` modifier to suppress all three in one token.
- **Mid-deck closing.** If the audience needs a strong statement mid-deck, use `big-number` or `content` with the `dark` modifier. Reserving closing for the final slide preserves its bookend role.

## Authoring

```markdown
<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Closing takeaway or call to action

`Optional eyebrow`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│                                         │
│                 CLOSING                 │
│                                         │
│             Take this away              │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `numbered` — numbered

Counts closings apart from dividers.

```markdown
<!-- _class: closing silent numbered -->

## The closing counts itself, apart from the dividers.

`Closing 04`
```

### `qr` — qr

Scan to take the deck with you.

```markdown
<!-- _class: closing qr -->

`closing qr`

## Leave a scannable takeaway behind.

The payload bullet renders as a QR code sized for the back row.

- https://slidewright.dev/components/closing
- Scan to open `caption`
```

### `index` — index

Ends on a reference list — see also, next steps.

```markdown
<!-- _class: closing silent index -->

## Where to go next.

`Next steps`

- `docs` — the component catalog and authoring contracts
- `gallery` — every layout rendered in light and dark
- `studio` — compose and preview a deck in the browser
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`title`](../../anchor/title/title.docs.md) — opens the deck — same dark-bookend chrome
- [`divider`](../../anchor/divider/divider.docs.md) — mid-deck section breaks — same dark canvas
- [`big-number`](../../statement/big-number/big-number.docs.md) — single emphatic statement mid-deck without the bookend signal

## Demo deck

See [closing.gallery.light.pdf](./closing.gallery.light.pdf) for rendered examples of every variant.
