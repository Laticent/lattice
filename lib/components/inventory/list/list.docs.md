# list

> Bulleted list under a heading — plain pills, hairline takeaways, or display-weight principles.

**Function** inventory · **Form** stack · **Substance** prose

**Tags** `overview` · `summary` · `takeaway` · `walkthrough`

**Density** aim ~14 words per item; past ~20 it reads as a wall of text — one statement per line, not a paragraph.

Use when the items are genuinely a flat list of one-line points. The default renders accent-bordered pills; the `takeaway` variant renders hairline-ruled single-line takeaways (former tldr); the `principles` variant renders display-weight numbered statements with a large counter (former principles). For richer per-item structure, prefer cards-grid, cards-stack, or list-tabular.

## When to use

- **Genuinely a list.** Five to six short points, each under twelve words. No internal structure per item — just a heading and the bullets.
- **Numbered when order matters.** Use `ol` (`1.` source) when sequence is load-bearing; `ul` when order is interchangeable. Numbers render as a tabular leading column.
- **Pills via inline code.** Inline code at the end of a row becomes a pill (status tag, metric, owner). Lets the list double as a lightweight ledger without changing layout.
- **Takeaways at a section close.** The `takeaway` variant renders each item as a hairline-ruled single line at message weight — the deck or section's headline points. Add `numbered` for a large accent counter. (Absorbed the standalone `tldr` component on 2026-06-07.)
- **Declared principles or tenets.** The `principles` variant renders an ordered list of single-sentence declarations at display weight with a large accent counter. Compose `lettered`, `roman`, or `bullet` to switch the counter format. (Absorbed the standalone `principles` component on 2026-06-07.)

## When NOT to use

- **Title plus body per item.** If each bullet is `**Title.** body`, the layout under-serves it. Move to cards-stack (2-3 items) or list-tabular (5+ rows) instead.
- **Wall of long bullets.** Past twelve words per line the slide becomes paragraph soup. Either trim or move to content for prose, cards-stack for structured items.
- **Two-item lists.** Two bullets read as a thin slide. For pairs, reach for compare-prose — it gives the pair the weight it deserves.

## Authoring

```markdown
<!-- _class: list -->

## Slide heading.

- First short bullet point.
- Second short bullet point.
- Third short bullet point.
- Fourth short bullet point.
- Fifth short bullet point.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `items` | `ul > li, ol > li` | yes | List items. Keep each under ~12 words. |

## Anatomy

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

## Variants (component-specific)

### `takeaway` — Takeaway — hairline single-line points

Renders each item as a hairline-ruled single line at message weight. Use at the end of a section or deck to restate the headline points, one complete claim per line. Was the standalone `tldr` component before 2026-06-07.

```markdown
<!-- _class: list takeaway -->

## What this review showed, in five lines.

- Q2 revenue missed plan by 9%, and three structural factors explain almost all of it.
- The shortfall is in enterprise renewals, not new logos.
- Every one of the three causes is fixable before the Q4 close.
- The Q3 plan moves two engineers and one rep onto the gaps.
- We are not asking for more headcount — only to move what we have.
```

### `principles` — Principles — display-weight declarations

Renders an ordered list of single-sentence declarations at display weight with a large accent counter. For design tenets, working agreements, or decision rules. Was the standalone `principles` component before 2026-06-07.

```markdown
<!-- _class: list principles -->

## How we make calls when the spec is silent.

1. Default to the choice that is cheaper to reverse.
2. Name the actor, never the system.
3. Write the bet on the same slide as the choice.
4. Disagree in the room, then commit outside it.
5. Optimise for the reader who wasn't there.
```

### `numbered` — Numbered — accent counter on takeaways

Adds a large accent counter (01, 02, …) to the `takeaway` variant.

```markdown
<!-- _class: list takeaway numbered -->

## What this review showed, in five lines.

- Q2 revenue missed plan by 9%, and three structural factors explain it.
- The shortfall is in enterprise renewals, not new logos.
- Every one of the three causes is fixable before the Q4 close.
```

### `lettered` — Lettered — A, B, C counter on principles

Switches the `principles` counter to upper-alpha.

```markdown
<!-- _class: list principles lettered -->

## Working agreements.

1. Default to the choice that is cheaper to reverse.
2. Name the actor, never the system.
3. Write the bet on the same slide as the choice.
```

### `roman` — Roman — I, II, III counter on principles

Switches the `principles` counter to upper-roman.

```markdown
<!-- _class: list principles roman -->

## Working agreements.

1. Default to the choice that is cheaper to reverse.
2. Name the actor, never the system.
3. Write the bet on the same slide as the choice.
```

### `bullet` — Bullet — dot instead of a counter on principles

Replaces the `principles` counter with a centered dot.

```markdown
<!-- _class: list principles bullet -->

## Working agreements.

1. Default to the choice that is cheaper to reverse.
2. Name the actor, never the system.
3. Write the bet on the same slide as the choice.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — each item has a title plus body sentence
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — five or more rows with label-plus-description
- [`checklist`](../../inventory/checklist/checklist.docs.md) — items carry state markers (done / partial / todo)

## Demo deck

See [list.gallery.light.pdf](./list.gallery.light.pdf) for rendered examples of every variant.
