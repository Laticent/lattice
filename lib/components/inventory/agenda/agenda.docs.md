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

### `progress-1` — progress-1

Stop 1 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-1 -->

## progress-1 marks stop 1 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past seven stops, split the agenda `p.22`
```

### `progress-2` — progress-2

Stop 2 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-2 -->

## progress-2 marks stop 2 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past seven stops, split the agenda `p.22`
```

### `progress-3` — progress-3

Stop 3 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-3 -->

## progress-3 marks stop 3 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past seven stops, split the agenda `p.22`
```

### `progress-4` — progress-4

Stop 4 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-4 -->

## progress-4 marks stop 4 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past seven stops, split the agenda `p.22`
```

### `progress-5` — progress-5

Stop 5 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-5 -->

## progress-5 marks stop 5 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past seven stops, split the agenda `p.22`
```

### `progress-6` — progress-6

Stop 6 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-6 -->

## progress-6 marks stop 6 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past seven stops, split the agenda `p.22`
```

### `circles` — Style · circles

Numbers become rings; current fills.

```markdown
<!-- _class: agenda circles progress-3 -->

## circles swaps the numbers for filled dots.

1. The four marker styles share one anatomy
2. Numbers are the default
3. This variant swaps the marker
4. Progress still tracks the current stop
5. Five stops keep the demo honest
```

### `rail` — Style · rail

Nodes on a vertical rail; active fills.

```markdown
<!-- _class: agenda rail progress-3 -->

## rail runs the progress down a side rail.

1. The four marker styles share one anatomy
2. Numbers are the default
3. This variant swaps the marker
4. Progress still tracks the current stop
5. Five stops keep the demo honest
```

### `cards` — Style · cards

Boxed stops; the current takes accent.

```markdown
<!-- _class: agenda cards progress-3 -->

## cards deals each stop its own card.

1. The four marker styles share one anatomy
2. Numbers are the default
3. This variant swaps the marker
4. Progress still tracks the current stop
5. Five stops keep the demo honest
```

### `checks` — Style · checks

Done gets a tick, current an arrow.

```markdown
<!-- _class: agenda checks progress-3 -->

## checks ticks the stops already behind you.

1. The four marker styles share one anatomy
2. Numbers are the default
3. This variant swaps the marker
4. Progress still tracks the current stop
5. Five stops keep the demo honest
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`divider`](../../anchor/divider/divider.docs.md) — marking a section boundary without restating the menu
- [`list`](../../inventory/list/list.docs.md) — single-line takeaways — the `takeaway` variant
- [`title`](../../anchor/title/title.docs.md) — the slide immediately preceding the agenda

## Demo deck

See [agenda.gallery.light.pdf](./agenda.gallery.light.pdf) for rendered examples of every variant.
