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

### `takeaway` — takeaway

Ruled single lines for conclusions.

```markdown
<!-- _class: list takeaway -->

## takeaway boxes the list as findings.

- The box frames the lines as conclusions.
- Lead with the strongest finding.
- Five lines read as a verdict.
- Longer sets go back to plain list.
```

### `principles` — principles

Numbered declarations at display weight.

```markdown
<!-- _class: list principles -->

## principles numbers the house rules.

1. State each rule as an imperative.
2. Keep rules under ten words.
3. Order them by how often they apply.
4. Retire a rule you keep breaking.
```

### `numbered` — numbered

Accent counters on the takeaway box.

```markdown
<!-- _class: list takeaway numbered -->

## numbered ranks the boxed findings.

- Ranks turn findings into priorities.
- The top line owns the meeting.
- Three ranked lines beat six flat ones.
```

### `lettered` — lettered

Letters replace the counters.

```markdown
<!-- _class: list principles lettered -->

## lettered counts the rules with letters.

1. Letters read as options, not sequence.
2. Use them when order is arbitrary.
3. Three options is a decision; six is a menu.
```

### `roman` — roman

Roman numerals replace counters.

```markdown
<!-- _class: list principles roman -->

## roman sets the rules in numerals.

1. Numerals lend formal weight.
2. Reserve them for charters and mandates.
3. Past five, the gravitas becomes parody.
```

### `bullet` — bullet

Dots replace the counters.

```markdown
<!-- _class: list principles bullet -->

## bullet strips the markers back to dots.

1. Dots drop the counting entirely.
2. The principles frame stays.
3. Use when rules are peers.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — each item has a title plus body sentence
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — five or more rows with label-plus-description
- [`checklist`](../../inventory/checklist/checklist.docs.md) — items carry state markers (done / partial / todo)

## Demo deck

See [list.gallery.light.pdf](./list.gallery.light.pdf) for rendered examples of every variant.
