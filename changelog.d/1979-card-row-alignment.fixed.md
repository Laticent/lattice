- `cards-grid` and `verdict-grid` no longer stretch their card rows to fill the stage.
  Both laid a wrapped row of cards on `align-content: stretch`, so every card ran 35-40%
  empty below its text — 38.5% on a four-card `cards-grid`, 35.5% on a three-option
  `verdict-grid`. The rows are content-height and centered now (`align-content: center`),
  which empties no card unevenly: cards within a line still stretch to each other, so a row
  of peers keeps its titles on one baseline, and the row gutter stays at `gap` so the grid
  still reads as a grid.
- `cards-grid` says it on every container rule it has, not just the one a family override
  happened to reach. The rule that actually governed the landscape family was the
  `:not(:has(.cards-grid-inner))` fallback, which outranks the base rule.
- At tall and strip `cards-grid` still paces its cards down the frame — there the cards are
  full-width, so it is a column rather than a grid, and there is no gutter to keep.
