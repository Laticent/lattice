# table

> The table component — a GFM pipe table with a row capacity, autosplit, and the portrait card reshape.

**Function** comparison · **Form** ledger · **Substance** prose

**Tags** `tradeoff` · `ranking` · `assessment` · `reference`

Use when the table IS the slide. A plain markdown table on any slide already gets the house treatment; reach for this when the rows need a capacity budget, autosplit, focus axes, or the portrait reshape.

## Agent contract

**Capacity** ~4 rows (crowds past 6, overflows past 8) — past that, split across slides. The table density crowds past six rows.

**Density** aim ~12 words per row; past ~18 it reads as a wall of text — a few words per cell.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing what the table shows. |
| `table` | `table` | yes | Markdown table with a header row and 2+ data rows. Column alignment is markdown's own (`:---`, `:---:`, `---:`). |

### Common mistakes

- **Writing a vague or duplicate first column, assuming it's just another data column.** When the table overflows a narrow box, the Fit Ladder reshapes it into row-cards (column headers become in-card labels) instead of clipping — the FIRST column becomes each card's title in that reshape, so it needs to be a genuinely identifying label per row. This happens automatically and needs no opt-in.
- **Expecting the first column's `**bold**` to show when the column is already emphasized as a row label.** The row-label emphasis sets the same weight and ink `**bold**` would, so bolding inside it is a no-op. `no-row-label` turns the emphasis off and hands the column back to you.
- **Reaching for a CSS override to make a short table fill the slide.** `table-fill` is the switch — it grows the table AND centers each cell in its band. The default hugs the rows and centers the block, so a three-row table reads as three rows rather than three rows stretched over a screen.

## When to use

- **The table IS the slide.** A plain markdown table on any slide already gets the house treatment — same type, rails, hairlines and zebra. Reach for `table` when the rows need what only a component can declare: a capacity budget, autosplit, the portrait card reshape, and the `row`/`col`/`cell` focus axes.
- **Three or more columns, or four or more rows.** `compare-prose` maxes out at two options with prose bodies. A table scales past that, as long as the cells stay short.
- **Cells are short phrases.** Each cell is a value, a phrase, or a state marker — not a paragraph. If the cells need sentences, use `verdict-grid` or `cards-stack`.
- **Stable column meaning.** Every row reads the same way across columns. Mixing column meanings row-to-row breaks the table's scannability.

## When NOT to use

- **Cells full of prose.** Long sentences in a cell wrap awkwardly and force the column wider. Move to `verdict-grid` for criteria with body text, or `cards-stack` for full prose rows.
- **More than 6 rows.** Past 6 rows the table crowds the slide. Split across two slides or summarize the rows that don't differentiate.
- **A table that only supports the prose around it.** Then it does not need this class at all — write the pipe table on a `content` or un-classed slide and the universal treatment styles it. The component is for a table that owns the slide.
- **Reaching for it when a specialist fits better.** Mostly pass/fail badges is `obligation-matrix` or `verdict-grid`; term/definition pairs are `glossary`; a dated plan is `roadmap`.

## Authoring

```markdown
<!-- _class: table -->

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

See [table.gallery.light.pdf](./table.gallery.light.pdf) for rendered examples of every variant.
