# risk-matrix

> A 5 × 5 likelihood × impact grid shaded by severity, with each risk as a numbered marker and a key that lists them worst first.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — The grid, the markers, the arrows and the key are one `<svg>`. A risk is placed by two whole numbers, so the grid is drawn in one coordinate system and the key reads its numbers off the same markers.

**Tags** `risk` · `assessment` · `board-deck` · `prioritize`

Use for a risk register a board or risk committee reviews: enterprise risk, a project's top risks, an underwriting portfolio's exposures. Each risk is placed by its likelihood and impact (1 to 5); the cell's shade is its band (low, medium, high, critical from likelihood × impact); an optional second position shows where mitigation should take it.

## Agent contract

**By venue** no count budget. A chart scales its marks to the box instead of clipping, so no count marks where it stops fitting.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name what is in the red and what is being done ('Cyber and hurricane risk sit in the red; both have a plan'), not 'Risk matrix'. |
| `risks` | `ul > li` | yes | One li per risk: its name, then a point record `{likelihood, impact}`, each a whole number from 1 to 5 — `Cyber outage \`{4, 5}\``. An optional second record is where mitigation takes it: `\`{4, 5}\` \`{2, 4}\``. Risks are numbered in the order written; the key lists them worst first. |
| `detail` | `li > ul` | no | Optional nested sublist under a risk: the owner, the mitigation, the date. It opens on hover or tap in Present, and folds into the speaker note in the PDF. |

### Common mistakes

- **Writing impact first (`{5, 4}` for likelihood 4, impact 5).** The record is `{likelihood, impact}`: likelihood runs across the bottom, impact up the side, the way the grid is drawn.

### Data shape

- Each record is two whole numbers from 1 to 5. A decimal, a 0 or a 6 is not placed, and the row is left out of the grid and the key.
- Bands come from likelihood × impact: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical.

## When to use

- **A register the board reviews.** A risk matrix earns its slide when the question is which risks are severe and whether they are moving. For a ranked list with owners and dates, use a `table`; for two arbitrary axes, use `quadrant`.
- **Three to ten risks.** The key lists every risk beside the grid, so past ten the rows tighten and the type with them. Show the top ten here and the full register in an appendix table.

## When NOT to use

- **Scores that are not 1 to 5.** The grid is five by five. A 1-to-10 or percentage scale has to be mapped to five bands first; a value outside 1 to 5 is not placed.
- **Using it as a scatter.** Positions snap to whole cells, so two risks a decimal apart land together. When the exact position matters, use `scatter` or `quadrant`.

## Authoring

```markdown
<!-- _class: risk-matrix -->

## Where our top risks sit.

- Risk one `{4, 5}`
- Risk two `{3, 3}`
- Risk three `{2, 4}`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│        Where the pipeline leaks.        │
│                                         │
│   Visitors    [============]   12,000   │
│     62%        [========]      4,800    │
│   Activated    [=====]         2,160    │
│     40%        [==]              864    │
│   Paid         [=]               670    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`heatmap`](./heatmap.md) — a grid of numbers shaded by value, not a register of named risks
- [`quadrant`](./quadrant.md) — items placed on two continuous axes with four named zones
- [`table`](./table.md) — the full register, with owners, controls and dates

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/risk-matrix>
