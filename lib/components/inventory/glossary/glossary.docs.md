# glossary

> Two-column term/definition table with auto-derived alphabetic range pill.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `definition` · `reference` · `onboarding`

Use for jargon-heavy decks where the audience needs a reference page. The runtime auto-adds a range pill (e.g. 'A – G') to the heading.

## Agent contract

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — a term and a one-sentence definition.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — typically 'Glossary'. |
| `entries` | `ul > li` | yes | Nested bullets: outer li is the term, inner li is its one-line definition. A runtime transform converts the list into a two-column table and derives the alphabetic range pill from the first and last terms, so terms should be authored in alphabetical order; without the Lattice runtime the raw nested list renders unstyled. |

### Common mistakes

- **Authoring terms out of alphabetical order.** The range pill is derived from the FIRST and LAST terms in the list, not computed by sorting — an out-of-order list produces a range pill that doesn't actually describe the terms it contains.
- **A term with no nested definition bullet beneath it, or a term with a SECOND nested definition bullet.** Every term needs EXACTLY one nested definition bullet directly beneath it. Zero bullets leaves that row's definition cell empty; a second bullet is silently DROPPED (only the first is captured), so the extra content just vanishes rather than erroring or appending.

## When to use

- **Jargon-heavy decks.** When the audience needs a reference page they can flip back to. Acronyms, domain terms, internal names — anything the speaker won't define inline.
- **Five to eight entries per slide.** The ledger is sized for a short page. For longer glossaries, split alphabetically across multiple slides — the runtime stamps each with its range pill.
- **Short definitions.** Each definition is one sentence — a working gloss, not an essay. Long definitions belong on their own divider (light variant) slide where the term is the heading.

## When NOT to use

- **Multi-sentence definitions.** Each entry is one short line. If a definition needs context or examples, the term deserves its own slide — use a divider (light variant) with the term as the heading.
- **Mixed term lengths.** If some terms are single words and others are full phrases, the left column gets ragged. Trim long terms to their canonical short form.
- **Hand-written range pill.** The runtime derives the range pill (e.g. "A – G") from the entries. Authoring it into the heading double-stamps it.

## Authoring

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

## Anatomy

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

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — rows are key/value reference, not term/definition
- [`divider`](../../anchor/divider/divider.docs.md) — lighter mid-section orientation — the bright-canvas `light` variant
- [`actors`](../../inventory/actors/actors.docs.md) — the left column is a named person, not a term
- [`list`](../../inventory/list/list.docs.md) — declared statements — the `principles` variant

## Demo deck

See [glossary.gallery.light.pdf](./glossary.gallery.light.pdf) for rendered examples of every variant.
