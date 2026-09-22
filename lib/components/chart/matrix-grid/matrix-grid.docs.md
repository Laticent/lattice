# matrix-grid

> Two ordered axes as an N×M chart-family grid — each cell marks a position (filled / reachable / not applicable), colored by its row's category from the theme's chart palette.

**Function** comparison · **Form** matrix · **Substance** structure

**Drawn with** `html` — HTML/CSS all the way down, no `<svg>` anywhere: a real `<table>` whose cells carry the positional grammar (filled/outlined/empty spans), colored via CSS custom properties per row. Nothing is positioned by numeric value — the grid is text and color in a semantic table, same reasoning as roadmap.

**Tags** `stoplight` · `assessment` · `positioning` · `okr`

Use for a rubric where BOTH axes are ordered categories (a depth ladder × a reach ladder, a maturity level × a scope) and a reader needs to see one position at a glance — not a status report. A chart-family member: renders inside the shared chart-frame skeleton and colors rows from the theme's chart categorical palette (--chart-cat1..8), never a hardcoded palette of its own. Cells carry a positional grammar ([x] this row's position, [-] reachable from here, [ ] not applicable). For regulation × obligation status tracking, use `obligation-matrix`; for phases × workstreams delivery status, use `roadmap`; for two free axes and four cells, use `matrix-2x2`.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading naming the rubric. |
| `eyebrow` | `p > code` | no | OPTIONAL axis labels: ONE bracketed list in its own paragraph ABOVE the table — `` `[Wider reach, Deeper cognition]` ``. The first member names the column (reach) axis and renders centered above the grid; the second names the row (depth) axis and renders rotated along its left edge. Quotes are optional, single or double, and protect a comma inside a name — `["Reach, net", Depth]` is two axes. Direction arrows are GENERATED — write only the names. Omit the paragraph entirely and the grid renders with no axis labels. A paragraph that is not a bracketed list is an ordinary eyebrow/subtitle and is left alone. |
| `subtitle` | `h2 + p` | no | One supporting sentence under the heading, framing how to read the grid. |
| `matrix` | `table` | yes | Markdown table — the header row is the reach/scope axis, the first column of each body row is the category axis. Cells use the positional grammar ([x] / [-] / [ ]); a filled cell's trailing text is its label. |
| `key` | `p > code:only-child` | no | OPTIONAL label set renaming the cell key: `[{[-], within reach}, {[ ], out of band}]`, one bracketed list in its own paragraph BELOW the table. POSITION is what distinguishes it from the axis — the two are the same shape, so a list above the table names the axes and a list below it renames the key. TWO shapes are keyable — `[-]` and `[ ]`. `[x]` is deliberately NOT: a filled cell's own trailing text IS its label (`[x] Senior`), so the shape has no general name and a row reading 'filled' would repeat on every slide what the cell already says better. Naming a subset is the normal case; the rest keep the defaults declared in this manifest's `labelSet`. |
| `legend` | `p:last-of-type` | no | Optional single trailing paragraph, doubling as the chart caption. It no longer has to say what the cell shapes mean — the key under the grid names them — so use it for the caveat the key cannot carry (how the placements were derived, what they are illustrative of). A leading `**bold**` run still renders as a filled swatch + label and a leading `*italic*` run as an outlined swatch + label, for a caption that wants to point at a specific cell; keep both in this ONE paragraph (a second trailing paragraph is not lifted into the caption). |

### Common mistakes

- **Authoring `[x]` with no trailing label, e.g. `| [x] |` alone.** A filled cell's text IS the row's title at that reach — `[x] Senior`, not a bare marker. An unlabeled filled cell renders as an empty colored box.
- **Keying `[x]` in a label set.** `[x]` is deliberately not keyable: a filled cell's own trailing text IS its label (`[x] Senior`), so the shape has no general name and a key row reading 'filled' would repeat on every slide what the cell already says better. Key `[-]` and `[ ]`, the two shapes a reader genuinely cannot infer. `lint:deck` says this back to you, quoting the manifest's own reason.
- **Writing the label set ABOVE the table, where the axis lives.** The axis and the key are the SAME shape — a bracketed list — so position is the only thing that tells them apart. A list ABOVE the table names the axes; a list BELOW it renames the key. Put it above and your key becomes an axis label reading 'within reach ▶'.

### Data shape

- The header row's first cell is conventionally blank or names the category axis; the remaining header cells are the reach/scope axis labels in ascending order.
- Body rows go deepest/highest category first — the row order IS the depth axis, so declare rows in the same descending order you'd want read top-to-bottom.
- Up to eight rows are colored from the chart family's categorical palette before hues repeat; past eight, split into two grids.
- On a wide deck every column is the same width, so a filled cell's label has to fit that share rather than widening its own column. Keep labels to a word or two — `Senior`, `Principal`, `VP`. `Distinguished` at five columns is the longest the shipped gallery carries and it clears its cell by 75.9px; a much longer one does not get cut, it paints straight through the pill's border, so treat the pill as the budget.

## When to use

- **Both axes are ordered categories.** A depth ladder (skill, seniority, maturity) crossed with a reach or scope ladder (self, team, org, field). If either axis is a free, unordered label, reach for `matrix-2x2` (two axes, four cells) instead.
- **One position, not a status report.** The grid exists to show where a single subject sits — a role, a maturity level, a capability — not to track many items' pass/fail state. For that, `obligation-matrix` (regulation × obligation) or `roadmap` (phase × workstream) fit better.
- **The key's words are a DEFAULT, not a fixed vocabulary.** 'reachable' and 'not applicable' suit a capability rubric; a coverage or eligibility grid wants other words. Write a label set — `[{[-], within reach}, {[ ], out of band}]` — and those shapes are renamed. Only `[-]` and `[ ]` are keyable: a filled cell's own trailing text is its label, so `[x]` has no general name to give it.
- **Row category carries the color.** Each row is colored by its own hue from the chart family's categorical palette, not a status palette — there's no universal 'good' or 'bad' cell here, only which row and how far it reaches.

## When NOT to use

- **Pass/fail or delivery status.** If cells mean shipped/at-risk/blocked, use `obligation-matrix` or `roadmap` — their semantic state palette (pass/warn/fail) is built for exactly that read, and matrix-grid's categorical row colors would mislead.
- **More than one filled cell per row.** Each row names one position — one `[x]`. Multiple filled cells in a row breaks the "this is where you are" read; use `[-]` for the cells the row can still reach.
- **Unordered axes.** The grid earns its shape when both axes have a real order (shallow to deep, narrow to wide). Two free categorical labels belong in `matrix-2x2`.

## Authoring

```markdown
<!-- _class: matrix-grid -->

## Where each level sits on two axes.

Your position is the diagonal — depth and reach meet at one cell.

`[Wider reach, Deeper cognition]`

| Depth | Self | Team | Org |
| ---------- | :--: | :--: | :-: |
| Advanced   | [ ]  | [-]  | [x] Lead |
| Proficient | [-]  | [x] Senior | [-] |
| Beginner   | [x] Junior | [-]  | [ ]  |
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Verb × reach heading.                  │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Self      │ Team      │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Create    │ ·         │ ◇         │  │
│  │ Apply     │ ◇         │ ■         │  │
│  │ Remember  │ ■         │ ◇         │  │
│  └───────────┴───────────┴───────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`obligation-matrix`](../../legal/obligation-matrix/obligation-matrix.docs.md) — rows × columns of pass/partial/exempt status, not a single position
- [`roadmap`](../../chart/roadmap/roadmap.docs.md) — phases × workstreams delivery status
- [`matrix-2x2`](../../comparison/matrix-2x2/matrix-2x2.docs.md) — two free axes, four cells, qualitative placement
- [`verdict-grid`](../../comparison/verdict-grid/verdict-grid.docs.md) — options scored against shared criteria, one card per option

## Demo deck

See [matrix-grid.gallery.light.pdf](./matrix-grid.gallery.light.pdf) for rendered examples of every variant.
