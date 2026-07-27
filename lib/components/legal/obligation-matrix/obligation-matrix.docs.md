# obligation-matrix

> Regulation × obligation grid — state-marker cells encode applies / partial / exempt at a glance.

**Function** comparison · **Form** matrix · **Substance** structure

**Tags** `compliance` · `regulation` · `stoplight`

Use when many regimes need comparing across the same obligations. Cells carry the universal state-token grammar ([x] applies, [-] partial, [ ] exempt, [/] out of scope) shared with checklist / verdict-grid / roadmap.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing what the matrix compares. |
| `matrix` | `table` | yes | Markdown table — rows are regulations, columns are obligations. Use state markers ([x] / [-] / [ ] / [/]) in cells. |
| `legend` | `p` | no | Optional trailing paragraph explaining the state-marker meanings or what to take from the matrix. |

### Variant decision rule

- **default (no modifier).** Neutral, data-first cell chrome with no additional emphasis — reference tone.
- **`heat`.** The matrix should read as exposure — applies (`[x]`) reads as alarm — not just coverage for reference. Exempt (`[ ]`) cells resolve to a neutral state that `heat` does NOT re-color; they keep their default neutral ring rather than turning 'relief' green.
- **`asymmetric`.** The regimes genuinely differ in kind and each deserves body-level breathing room as its own card rather than a strict grid cell.
- **`pills`.** The state should read as a word — a status label — rather than an iconographic mark. This requires authoring literal text (inline code or bold) per cell instead of the `[x]`/`[-]`/`[ ]` state-marker grammar — `pills`' word-styling only targets literal text, so a table still written with bracket markers keeps its icon-only marks (no word appears), though the cell padding and row-zebra shift anyway since `pills` restyles every cell regardless of content.
- **`lanes`.** Each regime should read as its own horizontal band, emphasizing that it's a distinct regime rather than a rank in a list.

### Common mistakes

- **Explicitly left-aligning table columns (`:---`) instead of leaving alignment unspecified or writing `:---:`.** The matrix unconditionally centers every cell, so a plain column with no alignment markers still centers state-marker glyphs fine. Only an EXPLICIT `:---` left-align syntax breaks it — that emits an inline left-align style, which (being inline) overrides the component's own centering rule regardless of specificity.

## When to use

- **Many regimes, shared obligations.** Three or more regulations or jurisdictions compared across the same set of duties. The grid lets the reader scan a row to know a regime and a column to know an obligation.
- **State markers, not values.** Cells are pass/partial/fail/skip — the universal `[x]` / `[-]` / `[ ]` / `[/]` grammar. For textual cell values use `compare-table`.
- **Risk axis with heat.** The `heat` variant flips the palette so applies (`[x]`) reads as alarm. Exempt (`[ ]`) cells resolve to the neutral state and are NOT recolored — they don't turn 'relief' green. Use when the matrix is read for exposure, not for coverage.

## When NOT to use

- **Two regimes only.** Past one row vs another the grid loses its purpose. Use `compare-prose` or `compare-table` for two-regime comparisons.
- **Mixed cell content.** Don't mix state markers with prose values in the same matrix — the cell width has to grow to fit prose and the marker grid collapses. Pick one cell type.
- **Missing legend.** The trailing paragraph naming filled/half/empty is what onboards a first-time reader. Skipping it forces the audience to guess the mapping.

## Authoring

```markdown
<!-- _class: obligation-matrix -->

## Headline framing what the matrix compares.

| Regulation | Obligation A | Obligation B | Obligation C |
| ---------- | :----------: | :----------: | :----------: |
| Regime 1   | [x]          | [x]          | [-]          |
| Regime 2   | [x]          | [-]          | [x]          |
| Regime 3   | [x]          | [ ]          | [x]          |

Filled = applies, half = partial, empty = exempt.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Regulation × duty heading.             │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Duty A    │ Duty B    │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Reg 1     │ ✓         │ ✕         │  │
│  │ Reg 2     │ ✓         │ ✓         │  │
│  │ Reg 3     │ ⚠         │ ✓         │  │
│  └───────────┴───────────┴───────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `heat` — heat

Cells shaded by burden.

```markdown
<!-- _class: obligation-matrix heat -->

## heat shades the cells by burden.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]   |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]   |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]   |

Red = applies (exposure), green = exempt (relief). Brackets frame the structure.
```

### `asymmetric` — asymmetric

Regimes differ in kind.

```markdown
<!-- _class: obligation-matrix asymmetric -->

## asymmetric admits the regimes differ in kind.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |

Each row promotes to a card with body-level breathing room.
```

### `pills` — pills

Cells as status words.

```markdown
<!-- _class: obligation-matrix pills -->

## pills spell each cell as a status word.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]   |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]   |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]   |

Same data, neutral chrome — the state pills carry the meaning without the heat-map alarm.
```

### `lanes` — lanes

One regime per band.

```markdown
<!-- _class: obligation-matrix lanes -->

## lanes walks one regime per band.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]   |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]   |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]   |

Each lane stripe signals that the row is its own regime, not a rank.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`compare-table`](../../comparison/compare-table/compare-table.docs.md) — cells are textual values, not state markers
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — options scored against criteria with a per-card layout instead of a table
- [`matrix-2x2`](../../comparison/matrix-2x2/matrix-2x2.docs.md) — two axes, four cells, qualitative placement
- [`checklist`](../../inventory/checklist/checklist.docs.md) — one set of obligations against one regime, not many

## Demo deck

See [obligation-matrix.gallery.light.pdf](./obligation-matrix.gallery.light.pdf) for rendered examples of every variant.
