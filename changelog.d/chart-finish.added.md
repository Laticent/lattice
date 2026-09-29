- **`chart-finish:` picks how every chart on a deck spends its color.** Three finishes:
  `pigment` (full-strength bodies under an ink edge), `etching` (a whisper of a body under a
  doubled edge) and `tone` (one hue in eight value steps, every name in its ink). The key
  repaints with the marks it keys. Omit the key, or set `chart-finish: off`, and every chart
  renders exactly as before. A slide can override the deck with `_class: chart-finish-<name>`,
  or opt out with `chart-finish-off`, and `lint:deck` flags an unknown value
  (`unknown-chart-finish`).
- A finish never costs a reader contrast or the texture channel. Text on a mark (a heatmap
  value, a matrix-grid cell, a status pill) picks black or white from its own mark's color and
  clears 4.5:1 on every theme tested, the a11y and print themes included. On a browser too old to
  pick that ink, a mark that carries text keeps its as-designed colors, and every other mark
  still takes the finish. The a11y themes'
  pattern fills still win over any finish. `line` and `slope` are left exactly as designed, and
  a status (a gantt bar's `blocked`) keeps its own color under every finish.
