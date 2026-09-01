- `cards-grid` and `verdict-grid` no longer stretch their card rows to fill the stage.
  Both laid a wrapped row of cards on `align-content: stretch`, so every card ran 35-40%
  empty below its text — 38.5% on a four-card `cards-grid`, 35.5% on a three-option
  `verdict-grid`. The row now takes the height its cards need and distributes what is left
  (`align-content: space-evenly`), which empties neither card unevenly: cards within a line
  still stretch to each other, so a row of peers keeps its titles on one baseline.
- `cards-grid` applies that on all three of its emit paths. The family-scoped rule it
  replaces reached only the marp-native `ul`/`ol`, so the lattice.js (`.cards-grid-inner`)
  and editor-fallback paths ran on `stretch` at every aspect.
