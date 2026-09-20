- **gantt: overlapping tasks in a lane no longer hide each other.** Every task in a
  lane was drawn at one y, so two spans that overlapped on the axis were drawn on
  top of each other and only the later one survived — a lane read as a relay of
  abutting segments however much its tasks actually ran in parallel. Tasks now pack
  into sub-rows: ones that clear each other still share a row, ones that overlap get
  their own. A one-task-per-lane chart is unchanged.
- **gantt: bar captions stop truncating with room to spare.** A caption's budget was
  bounded by the next task in the LANE rather than the next mark on its own row, so
  `Scoring model v2` ellipsized to `Scoring model…` against a bar more than twice as
  wide as the text.
- **gantt: a milestone that falls inside a bar's span gets its own row.** It used to
  be drawn on top of the bar; in dark mode an unstated milestone and an unstated bar
  resolve to the same fill, so the diamond all but disappeared.
- **gantt: the bar's leading accent is clipped to the bar.** It carried a smaller
  corner radius than the bar (0.83 against 3), so across the rounded corner its
  corners stood outside the bar's silhouette and the bar's own stroke ran between
  the two as a seam — the left edge read as a tab stuck to the side rather than the
  bar's own edge.
- **gantt: the status key's swatch is centered on its label.** The swatch sat at
  `ly - swatch*0.8` against a label drawn `dominant-baseline: central` on `ly`,
  putting its center 30% of its own height above the text — measured 15px out at
  200dpi.
- **gantt: the `today` rule is a neutral reference drawn behind the bars.** It wore
  `--state-info-ink`, the same ink as its own `live` / `pilot` / `decision` bars, and
  was painted over them at full strength. It now takes `--text-heading`, like every
  other reference line in the chart family, and sits under the marks.
- **gantt: two independent tasks that abut on the axis show a real gap.** The
  inter-bar gutter went 1.5 → 2.5 viewBox units; at 1.5 the two bars' strokes closed
  the gap to nothing.
- **gantt: a dense chart keeps using its stage.** The row band now compresses once
  the viewBox aspect would fall past a floor, and `.gantt-svg` joins the family's
  container-fill sizing instead of the `height:auto` pattern a 2026-07-04 decision
  ruled out. Measured on the stress gallery page: 60% → 75% of the chart body's
  width, captions 12.2px → 15.3px.
