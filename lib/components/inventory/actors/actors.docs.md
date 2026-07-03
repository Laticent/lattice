# actors

> Roster of responsibilities owned by named actors.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `ownership` · `onboarding` · `reference`

**Capacity** ~4 items (crowds past 6, overflows past 7) — past that, list-tabular / split across slides.

**Density** aim ~12 words per item; past ~18 it reads as a wall of text — one short responsibility per row, not a job description.

Use to show 'who owns what' across a process, scoring policy, or org chart. Two-column layout: actor on left, responsibilities on right.

## When to use

- **Who owns what.** Each row pairs a named actor with the slice of work they own. Use when the audience needs to know accountability, not process flow.
- **Three to six actors.** The ledger reads cleanly up to about six rows. Past that, split the roster across two slides or roll up adjacent roles.
- **One-line responsibilities.** Each actor's body is a short responsibility summary, not a job description. Detail belongs on a follow-up slide or in an appendix.

## When NOT to use

- **Process sequence.** If the rows describe stages in order, use list-steps or process-flow. actors is for parallel ownership, not handoff sequence.
- **Long per-actor prose.** More than one sentence per row crowds the ledger. Move the detail to a dedicated slide and keep actors as the index.
- **Roles without names.** If the labels are job titles in the abstract ("the engineer"), reach for cards-stack or list. The actors layout earns its weight when the names are named.

## Authoring

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

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `rows` | `ul > li` | yes | One row per responsibility. Each li leads with the responsibility label — rendered bold automatically (no `**…**` needed) — then a trailing inline-code actor name (rendered as a right-aligned categorical pill), then an optional nested bullet carrying a one-line body. |

## Anatomy

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

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — rows are reference entries, not owners
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — each item needs two sentences of body text
- [`list`](../../inventory/list/list.docs.md) — declared statements — the `principles` variant
- [`glossary`](../../inventory/glossary/glossary.docs.md) — the left column is a term, not an actor

## Demo deck

See [actors.gallery.light.pdf](./actors.gallery.light.pdf) for rendered examples of every variant.
