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
| `eyebrow` | `p:first-of-type > code` | no | Optional inline-code axis caption. Two parts separated by `·` — the first labels the column (reach) axis and renders above the grid, the second labels the row (depth) axis and renders rotated along the left edge, e.g. `Wider reach → · Deeper cognition ↑`. A single part with no `·` renders as the column-axis label only. |
| `subtitle` | `h2 + p` | no | One supporting sentence under the heading, framing how to read the grid. |
| `matrix` | `table` | yes | Markdown table — the header row is the reach/scope axis, the first column of each body row is the category axis. Cells use the positional grammar ([x] / [-] / [ ]); a filled cell's trailing text is its label. |
| `legend` | `p:last-of-type` | no | Optional single trailing paragraph, doubling as the chart caption — what the three cell states mean, plus any caveat about the placements. A leading `**bold**` run renders as a filled swatch + label, a leading `*italic*` run as an outlined swatch + label; keep both in this ONE paragraph (a second trailing paragraph is not lifted into the caption). |

### Common mistakes

- **Authoring `[x]` with no trailing label, e.g. `| [x] |` alone.** A filled cell's text IS the row's title at that reach — `[x] Senior`, not a bare marker. An unlabeled filled cell renders as an empty colored box.
- **Skipping the legend paragraph.** A first-time reader can't infer filled/half/empty from color alone (deliberately — the row hue carries category, not state). One trailing sentence naming the three states is what makes the grid legible without a caption underneath every cell.

### Data shape

- The header row's first cell is conventionally blank or names the category axis; the remaining header cells are the reach/scope axis labels in ascending order.
- Body rows go deepest/highest category first — the row order IS the depth axis, so declare rows in the same descending order you'd want read top-to-bottom.
- Up to eight rows are colored from the chart family's categorical palette before hues repeat; past eight, split into two grids.

## When to use

- **Both axes are ordered categories.** A depth ladder (skill, seniority, maturity) crossed with a reach or scope ladder (self, team, org, field). If either axis is a free, unordered label, reach for `matrix-2x2` (two axes, four cells) instead.
- **One position, not a status report.** The grid exists to show where a single subject sits — a role, a maturity level, a capability — not to track many items' pass/fail state. For that, `obligation-matrix` (regulation × obligation) or `roadmap` (phase × workstream) fit better.
- **Row category carries the color.** Each row is colored by its own hue from the chart family's categorical palette, not a status palette — there's no universal 'good' or 'bad' cell here, only which row and how far it reaches.

## When NOT to use

- **Pass/fail or delivery status.** If cells mean shipped/at-risk/blocked, use `obligation-matrix` or `roadmap` — their semantic state palette (pass/warn/fail) is built for exactly that read, and matrix-grid's categorical row colors would mislead.
- **More than one filled cell per row.** Each row names one position — one `[x]`. Multiple filled cells in a row breaks the "this is where you are" read; use `[-]` for the cells the row can still reach.
- **Unordered axes.** The grid earns its shape when both axes have a real order (shallow → deep, narrow → wide). Two free categorical labels belong in `matrix-2x2`.

## Authoring

```markdown
<!-- _class: matrix-grid -->

`Reach → self · team · org`

## Where each level sits on two axes.

Your position is the diagonal — depth and reach meet at one cell.

| Depth | Self | Team | Org |
| ---------- | :--: | :--: | :-: |
| Advanced   | [ ]  | [-]  | [x] Lead |
| Proficient | [-]  | [x] Senior | [-] |
| Beginner   | [x] Junior | [-]  | [ ]  |

**Your position** · *reachable*
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
