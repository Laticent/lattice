# Lattice layouts — inventory



> Parallel sets of related items — lists, cards, checklists, agendas.



**Contents:** `actors` · `agenda` · `cards-grid` · `cards-stack` · `checklist` · `glossary` · `inventory` · `list` · `list-tabular` · `logo-wall` · `q-and-a` · `team-profile`



## actors

> Roster of responsibilities owned by named actors.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `ownership` · `onboarding` · `reference`

Use to show 'who owns what' across a process, scoring policy, or org chart. Two-column layout: actor on left, responsibilities on right.

### Agent contract

**Capacity** ~4 items (crowds past 6, overflows past 7) — past that, list-tabular / split across slides. The ledger reads cleanly up to about six rows.

**Density** aim ~12 words per item; past ~18 it reads as a wall of text — one short responsibility per row, not a job description.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `rows` | `ul > li` | yes | One row per responsibility. Each li leads with the responsibility label — rendered bold automatically (no `**…**` needed) — then a trailing inline-code actor name (rendered as a right-aligned categorical pill), then an optional nested bullet carrying a one-line body. |

#### Common mistakes

- **Putting the actor name as the first word of the row instead of a trailing inline-code chip.** The row reads responsibility-then-actor: the label leads (auto-bold), and the actor name must be a TRAILING, direct-child inline-code chip on the same line — `- Owns the first part \`First actor\`` — not the other way around, or it won't render as the right-aligned pill.

### When to use

- **Who owns what.** Each row pairs a named actor with the slice of work they own. Use when the audience needs to know accountability, not process flow.
- **Three to six actors.** The ledger reads cleanly up to about six rows. Past that, split the roster across two slides or roll up adjacent roles.
- **One-line responsibilities.** Each actor's body is a short responsibility summary, not a job description. Detail belongs on a follow-up slide or in an appendix.

### When NOT to use

- **Process sequence.** If the rows describe stages in order, use list-steps or process-flow. actors is for parallel ownership, not handoff sequence.
- **Long per-actor prose.** More than one sentence per row crowds the ledger. Move the detail to a dedicated slide and keep actors as the index.
- **Roles without names.** If the labels are job titles in the abstract ("the engineer"), reach for cards-stack or list. The actors layout earns its weight when the names are named.

### Authoring

```markdown
<!-- _class: actors -->

## Who owns each part of the process.

- Owns the first part `First actor`
  - One-line note on what that ownership covers.
- Owns the second part `Second actor`
  - One-line note.
- Owns the third part `Third actor`
  - One-line note.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Actors heading.                        │
│                                         │
│  Role A    Owner name                   │
│            - responsibility one         │
│  Role B    Owner name                   │
│            - responsibility two         │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`list-tabular`](#list-tabular) — rows are reference entries, not owners
- [`cards-stack`](#cards-stack) — each item needs two sentences of body text
- [`list`](#list) — declared statements — the `principles` variant
- [`glossary`](#glossary) — the left column is a term, not an actor

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/actors>


## agenda

> Auto-numbered table of contents for the deck.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `agenda-setting` · `overview` · `onboarding` · `kickoff`

Use as the second slide of any multi-section deck. Numbers are generated; authors just write the section titles. Five interchangeable styles — the default `ledger` (a contents page with optional page references), plus `circles`, `rail`, `cards`, and `checks` — all compose with the `progress-N` 'you are here' modifier.

### Agent contract

**Capacity** ~4 items (over 6 overflows) — past that, split across slides. Past six sections the list crowds.

**Density** aim ~10 words per item; past ~16 it reads as a wall of text — a short agenda line, not a description.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — typically 'Agenda' or 'What we'll cover'. |
| `items` | `ol > li` | yes | Ordered list of section titles. |

#### Variant decision rule

- **default (no modifier).** A contents page with optional page references — the plainest, most document-like agenda look.
- **`circles`.** Section markers should read as a track of dots rather than numbers — a more visual, less document-like tone.
- **`rail`.** The agenda should read as a vertical journey down a side rail rather than a flat numbered list.
- **`cards`.** Each section deserves its own boxed card, with the current one taking the accent — a punchier, more graphic agenda.
- **`checks`.** The deck has forward momentum and past sections should visibly tick off as done, with an arrow marking the current one.

#### Common mistakes

- **Hand-typing the page number into the section title instead of a trailing inline-code page ref.** A page reference is a trailing `` `p.N` `` inline-code chip on the item line — text baked into the title itself doesn't get the right-aligned leader-dot treatment.
- **Assuming `progress-N` alone changes which marker style (circles/rail/cards/checks) is used.** `progress-N` only marks which stop is current — it composes with a style variant but doesn't imply one; the default numbered `ledger` look still applies unless you also add `circles`/`rail`/`cards`/`checks`.

### When to use

- **Second slide of the deck.** Right after the title, before the first section. Orients the audience and sets the cadence of what's coming.
- **Three to six sections.** Sweet spot is four. Past six sections the list crowds and the audience stops counting. Roll up or split the deck.
- **Reuse with progress variants.** Drop the same agenda between sections with `progress-N` to show how far through the deck the room is. Lightweight wayfinding.
- **Pick a style, optionally with page refs.** The default `ledger` reads as a contents page; add `circles`, `rail`, `cards`, or `checks` to change the structure. On `ledger`, end an item with an inline-code page ref — e.g. `` `p.15` `` — to print a right-aligned page number with a leader; omit it for just number + title.

### When NOT to use

- **Sub-bullets per section.** The agenda is a wayfinder, not a treatment. If a section needs decomposition, that belongs on a section divider when the section opens — not here.
- **Unnumbered list.** Authoring with `-` instead of `1.` loses the numbered chrome the layout depends on. Always use ordered list syntax.
- **Single-section decks.** If the deck has no sections to enumerate, skip the agenda. Empty wayfinding is more friction than no wayfinding.
- **More than six sections.** A single agenda slide holds up to six sections at a legible row height; beyond that the rows crowd the footer. Group related items under fewer headings, or split the agenda across two slides.

### Authoring

```markdown
<!-- _class: agenda -->

## What this deck covers.

1. First section title
2. Second section title
3. Third section title
4. Fourth section title
```

### Anatomy

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

### Variants (component-specific)

#### `progress-1` — progress-1

Stop 1 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-1 -->

## progress-1 marks stop 1 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past six stops, split the agenda `p.22`
```

#### `progress-2` — progress-2

Stop 2 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-2 -->

## progress-2 marks stop 2 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past six stops, split the agenda `p.22`
```

#### `progress-3` — progress-3

Stop 3 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-3 -->

## progress-3 marks stop 3 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past six stops, split the agenda `p.22`
```

#### `progress-4` — progress-4

Stop 4 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-4 -->

## progress-4 marks stop 4 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past six stops, split the agenda `p.22`
```

#### `progress-5` — progress-5

Stop 5 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-5 -->

## progress-5 marks stop 5 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past six stops, split the agenda `p.22`
```

#### `progress-6` — progress-6

Stop 6 is current; the rest dim or wait.

```markdown
<!-- _class: agenda progress-6 -->

## progress-6 marks stop 6 as the current one.

1. One line per stop, ten words max `p.2`
2. Page references ride as inline code `p.5`
3. Six stops is the soft ceiling `p.9`
4. The progress variants mark the current stop `p.14`
5. Markers come as circles, rail, cards, checks `p.18`
6. Past six stops, split the agenda `p.22`
```

#### `circles` — Style · circles

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

#### `rail` — Style · rail

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

#### `cards` — Style · cards

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

#### `checks` — Style · checks

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

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `divider` — marking a section boundary without restating the menu
- [`list`](#list) — single-line takeaways — the `takeaway` variant
- `title` — the slide immediately preceding the agenda

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/agenda>


## cards-grid

> 2–4 parallel items, similar weight, scannable in a grid.

**Function** inventory · **Form** grid · **Substance** structure

**Tags** `overview` · `showcase` · `summary`

Use when the audience needs to compare or scan a small set of options at a glance. Avoid for more than 4 items — split into multiple slides. For ordered/numbered steps, use list-steps instead.

### Agent contract

**Capacity** ~3 items (over 4 overflows) — past that, list-tabular / split across slides. The grid loses scannability past four cards.

**Density** aim ~15 words per item; past ~24 it reads as a wall of text — a card body is one short clause, not a paragraph.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `cards` | `ul > li` | yes | Each list item becomes one card. Authoring contract: a top-level bullet is the card title (renders bold by default); an indented bullet underneath carries the body text (renders normal weight via the nested-list rule). |
| `insight` | `blockquote` | no | Optional key-insight panel above the cards. |

#### Variant decision rule

- **default (no modifier).** Two cards, or the default column count already fits — no need to force a specific column count.
- **`three`.** Exactly three parallel items need equal width — widens the grid to three columns.
- **`four`.** Four parallel items, often a 2×2 quadrant read where card position itself carries meaning.
- **`numbered`.** The cards have an implicit rank or step order worth surfacing as corner numbers — author with `1.` instead of `-`.

#### Common mistakes

- **Writing the card as one inline line (`- **Title.** body`) instead of a nested bullet.** cards-grid requires the nested `- Title` / `  - body` format — the inline form fails the deck-authoring lint, and the body inherits the parent li's bold weight instead of rendering at normal weight.
- **Adding a `numbered` class to the slide, expecting it to turn on corner numbers.** There is no `numbered` CSS class — the numbering comes purely from authoring the cards as an ordered list (`1.`) instead of a bullet list (`-`); the `numbered` entry in variants documents that authoring choice, not a class to type.

### When to use

- **Parallel items.** Four cards or fewer, each item gets equal weight in the layout. Audience compares them at a glance.
- **Scannable at a glance.** The audience absorbs the whole set in one look — no scrolling, no eye-leaping between rows.
- **Equal information density.** Each card carries roughly the same text length. Uneven density makes the grid feel unbalanced.
- **Order is decorative.** When sequence carries meaning, use list-steps or list-criteria instead. cards-grid is for parallel options.

### When NOT to use

- **More than 4 items.** Split into multiple slides instead. The grid loses scannability past 4 cards.
- **Order carries meaning.** Use list-steps or list-criteria. cards-grid is for parallel options, not sequences.
- **Lopsided density.** Equalize the prose when one card has three sentences and the rest have one. Otherwise change layout.
- **Inline-code-only body.** A body bullet containing only `code` gets promoted to an eyebrow label. Mix it with surrounding prose.

### Authoring

```markdown
<!-- _class: cards-grid -->

## Slide heading.

- First card title
  - Body text for the first card, one sentence.
- Second card title
  - Body text for the second card, one sentence.
- Third card title
  - Body text for the third card, one sentence.
- Fourth card title
  - Body text for the fourth card, one sentence.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                  LABEL                  │
│               Grid Title                │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Card Title 1 │     │ Card Title 2 │  │
│  │ content      │     │ content      │  │
│  └──────────────┘     └──────────────┘  │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Card Title 3 │     │ Card Title 4 │  │
│  │ content      │     │ content      │  │
│  └──────────────┘     └──────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `four` — Four columns

Four columns; pair with compact.

```markdown
<!-- _class: cards-grid four compact -->

## four locks a two-by-two, compact tightens it.

- Quadrant read.
  - Four cells scan as a loop.
- Compact pairing.
  - Padding shrinks so labels stay whole.
- Named corners.
  - Position carries meaning; place cards deliberately.
- Still four.
  - The ceiling does not move.
```

#### `three` — Three columns

Three equal columns.

```markdown
<!-- _class: cards-grid three -->

## three widens the grid to three columns.

- Wider cards.
  - Each card earns a third of the row.
- Same budget.
  - Bodies stay one clause, titles stay parallel.
- Sweet spot.
  - Three peers is the count this grid loves.
```

#### `numbered` — Numbered cards

Ordered source stamps corner tags.

```markdown
<!-- _class: cards-grid -->

## An ordered list numbers the cards.

1. Numbers appear
   - Markdown's ordered list turns cards into steps.
2. Sequence reads
   - The grid now implies order, so mean it.
3. Budget holds
   - Same one-clause bodies as the unnumbered grid.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `list-steps` — items carry an explicit sequence
- [`cards-stack`](#cards-stack) — items stack vertically as full-width rows
- `compare-prose` — two-option comparison, side by side
- `verdict-grid` — comparing options against shared criteria

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/cards-grid>


## cards-stack

> Parallel items stacked vertically, full-width cards.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `overview` · `summary` · `reference`

Use when the items want vertical reading order — sequential exploration rather than a-glance comparison. 2–4 items work best (a fourth fits with the `compact` modifier).

### Agent contract

**Capacity** ~3 items (over 4 overflows) — past that, list-tabular / split across slides. Past four rows the stack overflows.

**Density** aim ~16 words per item; past ~26 it reads as a wall of text — a stacked card is a short paragraph at most.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `cards` | `ul > li` | yes | Each list item becomes one stacked card. Authoring contract: a top-level bullet is the card title (renders bold by default); an indented bullet underneath carries the body text. An optional trailing inline `code` on the title line renders as a right-anchored pill. |

#### Variant decision rule

- **default (no modifier).** Vertical, top-to-bottom priority reading — the base look.
- **`horizontal`.** The sequence reads more naturally left-to-right, e.g. a timeline — pivots the stack onto its side.
- **`numbered`.** The vertical rank should be explicit rather than implied by position — author as an ordered list to stamp corner numbers.

#### Common mistakes

- **Adding a `numbered` class to the slide, expecting it to turn on corner numbers.** There is no `numbered` CSS class — the ranking numbers come purely from authoring the cards as an ordered list (`1.`) instead of `-`.
- **Adding a fourth card without the `compact` modifier.** A fourth card at or near the density budget (16-26 words) needs `compact` to avoid overflowing the frame — the component's own stress sample demonstrates `cards-stack compact` at four full-budget rows. Four short cards can fit without it; `compact` is a density fix, not a hard card-count switch.

### When to use

- **Vertical reading order.** The audience scans top-to-bottom, not grid-style. Use when each card builds on the previous one as the eye moves down the slide.
- **Two sentences per card.** More body than cards-grid can hold without crowding. cards-stack lets each card carry one or two short sentences without losing the layout balance.
- **Two or three items.** Sweet spot is three. Past that the slide overflows — split across multiple slides or switch to cards-grid with shorter body text per card.

### When NOT to use

- **Five or more items.** A fourth card fits with the `compact` modifier; past four the stack overflows. For five or more parallel items reach for cards-grid four, or split across slides.
- **One-line cards.** If each card is a single short phrase, the stack reads as a padded list. Drop to `list` (or its `takeaway` variant) and reclaim the vertical space.
- **Forced sequence.** Cards-stack is parallel content read in vertical order, not a numbered sequence. For explicit steps, use list-steps or list-criteria.

### Authoring

```markdown
<!-- _class: cards-stack -->

## Slide heading.

- First card title
  - Body text for the first stacked card, two short sentences max.
- Second card title
  - Body text for the second stacked card.
- Third card title
  - Body text for the third stacked card.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Stacked-cards heading.                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Card title 1 — claim or label     │  │
│  │ body text fills the wide row      │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Card title 2 — claim or label     │  │
│  └───────────────────────────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `horizontal` — Horizontal cards

The stack pivots sideways.

```markdown
<!-- _class: cards-stack horizontal -->

## horizontal lays the stack on its side.

- Rows become columns.
  - The ranking now reads left to right.
- Same card anatomy.
  - Title, body, optional status pill.
- Use for timelines.
  - Sequence feels natural sideways.
```

#### `numbered` — Numbered stack

Corner numbers make rank explicit.

```markdown
<!-- _class: cards-stack -->

## An ordered list makes the ranking explicit.

1. Numbers stamp the rank
   - The stack's order stops being implicit.
2. Three still rules
   - Numbering does not raise the ceiling.
3. Parallel or nothing
   - Ranked cards must match shapes.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`cards-grid`](#cards-grid) — three or four parallel items in a scannable grid
- `compare-prose` — exactly two items, side by side
- `list-steps` — items carry an explicit, ordered sequence

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/cards-stack>


## checklist

> Items with state markers — done, partial, todo.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `status` · `stoplight` · `process` · `requirements`

Use for completion reports, readiness audits, or pre-flight checks. State markers [x]/[-]/[ ]/[/] produce status-colored circles carrying a distinct mark — check / dash / ring / slash — so the shape reads independently of color (color-blind-safe).

### Agent contract

**Capacity** ~6 items (crowds past 8, overflows past 9) — past that, split across slides. Past eight items the checklist overflows.

**Density** aim ~10 words per item; past ~16 it reads as a wall of text — a short readiness line.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `items` | `ul > li` | yes | Each item prefixed with a state marker — [x] done, [-] partial, [ ] todo, or [/] out-of-scope (struck through). Plain text follows the marker; an optional trailing inline-code pill floats right as a status tag. |

#### Common mistakes

- **Writing the status pill as plain trailing text instead of inline code.** The optional trailing status tag must be inline `code` (e.g. `` `blocked` ``) to render as a floated pill — plain trailing text just becomes part of the line's prose.
- **Confusing `[/]` (out-of-scope, struck through) with `[-]` (partial / in-progress).** `[-]` marks partial progress (amber dash); `[/]` marks an item explicitly descoped (muted, struck through) — using `[/]` for 'in progress' mis-signals the row as cut rather than underway.

### When to use

- **Completion reports.** Use when the audience needs to see what's done, what's in progress, and what's outstanding. The state marks are the load-bearing signal.
- **Readiness audits.** Pre-launch, pre-release, pre-flight. A short list where the mix of green / amber / red tells the room whether to proceed.
- **Five to eight items.** Short enough that the audience can take in the state mix at a glance. Past eight, split into two checklists by phase or owner.

### When NOT to use

- **All-done lists.** If every item is `[x]` the state markers are decoration. Use `list` (or its `takeaway` variant) for celebratory recaps; checklist earns its weight when the mix matters.
- **Long per-item prose.** Each item is one short line. If a row needs a sentence of explanation, the right home is cards-stack or list-tabular.
- **Custom state markers.** Only `[x]`, `[-]`, `[ ]`, and `[/]` (out-of-scope, struck through) map to the mark palette. Authoring `[?]` or `[!]` renders as literal text and breaks the visual contract.

### Authoring

```markdown
<!-- _class: checklist -->

## Pre-launch readiness.

- [x] First item that is fully done.
- [x] Second item that is fully done.
- [-] Third item that is partially complete with a caveat.
- [ ] Fourth item that is not yet started.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Checklist heading.                     │
│                                         │
│  [x] Completed item — green tint        │
│  [-] Partial item — amber tint          │
│  [ ] Open item — red tint               │
│  [x] Another completed item             │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`list`](#list) — items have no state — just bullets
- [`list-tabular`](#list-tabular) — rows need a label-plus-description structure, not state
- [`cards-stack`](#cards-stack) — each item needs two sentences of body

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/checklist>


## glossary

> Two-column term/definition table with auto-derived alphabetic range pill.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `definition` · `reference` · `onboarding`

Use for jargon-heavy decks where the audience needs a reference page. The runtime auto-adds a range pill (e.g. 'A – G') to the heading.

### Agent contract

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — a term and a one-sentence definition.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — typically 'Glossary'. |
| `entries` | `ul > li` | yes | Nested bullets: outer li is the term, inner li is its one-line definition. A runtime transform converts the list into a two-column table and derives the alphabetic range pill from the first and last terms, so terms should be authored in alphabetical order; without the Lattice runtime the raw nested list renders unstyled. |

#### Common mistakes

- **Authoring terms out of alphabetical order.** The range pill is derived from the FIRST and LAST terms in the list, not computed by sorting — an out-of-order list produces a range pill that doesn't actually describe the terms it contains.
- **A term with no nested definition bullet beneath it, or a term with a SECOND nested definition bullet.** Every term needs EXACTLY one nested definition bullet directly beneath it. Zero bullets leaves that row's definition cell empty; a second bullet is silently DROPPED (only the first is captured), so the extra content just vanishes rather than erroring or appending.

### When to use

- **Jargon-heavy decks.** When the audience needs a reference page they can flip back to. Acronyms, domain terms, internal names — anything the speaker won't define inline.
- **Five to eight entries per slide.** The ledger is sized for a short page. For longer glossaries, split alphabetically across multiple slides — the runtime stamps each with its range pill.
- **Short definitions.** Each definition is one sentence — a working gloss, not an essay. Long definitions belong on their own divider (light variant) slide where the term is the heading.

### When NOT to use

- **Multi-sentence definitions.** Each entry is one short line. If a definition needs context or examples, the term deserves its own slide — use a divider (light variant) with the term as the heading.
- **Mixed term lengths.** If some terms are single words and others are full phrases, the left column gets ragged. Trim long terms to their canonical short form.
- **Hand-written range pill.** The runtime derives the range pill (e.g. "A – G") from the entries. Authoring it into the heading double-stamps it.

### Authoring

```markdown
<!-- _class: glossary -->

## Glossary

- Adjacency
  - The relationship between two slides that share an audience or context.
- Anchor
  - A title, divider, or closing slide that orients the audience.
- Cadence
  - The deck's pacing — how much new information per slide.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Glossary heading.            A–Z       │
│                                         │
│  TERM      DEFINITION                   │
│  Term A    Definition or gloss.         │
│  Term B    Definition or gloss.         │
│  Term C    Definition or gloss.         │
│  Term D    Definition or gloss.         │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`list-tabular`](#list-tabular) — rows are key/value reference, not term/definition
- `divider` — lighter mid-section orientation — the bright-canvas `light` variant
- [`actors`](#actors) — the left column is a named person, not a term
- [`list`](#list) — declared statements — the `principles` variant

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/glossary>


## inventory

> A parallel set of related items of similar weight — one content shape, four interchangeable looks.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `overview` · `summary` · `showcase`

Use for a small register of related items where each carries similar weight. Author the content once (a bold lead + detail per item, optional trailing insight) and pick the look with a variant: the default numbered ledger, a cards grid, a horizontal timeline, or a magazine-style editorial split — no re-authoring. For more than six items, escalate to list-tabular or split across slides.

### Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, list-tabular / split across slides. The ledger/editorial looks take a couple more rows than the cards or timeline looks; past six entries, escalate.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one clause of body per part.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-child > code` | no | Optional kicker above the title (lifts into the masthead band under Form). |
| `title` | `h2` | yes | Slide heading. |
| `items` | `ul > li` | yes | Each list item is one entry, authored as `- **Lead.** detail sentence.` — the bold lead is the entry name, the rest is its description. |
| `insight` | `blockquote` | no | Optional trailing insight or takeaway. Renders as an accent band (ledger), a centered pull-quote (cards), a kicker above the run (timeline), or an accent-ruled sidebar (editorial). |

#### Variant decision rule

- **default (no modifier).** A plain numbered reference list — the most document-like, least decorated look.
- **`cards`.** The register wants a more visual, tile-based presentation; an optional trailing insight reads best as a centered pull-quote.
- **`timeline`.** The parts have an implicit left-to-right progression worth suggesting, even though they remain parallel, not sequential.
- **`editorial`.** The slide wants a magazine feel — a column of entries with a sidebar takeaway rather than a flat register.

#### Common mistakes

- **Writing a long, multi-sentence insight blockquote.** The insight is a single closing line across every look — under `timeline` it must fit as a kicker ABOVE the run, and under `cards` as a centered pull-quote; a multi-sentence blockquote breaks those tighter treatments even though the plain ledger's accent band might absorb it.
- **Re-authoring the item list differently for each look/variant.** The four looks — ledger, cards, timeline, editorial — share ONE content contract; switching the variant class alone reskins the same markdown. Re-writing items per-variant is wasted effort and risks the exact drift (lopsided density, mismatched leads) the layout exists to avoid.

### When to use

- **A parallel register.** Two to six related items of similar weight — a framework's parts, a set of principles, the moving pieces of a system.
- **One content, your choice of look.** Write the items once; switch the variant to re-render the same content as a ledger, cards, timeline, or editorial split — no re-authoring.
- **A bold lead per item.** Each entry reads as a short bold name followed by a one-sentence detail. Equal density across entries keeps every look balanced.
- **An optional closing insight.** A trailing blockquote becomes the look's accent — a band, a pull-quote, a kicker, or a sidebar.

### When NOT to use

- **More than six items.** The looks lose scannability past six entries (the cards/timeline looks past four). Escalate to list-tabular or split across slides.
- **Ordered steps.** If sequence carries meaning, use list-steps or list-criteria. inventory entries are parallel, of similar weight.
- **Nested-bullet authoring.** inventory takes an inline bold lead (`- **Lead.** detail`), not the nested `- Title` / `  - body` shape that card-style components use.
- **Lopsided density.** Equalize the prose when one entry has three sentences and the rest have one — uneven density unbalances every look.

### Authoring

```markdown
<!-- _class: inventory -->

`Eyebrow`

## Slide heading.

- **First entry.** One-sentence description.
- **Second entry.** One-sentence description.
- **Third entry.** One-sentence description.
- **Fourth entry.** One-sentence description.

> Optional trailing insight.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│                  LABEL                  │
│               Grid Title                │
│                                         │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Card Title 1 │     │ Card Title 2 │  │
│  │ content      │     │ content      │  │
│  └──────────────┘     └──────────────┘  │
│  ┌──────────────┐     ┌──────────────┐  │
│  │ Card Title 3 │     │ Card Title 4 │  │
│  │ content      │     │ content      │  │
│  └──────────────┘     └──────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `cards` — Cards

The register as tiles with a pull-quote.

```markdown
<!-- _class: inventory cards -->

`inventory cards`

## cards deals the parts into tiles.

- **One part per row.** A name and one clause of body.
- **Four parts reads best.** Five fits; six is the hard stop.
- **Bodies stay clauses.** Fourteen words soft, twenty-two hard.
- **Looks reskin the list.** cards, timeline, editorial change form, not content.
```

#### `timeline` — Timeline

A numbered run along a line.

```markdown
<!-- _class: inventory timeline -->

`inventory timeline`

## timeline strings the parts along a line.

- **One part per row.** A name and one clause of body.
- **Four parts reads best.** Five fits; six is the hard stop.
- **Bodies stay clauses.** Fourteen words soft, twenty-two hard.
- **Looks reskin the list.** cards, timeline, editorial change form, not content.
```

#### `editorial` — Editorial

A magazine split with a sidebar takeaway.

```markdown
<!-- _class: inventory editorial -->

`inventory editorial`

## editorial sets the parts as a column.

- **One part per row.** A name and one clause of body.
- **Four parts reads best.** Five fits; six is the hard stop.
- **Bodies stay clauses.** Fourteen words soft, twenty-two hard.
- **Looks reskin the list.** Same content, magazine form.

> The sidebar carries the register's one takeaway.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`cards-grid`](#cards-grid) — you want a fixed cards grid with nested-bullet authoring
- `list-steps` — the items carry an explicit sequence
- [`list-tabular`](#list-tabular) — more than six rows, or a meta column per row
- `timeline-list` — a vertical dated timeline rather than a parallel register

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/inventory>


## list

> Bulleted list under a heading — plain pills, hairline takeaways, or display-weight principles.

**Function** inventory · **Form** stack · **Substance** prose

**Tags** `overview` · `summary` · `takeaway` · `walkthrough`

Use when the items are genuinely a flat list of one-line points. The default renders accent-bordered pills; the `takeaway` variant renders hairline-ruled single-line takeaways (former tldr); the `principles` variant renders display-weight numbered statements with a large counter (former principles). For richer per-item structure, prefer cards-grid, cards-stack, or list-tabular.

### Agent contract

**Capacity** ~5 items at a wide @size (over 6 overflows).

**Density** aim ~14 words per item; past ~20 it reads as a wall of text — one statement per line, not a paragraph.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `items` | `ul > li, ol > li` | yes | List items. Keep each under ~12 words. |

#### Variant decision rule

- **default (no modifier).** A flat set of accent-bordered pill points — the plainest bulleted list, no special framing.
- **`takeaway`.** The list closes a section with headline-weight conclusions — hairline-ruled single lines instead of pills.
- **`principles`.** The items are declared tenets or house rules — display-weight numbered statements with a large accent counter.
- **`numbered`.** A `takeaway` box needs to read as ranked priorities, not just findings — adds an accent counter.
- **`lettered`.** Under `principles`, the order is arbitrary rather than sequential — letters read as options, not a ranking.
- **`roman`.** The principles are a formal charter or mandate that wants numeral gravitas — reserve for a short list, past five it reads as parody.
- **`bullet`.** The principles are true peers with no ranking or sequence at all — strips the counter back to plain dots.

#### Common mistakes

- **Combining `numbered` with `principles`, or `lettered`/`roman`/`bullet` with `takeaway`, expecting the counter to change.** `numbered` only composes with `takeaway` (adds its accent counter); `lettered`/`roman`/`bullet` only compose with `principles` (swap ITS counter format) — the two modifier sets don't cross over.
- **Picking `ol` or `ul` arbitrarily under the default/`takeaway` look, without regard to whether order matters.** For the default and `takeaway` looks, list type is a real authoring signal — `ol` renders a tabular leading number column implying sequence; `ul` doesn't. Use `ol` only when the sequence is load-bearing. This does NOT apply to `principles` (and its `lettered`/`roman`/`bullet` sub-variants) — that family is `ol`-only regardless of whether the tenets are ordered; a `ul` there renders completely unstyled.

### When to use

- **Genuinely a list.** Five to six short points, each under twelve words. No internal structure per item — just a heading and the bullets.
- **Numbered when order matters.** Use `ol` (`1.` source) when sequence is load-bearing; `ul` when order is interchangeable. Numbers render as a tabular leading column.
- **Pills via inline code.** Inline code at the end of a row becomes a pill (status tag, metric, owner). Lets the list double as a lightweight ledger without changing layout.
- **Takeaways at a section close.** The `takeaway` variant renders each item as a hairline-ruled single line at message weight — the deck or section's headline points. Add `numbered` for a large accent counter. (Absorbed the standalone `tldr` component on 2026-06-07.)
- **Declared principles or tenets.** The `principles` variant renders an ordered list of single-sentence declarations at display weight with a large accent counter. Compose `lettered`, `roman`, or `bullet` to switch the counter format. (Absorbed the standalone `principles` component on 2026-06-07.)

### When NOT to use

- **Title plus body per item.** If each bullet is `**Title.** body`, the layout under-serves it. Move to cards-stack (2-3 items) or list-tabular (5+ rows) instead.
- **Wall of long bullets.** Past twelve words per line the slide becomes paragraph soup. Either trim or move to content for prose, cards-stack for structured items.
- **Two-item lists.** Two bullets read as a thin slide. For pairs, reach for compare-prose — it gives the pair the weight it deserves.

### Authoring

```markdown
<!-- _class: list -->

## Slide heading.

- First short bullet point.
- Second short bullet point.
- Third short bullet point.
- Fourth short bullet point.
- Fifth short bullet point.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  List heading.                          │
│                                         │
│  - First bulleted item                  │
│  - Second bulleted item                 │
│  - Third bulleted item                  │
│  - Fourth bulleted item                 │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `takeaway` — takeaway

Ruled single lines for conclusions.

```markdown
<!-- _class: list takeaway -->

## takeaway boxes the list as findings.

- The box frames the lines as conclusions.
- Lead with the strongest finding.
- Five lines read as a verdict.
- Longer sets go back to plain list.
```

#### `principles` — principles

Numbered declarations at display weight.

```markdown
<!-- _class: list principles -->

## principles numbers the house rules.

1. State each rule as an imperative.
2. Keep rules under ten words.
3. Order them by how often they apply.
4. Retire a rule you keep breaking.
```

#### `numbered` — numbered

Accent counters on the takeaway box.

```markdown
<!-- _class: list takeaway numbered -->

## numbered ranks the boxed findings.

- Ranks turn findings into priorities.
- The top line owns the meeting.
- Three ranked lines beat six flat ones.
```

#### `lettered` — lettered

Letters replace the counters.

```markdown
<!-- _class: list principles lettered -->

## lettered counts the rules with letters.

1. Letters read as options, not sequence.
2. Use them when order is arbitrary.
3. Three options is a decision; six is a menu.
```

#### `roman` — roman

Roman numerals replace counters.

```markdown
<!-- _class: list principles roman -->

## roman sets the rules in numerals.

1. Numerals lend formal weight.
2. Reserve them for charters and mandates.
3. Past five, the gravitas becomes parody.
```

#### `bullet` — bullet

Dots replace the counters.

```markdown
<!-- _class: list principles bullet -->

## bullet strips the markers back to dots.

1. Dots drop the counting entirely.
2. The principles frame stays.
3. Use when rules are peers.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`cards-stack`](#cards-stack) — each item has a title plus body sentence
- [`list-tabular`](#list-tabular) — five or more rows with label-plus-description
- [`checklist`](#checklist) — items carry state markers (done / partial / todo)

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/list>


## list-tabular

> Hairline-ruled ledger of items — name on the left, body on the right.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `reference` · `overview` · `status`

Use for compact reference tables: glossary-style entries, key/value pairs, specs. Four primary variants (def, metric, spec, register) tune the visual treatment; secondary modifiers (rule, solid, stacked, outline) refine each.

### Agent contract

**Density** aim ~12 words per item; past ~16 it reads as a wall of text — a short row label plus a clause.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `rows` | `ol > li` | yes | Each numbered item (`1.`) is one row — the name on the line, with an optional nested bullet for its description or value. The leading column is the auto counter. |

#### Variant decision rule

- **default (no modifier).** A plain hairline-ruled ledger — name left, description right, nothing tinted.
- **`def`.** Reference entries read like dictionary definitions — an eyebrow above each term and an enlarged counter spanning both lines.
- **`metric`.** Each row's value is the point — renders the trailing value as a display-weight figure instead of the default's plain mono text.
- **`spec`.** Rows are technical flags or parameters — monospace keys beside type chips.
- **`register`.** Each row carries a status — status pills per row.
- **`rule`.** Under `def`, the register wants a visible accent rail running down the left edge of the whole list, not just the per-term counter.
- **`solid`.** Under `metric`, the values are headline numbers that deserve a filled panel instead of an outlined tile.
- **`stacked`.** Under `spec`, the description clause is long enough to want its own line below the key instead of trailing beside it.
- **`outline`.** Under `register`, a lighter, keyline-only pill treatment fits the deck's tone better than filled pills.
- **`fit-name`.** The labels are short and uneven — hug them instead of letting the widest one set a capped track.
- **`fit-body`.** The clauses are values, not sentences — hug them and let the trailing column take the leftover so it still holds the right edge.
- **`fit-meta`.** A trailing value is long enough that the default cap wraps it, and it should stay on one line.
- **`flex-name`.** The label is the point and the clause is a short qualifier — hand the leftover width to the label.
- **`flex-meta`.** The trailing column carries a phrase rather than a stamp, and it should absorb the leftover width.
- **`fixed`.** A deck was laid out against the old fixed-cqi tracks and should keep them rather than re-flow.

#### Common mistakes

- **Pairing a secondary modifier with the wrong primary variant (e.g. `def solid` or `metric rule`).** Each secondary modifier is scoped to exactly one primary — `rule` only styles `def`, `solid` only styles `metric`, `stacked` only styles `spec`, `outline` only styles `register`; pairing across combinations does nothing because no CSS selector matches.
- **Authoring rows as a bullet list (`-`) instead of a numbered list (`1.`).** The counter column and row styling are keyed to `ol > li` — a `ul` doesn't produce the numbered ledger at all.
- **Reaching for a column modifier before looking at the default.** The columns already size to their content. `fit-*` / `flex-*` name the exceptions — a label that should keep the slack, a clause that should hug — and `fixed` restores the old fixed-width tracks. Most ledgers need none of them.

### When to use

- **Compact reference rows.** Five or more rows where each row is a name plus a short description or value. Glossary-style entries, key/value pairs, technical specs.
- **Pick one primary variant.** `def` for editorial, `metric` for tiled values, `spec` for technical keys, `register` for tagged pills. Default (no variant) is the hairline ledger.
- **Numbered automatically.** Author as `ol` (`1.` source). The leading column is the counter — `def` and `spec.stacked` enlarge it to span both rows.

### When NOT to use

- **Three or fewer rows.** The ledger needs density to justify its shape. For two to four items, reach for cards-stack — the rows get the room to breathe.
- **Long per-row prose.** Each row is a name plus a sentence. If the description runs two or three sentences, move to cards-stack or split across slides.
- **Stacking two primary variants.** `def`, `metric`, `spec`, and `register` are mutually exclusive. Pair each only with its secondary modifier (def+rule, metric+solid, spec+stacked, register+outline).

### Authoring

```markdown
<!-- _class: list-tabular -->

## Slide heading.

1. First entry
   - Description or value for the first entry.
2. Second entry
   - Description or value for the second entry.
3. Third entry
   - Description or value for the third entry.
4. Fourth entry
   - Description or value for the fourth entry.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Ledger heading.                        │
│                                         │
│  01  Term      value     metadata       │
│  02  Term      value     metadata       │
│  03  Term      value     metadata       │
│  04  Term      value     metadata       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `def` — Editorial (def)

Counter spans rows; eyebrow above.

```markdown
<!-- _class: list-tabular def -->

## def pairs each term with its role.

1. Label `Term`
   - def styles the register as definitions.
2. Chip `Role`
   - The inline code becomes a right-hand chip.
3. Body `Clause`
   - One clause under each term.
```

#### `metric` — Tile (metric)

Values in bordered tiles.

```markdown
<!-- _class: list-tabular metric -->

## metric turns the chips into figures.

1. Rows carry values `12 / 16`
2. Figures right-align `100%`
3. Labels stay short `4 rows`
```

#### `spec` — spec

Mono keys for flags and params.

```markdown
<!-- _class: list-tabular spec -->

## spec documents flags and their types.

1. `LATTICE_THEME` `string`
   - spec sets code labels beside type chips.
2. `LATTICE_DEBUG` `bool`
   - One clause explains each flag.
```

#### `register` — register

Status pills on each row.

```markdown
<!-- _class: list-tabular register -->

## register pairs names with status chips.

1. cards-grid `stable`
2. split-panel `stable`
3. radar `beta`
4. word-cloud `preview`
```

#### `rule` — def + rule

Accent rail down the left edge.

```markdown
<!-- _class: list-tabular def rule -->

## rule draws a hairline under every row.

1. Hairlines `On`
   - rule adds the horizontal separators.
2. Density `Same`
   - Budgets do not change with the look.
```

#### `solid` — metric + solid

Filled value tiles for headlines.

```markdown
<!-- _class: list-tabular metric solid -->

## solid fills the register with panel color.

1. Net new rows `4`
2. Panel fill `on`
3. Best for `headline metrics`
```

#### `stacked` — spec + stacked

Clause drops below the name.

```markdown
<!-- _class: list-tabular spec stacked -->

## stacked drops the clause under its label.

1. `GET /plans/:name` `200 | 404`
   - stacked gives each row two decks of text.
2. `GET /gallery/:name` `200`
   - The clause wraps below, full width.
```

#### `outline` — register + outline

Outline pills — a lighter register.

```markdown
<!-- _class: list-tabular register outline -->

## outline boxes each row in a keyline.

1. cards-grid `stable`
2. split-panel `stable`
3. quote `stable`
```

#### `fit-name` — fit-name

The label column hugs its content, uncapped.

```markdown
<!-- _class: list-tabular fit-name -->

## fit-name lets short labels keep their own width.

1. API
   - The label column shrinks to the longest label.
2. CLI
   - Nothing is padded out to a fixed track.
3. SDK
   - The clause takes every pixel that is left.
```

#### `fit-body` — fit-body

The clause column hugs; the trailing column takes the slack.

```markdown
<!-- _class: list-tabular fit-body -->

## fit-body hugs the clause and holds the right edge.

1. Settlement window `T+1`
   - Same day cutoff
2. Reconciliation cadence `Nightly`
   - Automated
3. Exception review `Weekly`
   - Risk committee
```

#### `fit-meta` — fit-meta

The trailing column hugs its content, uncapped.

```markdown
<!-- _class: list-tabular fit-meta -->

## fit-meta keeps a long trailing value on one line.

1. Coverage `98.4% of policies`
2. Backlog `31 open findings`
3. Cadence `every two weeks`
```

#### `flex-name` — flex-name

The label column takes the leftover.

```markdown
<!-- _class: list-tabular flex-name -->

## flex-name hands the slack to the label.

1. Board approval of the revised treasury policy
   - Q3
2. Migration of the settlement ledger to the new engine
   - Q4
3. Retirement of the legacy reconciliation batch
   - Q1
```

#### `flex-meta` — flex-meta

The trailing column takes the leftover.

```markdown
<!-- _class: list-tabular flex-meta -->

## flex-meta gives the trailing column the room.

1. Scope `Retail and commercial deposits, twelve markets`
   - Phase 1
2. Owner `Group Treasury, reporting to the CFO`
   - Phase 1
3. Review `Audit and Risk Committee, quarterly`
   - Phase 2
```

#### `fixed` — fixed

The pre-responsive fixed-width tracks.

```markdown
<!-- _class: list-tabular fixed -->

## fixed pins the columns to their old widths.

1. ID
   - Every label column is the same width again.
2. Mid
   - Use it when a deck was tuned around those tracks.
3. Long enough to wrap
   - The label wraps inside its fixed track.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`glossary`](#glossary) — term/definition pairs with auto-derived range pill
- [`cards-stack`](#cards-stack) — two or three richer items, not a ledger
- [`actors`](#actors) — the left column is a named person, not a key
- [`list`](#list) — rows are bullets without a label-plus-description shape

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/list-tabular>


## logo-wall

> A grid of customer, partner, or funder logos as social proof.

**Function** inventory · **Form** grid · **Substance** prose

**Tags** `visual` · `showcase` · `pitch`

Use for the credibility slide — the 'trusted by' / 'our funders' / 'participating agencies' wall. Marks render as token-colored silhouettes (a CSS mask filled with `var(--logo-ink)`), so the wall is one cohesive texture that re-tones per theme and color-mode and stays AA on any ground; the `color` variant gives each mark its own categorical palette hue.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the headline — wrap a short label in backticks, e.g. `Trusted by`. |
| `title` | `h2` | no | Optional headline above the wall. A claim earns its place (‘400+ teams run board prep on Lattice’); a bare label (‘Customers’) does not. |
| `logos` | `ul > li` | yes | One list item per mark, authored as `- ![Brand name](brand.svg)`. The alt text is the accessible label, not a rendered caption. SVG is preferred so marks stay crisp at projector scale. |
| `caption` | `ul > li > ul > li` | no | Optional name + pill stacked below a mark, centered. Nest a list under the image: plain text is the name, a backticked token (`Series B`) is the pill. Either or both, per mark. |

#### Variant decision rule

- **default (no modifier).** The default token-recolored silhouette treatment — one cohesive texture, theme-safe.
- **`color`.** The individual brand colors are themselves part of the credibility signal — a recognizable, colorful set of household names worth preserving.
- **`dense`.** The roster is long (12-18+ marks) and captions aren't needed — packs more columns, captions off.

#### Common mistakes

- **Writing a caption's pill as plain nested text instead of backticks.** Under a mark's nested caption list, plain text becomes the NAME line; only a backticked token (e.g. `` `Series B` ``) becomes the pill — writing the round label without backticks renders it as a second name line instead of a pill.
- **Placing the eyebrow paragraph after the headline instead of before it.** The eyebrow matches `p > code:only-child` as the section's kicker, positioned before the `## headline` — placed after, the masthead lift re-seats it as the italic, secondary-color subtitle instead of the intended mono kicker.

### When to use

- **The proof is the logos.** Customers, partners, funders, accreditations, participating agencies — anywhere a set of recognizable marks carries more weight than a sentence. The audience scans the wall and concludes 'serious company keeps this company.'
- **Marks read as one texture.** Every mark is filled with the same palette token, so a loud red logo can't outshout a quiet one — the wall reads as a single credential, not a ransom note of competing brand colors. Because the fill is a token, it re-tones for theme + dark mode and stays AA on any ground.
- **Eight to eighteen marks.** Enough to signal breadth, few enough that each is legible. Fewer than six looks thin; past eighteen the marks shrink below recognition — curate to the most recognizable names or split across two slides.

### When NOT to use

- **Names that need a sentence.** If each entity needs a role, a quote, or a metric beside it, this is the wrong layout. Use `actors` (who owns what), `cards-grid` (a short body per item), or `quote` (a single testimonial).
- **Logos nobody recognizes.** A wall of unknown marks proves nothing and asks the audience to squint. If the names don't carry on sight, state the count as a `big-number` ('400+ teams') instead.
- **Mismatched raster art.** The mark is rendered as a silhouette (a CSS mask / inline SVG), so it must be clean vector with real transparency — a raster PNG or a logo whose negative space is a white fill won't read. Source SVG marks drawn as filled shapes; color is supplied by the palette token, not the file.

### Authoring

```markdown
<!-- _class: logo-wall -->

`Trusted by`

## The headline claim the logos back up.

- ![First brand](logo-1.svg)
  - First brand
  - `Series B`
- ![Second brand](logo-2.svg)
  - Second brand
- ![Third brand](logo-3.svg)
- ![Fourth brand](logo-4.svg)
- ![Fifth brand](logo-5.svg)
- ![Sixth brand](logo-6.svg)
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│               TRUSTED BY                │
│        The teams that run on us.        │
│                                         │
│      [Acme]   [Globex]   [Initech]      │
│      Acme      Globex     Initech       │
│       (SeriesB) (Public)   (Seed)       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `color` — color

Marks keep their brand hues.

```markdown
<!-- _class: logo-wall color -->

`logo-wall color`

## color lets the marks keep their brands.

- ![Acme](acme.svg)
- ![Globex](globex.svg)
- ![Initech](initech.svg)
- ![Umbra](umbra.svg)
- ![Vantage](vantage.svg)
- ![Meridian](meridian.svg)
- ![Helios](helios.svg)
- ![Northwind](northwind.svg)
```

#### `dense` — dense

Six columns for the long roster.

```markdown
<!-- _class: logo-wall dense -->

`logo-wall dense`

## dense packs the long roster, captions off.

- ![Acme](acme.svg)
- ![Globex](globex.svg)
- ![Initech](initech.svg)
- ![Umbra](umbra.svg)
- ![Vantage](vantage.svg)
- ![Meridian](meridian.svg)
- ![Helios](helios.svg)
- ![Northwind](northwind.svg)
- ![Cobalt](cobalt.svg)
- ![Sable](sable.svg)
- ![Quanta](quanta.svg)
- ![Lumen](lumen.svg)
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`actors`](#actors) — each named entity owns a responsibility, not just lends its logo
- [`cards-grid`](#cards-grid) — each item needs a line of body text, not just a mark
- `big-number` — the proof is a count ('400+ teams'), not the individual marks
- `quote` — one customer's testimonial carries the slide
- `image` — a single visual, not a grid of marks, is the evidence

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/logo-wall>


## q-and-a

> Anticipated questions paired with prepared answers — the end-of-pitch 'what we expect to be asked' slide.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `pitch` · `board-deck` · `recommendation`

Use to pre-empt the room: line up the three or four hardest questions the audience will raise and answer each one before it is asked. The question reads as a prompt; the prepared answer carries the substance. Distinct from a reference FAQ (many terse look-up pairs) — this is a few weighty defenses of a recommendation.

### Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (automatic). Past six Q/A pairs the column overflows a portrait box.

**Density** aim ~12 words per item; past ~16 it reads as a wall of text — a one-line question and a short answer.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the headline — wrap a short label in backticks, e.g. `Anticipated questions`. |
| `title` | `h2` | no | Optional headline framing the set — name the pressure ('What the board will press on'), not a bare label ('Q&A'). |
| `question` | `ul > li, ol > li` | yes | One top-level list item per question, in the order you want to take them (lead with the toughest). Author it as plain interrogative text — no bold. Questions are indexed automatically (01, 02, …), so a `ul` and an `ol` render the same. |
| `answer` | `ul > li > ul > li, ol > li > ol > li` | yes | The prepared answer, nested one level under its question. Two or three sentences that actually close the question down — a reasoned response, not a restatement. Every question needs one. |

#### Variant decision rule

- **default (no modifier).** Three or four pairs read fine as a plain vertical stack — the base look needs no extra structure.
- **`spine`.** The pairs want a strong visual throughline connecting question to question — threads them down an accent spine.
- **`rail`.** Questions should be scannable as a left-hand index while answers sit in their own column — number, question and answer share one baseline, so a row reads as a single line.
- **`tab`.** Each question should read as a labeled tab with its answer folding directly beneath it.
- **`grid`.** Exactly four pairs fit naturally into a two-by-two — an even count, not five or three. Each cell packs to its own top, so the four questions start on the same line whatever length they run; the answers follow their own question rather than lining up across the row.
- **`solo`.** One single question is weighty enough to deserve the entire slide.

#### Common mistakes

- **Bolding or otherwise emphasizing the question text.** Author the question as plain interrogative text. The layout supplies its own numbered-index and prompt-weight styling — bolding the question doesn't fight it (the lift step already no-ops on an already-bolded lead) but italicizing or otherwise marking it up can nest inside that styling in ways that look inconsistent across questions, so keep it plain.
- **Assuming `ul` vs `ol` changes which marker or numbering renders.** Unlike `list`, where list type is a real signal, q-and-a indexes questions automatically regardless of list type — `ul` and `ol` render identically here, so the choice carries no meaning.

### When to use

- **The questions are the point.** The slide that ends a pitch by naming the hard questions and answering them first. Anticipating the objection and closing it on your terms is more persuasive than waiting to be asked — it signals you have already done the thinking.
- **Three or four weighty pairs.** A few substantive questions, each with a reasoned two-to-three-sentence answer. Past five the answers compress below persuasion; for a long reference list of one-line look-ups use `list-tabular` or `glossary` instead.
- **Question as prompt, answer as substance.** The layout deliberately weights the two unequally — the question is the lighter prompt, the answer is the payoff. Lead each pair with the interrogative line and nest the prepared answer one level under it.

### When NOT to use

- **A flat FAQ of one-liners.** Six or more terse question/answer pairs you flip back to as a reference belong in `list-tabular` or `glossary`, which are built to stack many short look-ups. q-and-a is for a few defended answers, not a help page.
- **Rhetorical questions with no answer.** Every question needs a nested answer that genuinely closes it. A bare question used as a section header or a hook is a `divider` or a `statement`, not a Q&A pair.
- **Evaluation criteria in disguise.** If the top-level item is a requirement you are scoring against (with a rationale below), that is `list-criteria`, not a question you expect to be asked. q-and-a defends; list-criteria evaluates.

### Authoring

```markdown
<!-- _class: q-and-a -->

## What we expect to be asked.

- First question the audience will raise?
  - The prepared answer — two or three sentences that close it down.
- Second question?
  - The prepared answer.
- Third question?
  - The prepared answer.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       What we expect to be asked.       │
│                                         │
│  Q  Why not wait two quarters?          │
│  A  The window closes in Q3.            │
│                                         │
│  Q  What if pricing shifts?             │
│  A  Contracts lock 2026 rates.          │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `spine` — spine

Pairs threaded down an accent spine.

```markdown
<!-- _class: q-and-a spine -->

## spine threads the pairs down an accent spine.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
```

#### `rail` — rail

Numbered exhibit rows in columns.

```markdown
<!-- _class: q-and-a rail -->

## rail hangs the questions on a left rail.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
```

#### `tab` — tab

Underlined prompts; answers hang below.

```markdown
<!-- _class: q-and-a tab -->

## tab folds each answer under a question tab.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
```

#### `grid` — grid

Four pairs in a two-by-two.

```markdown
<!-- _class: q-and-a grid -->

## grid deals the pairs into two columns.

- How long may a question run?
  - One line.
- And the answer?
  - Four words or so.
- How many pairs fit?
  - Five; six is the ceiling.
- Why four pairs here?
  - Grids want even counts.
```

#### `solo` — solo

One pair, the whole slide.

```markdown
<!-- _class: q-and-a solo -->

## solo gives one question the whole slide.

- What does solo change?
  - One pair, full canvas.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`list-tabular`](#list-tabular) — many terse question/answer look-ups to flip back to, not a few weighty defenses
- [`glossary`](#glossary) — term/definition reference pairs rather than question/answer pairs
- `list-criteria` — numbered criteria with rationale — evaluation, not anticipated objections
- [`cards-stack`](#cards-stack) — parallel co-equal cards with no question/answer role split
- `decision` — a single verdict to state rather than a set of questions to defend

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/q-and-a>


## team-profile

> A roster of named people, each under a portrait, with the role they own.

**Function** inventory · **Form** grid · **Substance** structure

**Tags** `org-chart` · `onboarding` · `kickoff` · `pitch`

Use for the people slide — 'meet the leaders', 'your account team', the QBR roll-call. Each person is a portrait, a name, a role and one line. Anyone with no photo gets a monogram of their initials instead, so a half-photographed roster still reads as one designed wall rather than a set of holes: the monogram stays quiet beside real faces, and takes a categorical hue only when nobody in the roster has a photo.

### Agent contract

**Capacity** ~6 items (over 12 overflows) — past that, actors / list-tabular / split across slides. Twelve is the ceiling and only `bench` reaches it — the ceiling is PER COMPOSITION, and every number here is measured on a real render rather than inferred from the layout. On a 16:9 stage: `bench` holds twelve; the default three-up holds eight, reflowing to four columns at a seventh; `lead` holds nine, its ranked band widening a column per extra person so it stays ONE row; `sides` holds six a side; `bio` holds six, and that is a floor rather than a tuning gap — at six its rows are already down to 72px with the portrait at 49px, so the only cut left is the sentence `bio` exists to give each person. A coda takes 121px out of the stage (512px to 391px); a footer takes nothing. Every composition absorbs the coda at those counts EXCEPT `bio`, which drops to five. `lead`'s nine assume the shape `commonMistakes` advises — the hero carries the note, the reports carry name and role; give all nine a note and the band's narrow cells wrap them until the cards run taller than the hero.

**Density** aim ~12 words per item; past ~14 it reads as a wall of text — one clause on what this person owns, not a paragraph — and the count includes the name and the image reference beside it, so about four of the allowance is fixed cost before a word of prose.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the headline — a short label in backticks, e.g. `Your account team`. |
| `title` | `h2` | no | Optional headline above the roster. A claim earns its place ('Six people own this program end to end'); a bare label ('The team') does not. |
| `people` | `ul > li` | yes | One top-level bullet per person, and the bullet IS their name. Everything about them nests under it. |
| `portrait` | `ul > li > ul > li > img` | no | The person's photo, nested under their name as `- ![](photo.jpg)`. Leave the alt empty — the name beside it is the accessible label. Omit it entirely and the engine draws a monogram from the initials instead. |
| `role` | `ul > li > ul > li > code` | no | The one backticked nested line is the role, set as a small tracked label under the name — `` `Head of Delivery` ``. Deliberately not a pill: a boxed chip under every one of twelve faces competes with the portraits it is meant to caption. |
| `note` | `ul > li > ul > li` | no | Any remaining plain nested line is the note: one short line on what this person owns. |
| `side` | `h3` | no | `sides` only. Two `### ` subheadings, each followed by its own list, label the two rosters ('Your team' / 'Our team'). |

#### Variant decision rule

- **default (no modifier).** Three to six people who each need a face, a role and one line — the workhorse 'meet the team' roster.
- **`lead`.** One person is accountable and the rest report into the work: the hero cell and the rule beneath it say so without a sentence.
- **`bench`.** The roster runs past eight and the notes matter less than the breadth — six up, face and role only.
- **`sides`.** Two teams meet: the QBR roll-call, a joint steering group, a vendor and a client side that need labelling.
- **`bio`.** Four or fewer leaders who each need a real line, and the roles read better scanned down a column than centered under a face.

#### Common mistakes

- **Leading with the portrait instead of the name.** The top-level bullet is the person's NAME (`- Ada Okafor`); the portrait, role and note all nest under it. Writing `- ![](ada.jpg)` at the top level makes the photo the person and leaves the card with no name.
- **Writing the role as plain nested text instead of backticks.** The one backticked nested line is the role, set as the label under the name. Written plain it becomes a second note line, so the card shows two body lines and no role.
- **Filling the alt text on the portrait.** Write `![](photo.jpg)` with an empty alt. The name is set right beside the face and IS the accessible label, so alt text only makes a screen reader say it twice — the engine drops it either way.
- **Adding a KEY INSIGHT or a closing note to a full `bio` roster.** A coda takes 121px out of the stage, and `bio` is the one composition that cannot absorb it: its rows are already at their floor, so a sixth person clips. Every other composition reflows and is fine — the default turns its cards on their side, `lead` tightens its band, `sides` closes its gap. So keep a `bio` roster to five when the slide carries a coda or a footer, or move the line into the headline.
- **Expecting a `lead` hero to hold a long note when the roster is also long.** The hero's note is the one that earns the room, and the ranked band widens a column per extra person to stay one row — so nine people fit, but each ranked cell is narrower than the last. Past six, give the note to the hero and leave the rest at name and role, the way the sample does; past nine the notes are what stop being readable and that is `bench`.
- **Numbering the roster with an ordered list (`1. Ada Okafor`).** The roster is rebuilt as an unordered list either way, so the numbers are dropped and nothing warns you. If the order is just the order you thought of them in, write `- Ada Okafor` and lose nothing. If the numbers meant RANK, that is what `lead` is for — it gives the first person the hero cell and says the same thing without asking the reader to count.

### Authoring

```markdown
<!-- _class: team-profile -->

`Your account team`

## The claim the roster backs up.

- First person
  - ![](portrait.jpg)
  - `Their role`
  - One line on what they own.
- Second person
  - ![](portrait-2.jpg)
  - `Their role`
  - One line on what they own.
- Third person
  - `Their role`
  - One line on what they own.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  YOUR ACCOUNT TEAM                      │
│  Six people own this program.           │
│                                         │
│      ( o )       ( o )       ( o )      │
│       Ada        Marcus      Priya      │
│    (Sponsor)   (Director)  (Delivery)   │
│      Clears     Runs the     Staffs     │
│    blockers.    cadence.   the pods.    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `lead` — lead

The first person takes a hero cell; the rest rank beneath.

```markdown
<!-- _class: team-profile lead -->

`team-profile lead`

## lead gives the first person the hero cell and ranks the rest beneath.

- Ada Okafor
  - ![](ada.svg)
  - `Executive Sponsor`
  - Signs the scope and owns the outcome.
- Marcus Vale
  - ![](marcus.svg)
  - `Program Director`
- Priya Raman
  - ![](priya.svg)
  - `Head of Delivery`
- Tomas Lindqvist
  - ![](tomas.svg)
  - `Solutions Architect`
- Nia Bello
  - ![](nia.svg)
  - `Data Lead`
```

#### `bench` — bench

The long roster, packed to a face, a name and a role.

```markdown
<!-- _class: team-profile bench -->

`team-profile bench`

## bench packs the long roster down to a face, a name, and a role.

- Ada Okafor
  - ![](ada.svg)
  - `Executive Sponsor`
- Marcus Vale
  - ![](marcus.svg)
  - `Program Director`
- Hana Suzuki
  - `Field Engineer`
- Priya Raman
  - ![](priya.svg)
  - `Head of Delivery`
- Tomas Lindqvist
  - ![](tomas.svg)
  - `Solutions Architect`
- Owen Adeyemi
  - `Revenue Ops`
- Nia Bello
  - ![](nia.svg)
  - `Data Lead`
- Jonah Reyes
  - ![](jonah.svg)
  - `Customer Success`
- Clara Nunes
  - `Quality Lead`
- Sofia Marchetti
  - ![](sofia.svg)
  - `Security Lead`
- Kenji Sato
  - ![](kenji.svg)
  - `Support Manager`
- Idris Khan
  - `Release Manager`
```

#### `sides` — sides

Two labeled rosters facing each other across the slide.

```markdown
<!-- _class: team-profile sides -->

`team-profile sides`

## sides faces two rosters across the table, each under its own label.

### Your team

- Ada Okafor
  - `VP Operations`
- Priya Raman
  - `Head of Delivery`
- Nia Bello
  - `Data Lead`

### Our team

- Marcus Vale
  - `Account Director`
- Tomas Lindqvist
  - `Solutions Architect`
- Jonah Reyes
  - `Customer Success`
```

#### `bio` — bio

One person per row, with room for a real sentence.

```markdown
<!-- _class: team-profile bio -->

`team-profile bio`

## bio turns the grid on its side and gives the note a line of its own.

- Ada Okafor
  - ![](ada.svg)
  - `Executive Sponsor`
  - Fifteen years running operations across forty sites.
- Marcus Vale
  - ![](marcus.svg)
  - `Program Director`
  - Landed this migration twice under a regulator.
- Priya Raman
  - ![](priya.svg)
  - `Head of Delivery`
  - Owns the pods and the board date.
- Tomas Lindqvist
  - ![](tomas.svg)
  - `Solutions Architect`
  - Wrote the spec the plan hangs from.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/inventory/team-profile>


