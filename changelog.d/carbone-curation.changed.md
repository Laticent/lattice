- **Carbone's charts and diagrams now read as distinct colors, on both faces.** Its
  categorical cycles used to step around the hue wheel in order (green, emerald, cyan,
  blue…), so the first three series of any chart read as three greens and a flowchart as
  mint on mint. The same hues now run most-distinct-first — green, blue, orange, violet,
  cyan, magenta… — the way `indaco` and `cuoio` alternate. The closest adjacent pair rises
  from 0.056 to 0.196 OKLab on the diagram marks and from 0.094 to 0.198 on the chart
  cycle. This moves the dark face too: the slot order changed, not the pigments, so the
  earlier note that carbone-dark's values are byte-identical to the pre-split palette
  holds for its surfaces and ink only.
- Carbone's light-face diagram fills moved from near-white (OKLCH L 0.97, invisible on the
  canvas) to a visible wash of each hue (L 0.89), and its light chart colors deepened from
  the 3:1 floor to 4.6:1 so they read as the pigment rather than a pastel.
- Carbone's chart `warn` and `fail` are now amber and signal red, where they were orange
  beside coral. Their worst-case separation across normal vision and the three simulated
  color-vision deficiencies rises from 0.026 to 0.075 (light) and 0.055 to 0.103 (dark).
- `npm run scorecard` moves carbone from 69.6 (D) to 84.9 (B), level with `indaco`.
