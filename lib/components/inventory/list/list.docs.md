# list

> A list under a heading — plain pills, hairline takeaways (a `1.` list numbers them; a nested gloss line makes criteria), or display-weight principles.

**Function** inventory · **Form** stack · **Substance** prose

**Tags** `overview` · `summary` · `takeaway` · `walkthrough` · `requirements`

Use when the items are genuinely a flat list of one-line points. The default renders accent-bordered pills; the `takeaway` variant renders hairline-ruled single-line takeaways (former tldr), and an item with a nested `- gloss` bullet stacks a bold lead over a muted gloss line (written as a `1.` list, the former list-criteria); the `principles` variant renders display-weight statements with a large counter (former principles). In every register the marker decides: `1.` numbers the rows and `-` does not. For richer per-item structure, prefer cards-grid, cards-stack, or list-tabular.

## Agent contract

**Capacity** ~5 items at a wide @size (over 6 overflows).

**Density** aim ~14 words per item; past ~20 it reads as a wall of text — one statement per line, not a paragraph.

**By venue** (`venue:`, ~14 words each) it holds laptop ~6 · huddle ~6 · conference ~3 · hall ~3 items. At ~6 words each: 6 · 6 · 5 · 5. With `takeaway` (~14 words): 6 · 6 · 5 · 4. Ending in a `> …` callout (~14 words): 5 · 4 · 2 · 2. No venue goes past the Capacity max of 6, which holds in every room. Past the room's number the slide still renders at the venue's size, because a venue is a fixed setting the engine never shrinks to fit, so it clips: `lint:deck` warns first (`capacity-scale`), and the export's `⚠ OVERFLOW` line and the Studio's ring name it. Measured at a wide @size by `tools/calibrate-capacity.js`; see engineering/decisions/2026-09-25-font-scale-fit.md.

### Slots

| Slot | Write | Required | Description |
|---|---|---|---|
| `title` | a `## ` heading | yes | Slide heading. |
| `items` | a list | yes | List items. Keep each under ~12 words. |

Under a variant, a slot changes shape:

- `principles`: `items` is written as a `1.` list.

### Variant decision rule

- **default (no modifier).** A flat set of accent-bordered pill points — the plainest bulleted list, no special framing.
- **`takeaway`.** The list closes a section with headline-weight conclusions — hairline-ruled single lines instead of pills.
- **`principles`.** The items are declared tenets or house rules — display-weight numbered statements with a large accent counter.
- **`lettered`.** Under `principles`, the order is arbitrary rather than sequential — letters read as options, not a ranking.
- **`roman`.** The principles are a formal charter or mandate that wants numeral gravitas — reserve for a short list, past five it reads as parody.
- **`bullet`.** The principles are true peers with no ranking or sequence at all — strips the counter back to plain dots.

### Common mistakes

- **Combining `lettered`/`roman`/`bullet` with `takeaway`, or adding `numbered` to number a `-` list, expecting the counter to change.** `lettered`/`roman`/`bullet` only compose with `principles` (they swap ITS counter format). `numbered` was retired from `list` in W2: the `1.` marker numbers the rows in every register, so write `1.` instead. `lint:deck` warns on each (`list-modifier-inert`).
- **Picking `ol` or `ul` arbitrarily under the default/`takeaway` look, without regard to whether order matters.** In every register the list type is a real authoring signal: `1.` renders a leading number column implying sequence, and `-` doesn't (a dot under `principles`). Use `1.` only when the sequence is load-bearing.

## When to use

- **Genuinely a list.** Five to six short points, each under twelve words. No internal structure per item — just a heading and the bullets.
- **Numbered when order matters.** Use `ol` (`1.` source) when sequence is load-bearing; `ul` when order is interchangeable. Numbers render as a tabular leading column.
- **Pills via inline code.** Inline code at the end of a row becomes a pill (status tag, metric, owner). Lets the list double as a lightweight ledger without changing layout.
- **Takeaways at a section close.** The `takeaway` variant renders each item as a hairline-ruled single line at message weight — the deck or section's headline points. Write the items as a `1.` list for a large accent counter; a `-` list has none. (Absorbed the standalone `tldr` component on 2026-06-07.)
- **Criteria a decision must meet.** `takeaway` over a `1.` list with a nested `- gloss` under each item stacks a bold lead over a muted reason line, with a fixed-size counter in a left gutter. Numbering reads as priority: put the criterion most likely to veto first. (Absorbed the standalone `list-criteria` component on 2026-09-25.)
- **Declared principles or tenets.** The `principles` variant renders single-sentence declarations at display weight with a large accent counter. Compose `lettered`, `roman`, or `bullet` to switch the counter format; a `-` list sets a dot instead of a counter. (Absorbed the standalone `principles` component on 2026-06-07.)

## When NOT to use

- **Title plus body per item.** If each bullet is `**Title.** body` on one line, the layout under-serves it. Nest the body as a `- gloss` bullet under a `takeaway` item (the lead then stacks over it), or move to cards-stack (2-3 items) or list-tabular (5+ rows).
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

Universal modifiers (`dark`, `compact`, `accent`, state markers, treatments) compose onto this component's class. Every one, by group, is in [the base modifier reference](../../../base/base.modifiers.docs.md), generated from `lib/base/base.manifest.json`.

## Related components

- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — each item has a title plus body sentence
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — five or more rows with label-plus-description
- [`checklist`](../../inventory/checklist/checklist.docs.md) — items carry state markers (done / partial / todo)

## Demo deck

See [list.gallery.light.pdf](./list.gallery.light.pdf) for rendered examples of every variant.
