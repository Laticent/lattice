# list-criteria

> Numbered criteria list — each requirement is a row with rationale.

**Function** progression · **Form** ledger · **Substance** structure

**Tags** `requirements` · `assessment` · `okr`

Use to enumerate the criteria a decision must meet, in priority order. Numbering signals weight; each row reads as a complete requirement.

## Agent contract

**Capacity** ~4 items (over 5 overflows).

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one criterion with a short proof, not a spec.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the framework. |
| `criteria` | `ol > li` | yes | One li per criterion. The lead text is the criterion title — it renders bold automatically (no `**…**` needed); follow it with a nested `- rationale` bullet. |

### Common mistakes

- **Manually bolding the criterion title with `**…**`.** The lead text of each `li` is auto-lifted to `<strong>` by the engine's slot-label-lift step, which already skips a lead that's already bolded — a manually bolded lead and a plain one produce byte-identical output. Wrapping it yourself is a harmless no-op, not a defect, but it's also unnecessary — write plain text and let the lift handle the weight.
- **Nesting the rationale as a numbered sub-list (`1.`) instead of a bullet (`-`).** The rationale styling only targets a nested `ul` — a numbered sub-list (`1.`) falls back to default list markup instead of the muted, unmarked rationale line.

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

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`list-steps`](./list-steps.md) — rows are procedural steps with longer body, not gating criteria
- [`checklist`](./checklist.md) — rows carry done/in-flight/planned state markers
- [`verdict-grid`](./verdict-grid.md) — options scored against shared criteria
- [`list`](./list.md) — declared statements — the `principles` variant
- [`list-tabular`](./list-tabular.md) — rows carry structured metadata alongside the name and description

## Demo deck

