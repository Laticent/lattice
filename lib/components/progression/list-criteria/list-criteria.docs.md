# list-criteria

> Numbered criteria list — each requirement is a row with rationale.

**Function** progression · **Form** ledger · **Substance** structure

**Tags** `requirements` · `assessment` · `okr`

## Agent contract

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one criterion with a short proof, not a spec.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the framework. |
| `criteria` | `ol > li` | yes | One li per criterion. The lead text is the criterion title — it renders bold automatically (no `**…**` needed); follow it with a nested `- rationale` bullet. |

Use to enumerate the criteria a decision must meet, in priority order. Numbering signals weight; each row reads as a complete requirement.

## When to use

- **Criteria that must all be satisfied.** When the audience needs to read each requirement as a complete gate, not a suggestion. The numbered ledger format signals 'these are the rules' rather than 'here are some options'.
- **Order encodes priority.** The leading-zero counter (`01`, `02`, …) reads as rank. Put the load-bearing criterion first; the audience uses position as a weight.
- **Three to six rows.** Below three the ledger feels under-furnished; above six the row gap closes and the audience loses scannability. Group adjacent criteria or split into two slides.

## When NOT to use

- **Parallel options, not gates.** If the items are alternatives the audience is choosing between, use `cards-grid` or `verdict-grid`. list-criteria is for requirements all of which must hold.
- **Rationale longer than two lines.** Each row is a one-sentence rationale. If a criterion needs a paragraph, lift it to `list-steps` or `split-panel` where the body has room to breathe.
- **Missing criterion title.** The lead line on each li — rendered bold automatically — is what makes the ledger scannable. A naked sentence per row reads as paragraph soup; the title is the structure.

## Authoring

```markdown
<!-- _class: list-criteria -->

## What every decision must satisfy.

1. First criterion
   - Short rationale for why this matters.
2. Second criterion
   - Short rationale.
3. Third criterion
   - Short rationale.
4. Fourth criterion
   - Short rationale.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Criteria heading.                      │
│                                         │
│  01  First criterion — gloss            │
│  02  Second criterion — gloss           │
│  03  Third criterion — gloss            │
│  04  Fourth criterion — gloss           │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — rows are procedural steps with longer body, not gating criteria
- [`checklist`](../../inventory/checklist/checklist.docs.md) — rows carry done/in-flight/planned state markers
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — options scored against shared criteria
- [`list`](../../inventory/list/list.docs.md) — declared statements — the `principles` variant
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — rows carry structured metadata alongside the name and description

## Demo deck

See [list-criteria.gallery.light.pdf](./list-criteria.gallery.light.pdf) for rendered examples of every variant.
