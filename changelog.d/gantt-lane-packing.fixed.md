- **gantt: overlapping tasks in a lane no longer hide each other.** Every task in a
  lane was drawn at one y, so two spans that overlapped on the axis were drawn on
  top of each other and only the later one survived — a lane read as a relay of
  abutting segments however much its tasks actually ran in parallel. Tasks now pack
  into sub-rows: ones that clear each other still share a row, ones that overlap get
  their own, and packing reads the bars rather than the captions, so a long task
  name never invents a row.
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
- **gantt: the chart spans the full width of its box, and is as tall as its rows
  need.** `.gantt-svg` was a height-capped SVG, so a chart whose viewBox was taller
  than its stage did not clip — it letterboxed, narrowing until it fit and taking
  the whole drawing's legibility with it, which is the one failure the Fit Spine
  cannot see because nothing overflows. It is width-driven now (`width:100%;
  height:auto; flex-shrink:0`), the way the `render=html` charts beside it —
  kanban, progress, roadmap — already behave. Measured on the stress gallery page:
  60% → 100% of the chart body's width, captions 12.2px → 20.4px. An oversized
  gantt now overflows and is reported by name ("CONTENT CLIPPED — First cut on
  each: p1 'Workstream 3'") instead of shrinking in silence.
- **gantt: the row band is sized against the measured stage.** The aspect floor the
  band compresses toward was a guessed 2.6; the chart body measures 3.04-3.48
  across the gallery and the demo deck, so it is 3.5 — at least as wide-for-its-
  height as every stage in the corpus, so an ordinary chart fits without relying on
  slack. Bars give up 1.5px for that.
