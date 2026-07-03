# agenda

> Auto-numbered table of contents for the deck.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `agenda-setting` · `overview` · `onboarding` · `kickoff`

**Capacity** ~4 items (crowds past 6, overflows past 7) — past that, split across slides.

**Density** aim ~10 words per item; past ~16 it reads as a wall of text — a short agenda line, not a description.

Use as the second slide of any multi-section deck. Numbers are generated; authors just write the section titles. Five interchangeable styles — the default `ledger` (a contents page with optional page references), plus `circles`, `rail`, `cards`, and `checks` — all compose with the `progress-N` 'you are here' modifier.

## When to use

- **Second slide of the deck.** Right after the title, before the first section. Orients the audience and sets the cadence of what's coming.
- **Three to six sections.** Sweet spot is four. Past six sections the list crowds and the audience stops counting. Roll up or split the deck.
- **Reuse with progress variants.** Drop the same agenda between sections with `progress-N` to show how far through the deck the room is. Lightweight wayfinding.
- **Pick a style, optionally with page refs.** The default `ledger` reads as a contents page; add `circles`, `rail`, `cards`, or `checks` to change the structure. On `ledger`, end an item with an inline-code page ref — e.g. `` `p.15` `` — to print a right-aligned page number with a leader; omit it for just number + title.

## When NOT to use

- **Sub-bullets per section.** The agenda is a wayfinder, not a treatment. If a section needs decomposition, that belongs on a section divider when the section opens — not here.
- **Unnumbered list.** Authoring with `-` instead of `1.` loses the numbered chrome the layout depends on. Always use ordered list syntax.
- **Single-section decks.** If the deck has no sections to enumerate, skip the agenda. Empty wayfinding is more friction than no wayfinding.
- **More than six sections.** A single agenda slide holds up to six sections at a legible row height; beyond that the rows crowd the footer. Group related items under fewer headings, or split the agenda across two slides.

## Authoring

```markdown
<!-- _class: agenda -->

## What this deck covers.

1. First section title
2. Second section title
3. Third section title
4. Fourth section title
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — typically 'Agenda' or 'What we'll cover'. |
| `items` | `ol > li` | yes | Ordered list of section titles. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Agenda heading.                        │
│                                         │
│  01  First section topic                │
│  02  Second section topic               │
│  03  Third section topic                │
│  04  Fourth section topic               │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `progress-1` — Progress · section 1

Wayfinding for the start of the deck — the first item is current, the rest are dimmed ahead.

```markdown
<!-- _class: agenda progress-1 -->

## Where we are now.

1. The four-layer model — Function · Form · Substance · Finish
2. Component manifests — the single source of truth
3. The shipped components, grouped by function
4. Discovery — scaffolder, snippets, this gallery
5. What ships next — open questions and follow-ups
```

### `progress-2` — Progress · section 2

The same agenda dropped between sections one and two — the second item is marked as the current position.

```markdown
<!-- _class: agenda progress-2 -->

## Where we are now.

1. The four-layer model — Function · Form · Substance · Finish
2. Component manifests — the single source of truth
3. The forty-five shipped components, grouped by function
4. Discovery — scaffolder, snippets, this gallery
5. What ships next — open questions and follow-ups
```

### `progress-3` — Progress · section 3

Same wayfinding pattern, current position moved to the third item.

```markdown
<!-- _class: agenda progress-3 -->

## Where we are now.

1. The four-layer model — Function · Form · Substance · Finish
2. Component manifests — the single source of truth
3. The forty-five shipped components, grouped by function
4. Discovery — scaffolder, snippets, this gallery
5. What ships next — open questions and follow-ups
```

### `progress-4` — Progress · section 4

Current position on the fourth item — three sections done, two to go.

```markdown
<!-- _class: agenda progress-4 -->

## Where we are now.

1. The four-layer model — Function · Form · Substance · Finish
2. Component manifests — the single source of truth
3. The forty-five shipped components, grouped by function
4. Discovery — scaffolder, snippets, this gallery
5. What ships next — open questions and follow-ups
```

### `progress-5` — Progress · section 5

Current position on the fifth item — the last section opening, used as a final wayfinder before the closing.

```markdown
<!-- _class: agenda progress-5 -->

## Where we are now.

1. The four-layer model — Function · Form · Substance · Finish
2. Component manifests — the single source of truth
3. The forty-five shipped components, grouped by function
4. Discovery — scaffolder, snippets, this gallery
5. What ships next — open questions and follow-ups
```

### `progress-6` — Progress · section 6

Same wayfinding pattern on a six-section agenda — current position at the sixth and final item.

```markdown
<!-- _class: agenda progress-6 -->

## Where we are now.

1. Why we're here — the problem
2. Where we are today
3. The proposal
4. Migration plan
5. Risks and mitigations
6. Decision and next steps
```

### `circles` — Style · circles

Each section number sits in a drawn ring; with `progress-N` the current ring fills with the accent. A calmer, more graphic take on the contents page.

```markdown
<!-- _class: agenda circles progress-3 -->

## Where we are now.

1. The four-layer model
2. Component manifests
3. The shipped components
4. Discovery — scaffolder & snippets
5. What ships next
```

### `rail` — Style · rail

Numbered nodes threaded on a vertical journey line — reads as moving down the deck. The active node fills with the accent.

```markdown
<!-- _class: agenda rail progress-3 -->

## Where we are now.

1. The four-layer model
2. Component manifests
3. The shipped components
4. Discovery — scaffolder & snippets
5. What ships next
```

### `cards` — Style · cards

Each section is a boxed row; the current card fills with the accent wash and takes the accent border.

```markdown
<!-- _class: agenda cards progress-3 -->

## Where we are now.

1. The four-layer model
2. Component manifests
3. The shipped components
4. Discovery — scaffolder & snippets
5. What ships next
```

### `checks` — Style · checks

A progress checklist: with `progress-N`, sections already covered get a tick, the current one an arrow, and upcoming ones an empty box — the whole journey-state at a glance.

```markdown
<!-- _class: agenda checks progress-3 -->

## Where we are now.

1. The four-layer model
2. Component manifests
3. The shipped components
4. Discovery — scaffolder & snippets
5. What ships next
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`divider`](../../anchor/divider/divider.docs.md) — marking a section boundary without restating the menu
- [`list`](../../inventory/list/list.docs.md) — single-line takeaways — the `takeaway` variant
- [`title`](../../anchor/title/title.docs.md) — the slide immediately preceding the agenda

## Demo deck

See [agenda.gallery.light.pdf](./agenda.gallery.light.pdf) for rendered examples of every variant.
