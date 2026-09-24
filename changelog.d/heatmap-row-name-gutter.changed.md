- **`heatmap` sizes its row-name gutter to the names, so they read on one line.** The
  gutter was a fixed 52 of the chart's 320 units, which wrapped ordinary cohort names:
  "February 2026" and "September 2026" each took two lines while "May 2026" took one,
  and "Product-led signup" broke mid-word. The gutter now grows to the widest row
  name on a single line, up to `bar`'s 96-unit ceiling, and shrinks for short names
  so the grid gets the width back. It never grows at the cells' expense: it stops
  where a cell value or column name that printed at the old width would be dropped,
  and past that a long name wraps as before. Demo: `examples/heatmap-row-names.md`.
