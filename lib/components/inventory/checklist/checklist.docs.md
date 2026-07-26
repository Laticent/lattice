# checklist

> Items with state markers — done, partial, todo.

**Function** inventory · **Form** stack · **Substance** structure

**Tags** `status` · `stoplight` · `process` · `requirements`

Use for completion reports, readiness audits, or pre-flight checks. State markers [x]/[-]/[ ]/[/] produce status-colored circles carrying a distinct mark — check / dash / ring / slash — so the shape reads independently of color (color-blind-safe).

## Agent contract

**Capacity** ~6 items (crowds past 8, overflows past 9) — past that, split across slides.

**Density** aim ~10 words per item; past ~16 it reads as a wall of text — a short readiness line.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `items` | `ul > li` | yes | Each item prefixed with a state marker — [x] done, [-] partial, [ ] todo, or [/] out-of-scope (struck through). Plain text follows the marker; an optional trailing inline-code pill floats right as a status tag. |

### Common mistakes

- **Writing the status pill as plain trailing text instead of inline code.** The optional trailing status tag must be inline `code` (e.g. `` `blocked` ``) to render as a floated pill — plain trailing text just becomes part of the line's prose.
- **Confusing `[/]` (out-of-scope, struck through) with `[-]` (partial / in-progress).** `[-]` marks partial progress (amber dash); `[/]` marks an item explicitly descoped (muted, struck through) — using `[/]` for 'in progress' mis-signals the row as cut rather than underway.

## When to use

- **Completion reports.** Use when the audience needs to see what's done, what's in progress, and what's outstanding. The state marks are the load-bearing signal.
- **Readiness audits.** Pre-launch, pre-release, pre-flight. A short list where the mix of green / amber / red tells the room whether to proceed.
- **Five to eight items.** Short enough that the audience can take in the state mix at a glance. Past eight, split into two checklists by phase or owner.

## When NOT to use

- **All-done lists.** If every item is `[x]` the state markers are decoration. Use `list` (or its `takeaway` variant) for celebratory recaps; checklist earns its weight when the mix matters.
- **Long per-item prose.** Each item is one short line. If a row needs a sentence of explanation, the right home is cards-stack or list-tabular.
- **Custom state markers.** Only `[x]`, `[-]`, `[ ]`, and `[/]` (out-of-scope, struck through) map to the mark palette. Authoring `[?]` or `[!]` renders as literal text and breaks the visual contract.

## Authoring

```markdown
<!-- _class: checklist -->

## Pre-launch readiness.

- [x] First item that is fully done.
- [x] Second item that is fully done.
- [-] Third item that is partially complete with a caveat.
- [ ] Fourth item that is not yet started.
```

## Anatomy

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

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list`](../../inventory/list/list.docs.md) — items have no state — just bullets
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — rows need a label-plus-description structure, not state
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — each item needs two sentences of body

## Demo deck

See [checklist.gallery.light.pdf](./checklist.gallery.light.pdf) for rendered examples of every variant.
