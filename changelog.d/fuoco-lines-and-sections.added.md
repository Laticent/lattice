- Fuoco knows lines, columns and what a section is called. `lineAt`, `offsetAt`, `placeAt` and `rangeOf`
  turn an offset into a line, column, unit, part and flat number, and a unit or part into its offsets and
  lines. An outline names its two levels with `kinds` (a deck says slide and page; `createTextOutliner`
  takes `kinds` for chapters, cues or functions), and `hub.place()` reports the focus in those words.
