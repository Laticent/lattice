# divider

> Section boundary slide. Dark canvas with a single heading.

**Function** anchor · **Form** divider · **Substance** prose

**Tags** `section-break` · `agenda-setting` · `walkthrough`

Marks the start of a major section. Use sparingly — every divider is a context switch for the audience. A 30-slide deck typically has 3-5 dividers; more becomes navigation noise.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Section name. |
| `eyebrow` | `p > code` | no | Optional section number or category label above the heading. |

### Variant decision rule

- **default (no modifier).** A standard mid-deck section start — dark canvas, one heading, no extra chrome.
- **`numbered`.** Section numbering matters to the audience — a long, multi-part deck where a running section count in the corner helps orientation.
- **`light`.** A narrower re-focus within a section rather than a full section start — sits between a dark divider and a run of content slides. Reserve the dark default for genuine section starts.
- **`qr`.** The divider itself should carry a scannable link — a resource specific to the section it's opening.

### Common mistakes

- **Eyebrow written as plain text instead of inline code, e.g. plain `Section 01` instead of a backtick-wrapped one.** Divider's eyebrow uses the shared before-heading rule `p:has(> code:only-child):has(+ h2)` (base.modifiers.css) — wrap it in backticks; without the code span it's just a plain paragraph with no eyebrow treatment at all.
- **Eyebrow paragraph placed AFTER the heading, copying the title/closing pattern.** Divider's eyebrow is the mirror image of title/closing's — it uses the BEFORE-heading rule (`p:has(> code:only-child):has(+ h2)`), not the after-heading one those two use. Keep it directly before `## Section name`; placed after, it still renders (via the separate after-heading rule) but as an italic secondary-color treatment, not the intended mono kicker.

## When to use

- **Major section starts.** Marks the boundary between two themed sections of the deck. The dark canvas is a strong context-switch signal — use it when the audience needs to re-orient.
- **Sparingly.** A 30-slide deck typically has 3-5 dividers. More becomes navigation noise; the signal weakens if every third slide is a divider.
- **With an eyebrow.** An inline-code paragraph above the heading stamps a section number or category label. Useful for serialized decks where the audience needs to remember which section they're in.
- **Light variant for sub-section orientation.** The `light` variant keeps the bright body-slide canvas and centers the heading at h2 weight — a lighter context switch for narrowing focus within a section, between a dark divider and the content slides. (Absorbed the standalone `subtopic` component on 2026-06-07.)

## When NOT to use

- **More than five per deck.** Each divider is a hard context switch. Too many dilutes the signal and slows the audience. Group related content under fewer sections instead.
- **Section title that doesn't earn a section.** If the next 3-4 slides aren't a coherent unit, the `light` variant (bright canvas, centered) is the right tool. Reserve the dark divider for genuine section starts.
- **Header or footer overrides.** Don't reinstate `_header:` or `_footer:` on a divider. The dark canvas is meant to be uninterrupted; chrome belongs on body slides.

## Authoring

```markdown
<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`Section 01`

## Section name
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│                                         │
│               SECTION 02                │
│                                         │
│            Section headline             │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `numbered` — numbered

Stamps the running section number.

```markdown
<!-- _class: divider silent numbered -->

`divider numbered`

## The corner stamp counts this divider for you.
```

### `light` — light

Bright canvas, sentence-length waypoint.

```markdown
<!-- _class: divider light -->

`divider light`

## The light divider trades the dark canvas for a bright, full-sentence waypoint.
```

### `qr` — qr

The payload bullet becomes a code.

```markdown
<!-- _class: divider qr -->

`divider qr`

## The payload bullet below becomes a scannable code.

- https://slidewright.dev/components/divider
- Scan for the divider's docs `caption`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`title`](../../anchor/title/title.docs.md) — opens the deck — same dark-bookend chrome
- [`closing`](../../anchor/closing/closing.docs.md) — closes the deck — completes the bookend trio

## Demo deck

See [divider.gallery.light.pdf](./divider.gallery.light.pdf) for rendered examples of every variant.
