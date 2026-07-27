# compare-table

> Multi-row comparison table with consistent columns.

**Function** comparison · **Form** ledger · **Substance** prose

**Tags** `tradeoff` · `ranking` · `assessment`

Use when you have 3+ options or 4+ rows of criteria. Wider data than compare-prose can hold legibly.

## Agent contract

**Capacity** ~4 rows (crowds past 6, overflows past 8) — past that, split across slides.

**Density** aim ~12 words per row; past ~18 it reads as a wall of text — a few words per cell.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `table` | `table` | yes | Markdown table with header row and 2+ data rows. |

### Common mistakes

- **Writing a vague or duplicate first column, assuming it's just another data column.** When the deck opts into `autosplit: on` and the table overflows a portrait/narrow box, the Fit Ladder reshapes it into row-cards (column headers become in-card labels) instead of clipping — the FIRST column becomes each card's title in that reshape, so it needs to be a genuinely identifying label per row. Without `autosplit: on`, an overflowing table is not automatically protected this way.

## When to use

- **Wider than compare-prose.** Three or more options, or four or more rows of criteria. compare-prose maxes out at two columns and short bodies; compare-table scales further.
- **Cells are short phrases.** Each cell is a value, a phrase, or a state marker — not a paragraph. If the cells need sentences, use `verdict-grid` or `cards-stack`.
- **Stable column meaning.** Every row reads the same way across columns. Mixing column meanings row-to-row breaks the table's scannability.

## When NOT to use

- **Cells full of prose.** Long sentences in a table cell wrap awkwardly and force the column wider. Move to `verdict-grid` for criteria with body text, or `cards-stack` for full prose rows.
- **More than 6 rows.** Past 6 rows the table density crowds the slide. Split into two slides or summarize the rows that don't differentiate.
- **State-marker rows.** When most cells are pass/fail/partial badges, the right layout is `obligation-matrix` or `verdict-grid`. compare-table is for textual values.

## Authoring

```markdown
<!-- _class: compare-table -->

## Heading framing the comparison.

| Criterion | Option A | Option B | Option C |
| --- | --- | --- | --- |
| First criterion | Value | Value | Value |
| Second criterion | Value | Value | Value |
| Third criterion | Value | Value | Value |
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  LABEL                                  │
│  Here are the numbers side by side.     │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Option A  │ Option B  │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Row 1     │ ✓         │ ✕         │  │
│  │ Row 2     │ ✕         │ ✓         │  │
│  │ Row 3     │ ✓         │ ✓         │  │
│  │ Row 4     │ ⚠         │ ✓         │  │
│  └───────────┴───────────┴───────────┘  │
│  Footnote text for scope caveats.       │
│  footer                          11/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-prose`](../../comparison/compare-prose/compare-prose.docs.md) — exactly two options with prose bodies
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — options scored against criteria with pass/partial/fail badges
- [`obligation-matrix`](../../legal/obligation-matrix/obligation-matrix.docs.md) — many regimes compared against shared obligations
- [`cards-stack`](../../inventory/cards-stack/cards-stack.docs.md) — each row needs full-prose breathing room rather than a tabular cell

## Demo deck

See [compare-table.gallery.light.pdf](./compare-table.gallery.light.pdf) for rendered examples of every variant.
