# obligation-matrix

> Regulation × obligation grid — state-marker cells encode applies / partial / exempt at a glance.

**Function** comparison · **Form** matrix · **Substance** structure

**Tags** `compliance` · `regulation` · `stoplight`

Use when many regimes need comparing across the same obligations. Cells carry the universal state-token grammar ([x] applies, [-] partial, [!] not required, [?] unclear, [ ] undetermined, [/] exempt) shared with checklist / verdict-grid / roadmap.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing what the matrix compares. |
| `matrix` | `table` | yes | Markdown table — rows are regulations, columns are obligations. Use state markers ([x]/[-]/[!]/[?]/[ ]/[/]) in cells. |
| `key` | `p > code:only-child` | no | OPTIONAL label set renaming the marker key: `[{[x], In force}, {[/], Not subject}]`, one inline-code span alone in its paragraph. The key is the MARKER you already type in a cell (`[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`), brackets included — a bare space key collapses to empty and would drop its row. Naming a subset is the normal case; the rest keep the default words declared in this manifest's `labelSet`. The paragraph is consumed so it names the key rather than also printing above the grid. |
| `legend` | `p` | no | Optional trailing paragraph — what to take from the matrix, or a caveat about the placements. It no longer has to explain the markers: the key under the grid names them, derived from the ones the cells actually carry. |

### Variant decision rule

- **default (no modifier).** Neutral, data-first cell chrome with no additional emphasis — reference tone.
- **`heat`.** The matrix should read as exposure — applies (`[x]`) reads as alarm — not just coverage for reference. Exempt (`[/]`) and undetermined (`[ ]`) cells stay neutral; `heat` does NOT re-color them; they keep their default neutral ring rather than turning 'relief' green.
- **`asymmetric`.** The regimes genuinely differ in kind and each deserves body-level breathing room as its own card rather than a strict grid cell.
- **`pills`.** The state should read as a word — a status label — rather than an iconographic mark. This requires authoring literal text (inline code or bold) per cell instead of the state-marker grammar — `pills`' word-styling only targets literal text, so a table still written with bracket markers keeps its icon-only marks (no word appears), though the cell padding and row-zebra shift anyway since `pills` restyles every cell regardless of content.
- **`lanes`.** Each regime should read as its own horizontal band, emphasizing that it's a distinct regime rather than a rank in a list.

### Common mistakes

- **Keying a label set on the marker's NAME rather than the marker.** `[{applies, In force}]` binds to nothing and the row is dropped. A key is the marker exactly as a cell spells it — `[x]`, `[-]`, `[!]`, `[?]`, `[ ]`, `[/]` — brackets included. The brackets are load-bearing: a bare space key collapses to empty under the parser's whitespace tidy and would take the `[ ]` row with it.
- **Explicitly left-aligning table columns (`:---`) instead of leaving alignment unspecified or writing `:---:`.** The matrix unconditionally centers every cell, so a plain column with no alignment markers still centers state-marker glyphs fine. Only an EXPLICIT `:---` left-align syntax breaks it — that emits an inline left-align style, which (being inline) overrides the component's own centering rule regardless of specificity.

## When to use

- **Many regimes, shared obligations.** Three or more regulations or jurisdictions compared across the same set of duties. The grid lets the reader scan a row to know a regime and a column to know an obligation.
- **State markers, not values.** Cells are state markers — the universal six (`[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`), one meaning each in every layout. For textual cell values use `table`.
- **The key's words are a DEFAULT, not a fixed vocabulary.** 'Applies' and 'Exempt' suit a compliance matrix; a licensing or diligence grid wants other words. Write a label set above the grid — `[{[x], In force}, {[/], Not subject}]` — and those markers are renamed; the ones you do not name keep theirs. The defaults are declared in this manifest's `labelSet`, which is also what `lint:deck` checks your keys against.
- **Risk axis with heat.** The `heat` variant flips the palette so applies (`[x]`) reads as alarm. Exempt (`[/]`) and undetermined (`[ ]`) cells stay neutral and are NOT recolored — they don't turn 'relief' green. Use when the matrix is read for exposure, not for coverage.

## When NOT to use

- **Two regimes only.** Past one row vs another the grid loses its purpose. Use `compare-prose` or `table` for two-regime comparisons.
- **Mixed cell content.** Don't mix state markers with prose values in the same matrix — the cell width has to grow to fit prose and the marker grid collapses. Pick one cell type.
- **Restating the key in prose.** The grid now draws its own key — one named marker per state the cells actually carry — so a trailing sentence repeating 'filled = applies, half = partial' costs a line and can go stale against the markers on the slide. Rename the words with a label set instead; keep the paragraph for what the key cannot say.

## Authoring

```markdown
<!-- _class: obligation-matrix -->

## Headline framing what the matrix compares.

| Regulation | Obligation A | Obligation B | Obligation C |
| ---------- | :----------: | :----------: | :----------: |
| Regime 1   | [x]          | [x]          | [-]          |
| Regime 2   | [x]          | [-]          | [x]          |
| Regime 3   | [x]          | [/]          | [x]          |

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
| GLBA       | [x]    | [-]     | [-]       | [x]    | [/]   |

Heat marks burden, not relief — exempt cells stay neutral.
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
| GLBA       | [x]    | [-]     | [-]       | [x]    | [/]   |

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
| GLBA       | [x]    | [-]     | [-]       | [x]    | [/]   |

Each lane stripe signals that the row is its own regime, not a rank.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`table`](./table.md) — cells are textual values, not state markers
- [`verdict-grid`](./verdict-grid.md) — options scored against criteria with a per-card layout instead of a table
- [`matrix-2x2`](./matrix-2x2.md) — two axes, four cells, qualitative placement
- [`checklist`](./checklist.md) — one set of obligations against one regime, not many
- [`matrix-grid`](./matrix-grid.md) — the grid marks one position on two ordered axes, not a pass/partial/exempt status per cell

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/legal/obligation-matrix>
