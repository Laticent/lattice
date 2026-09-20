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
- **gantt: the chart never shrinks to absorb an oversized plan.** Bars, captions
  and row spacing are a fixed size whatever the chart carries — every gantt draws
  its bars at one height and its captions at one size, and more rows make the chart
  taller rather than smaller. An intermediate version of this change compressed the
  row band as the row count rose, which is the engine quietly covering for a slide
  carrying too much: the bars thin out, the chart still "fits", and nobody is told.
- **gantt has a stated BUDGET instead of a shrink.** Count bar ROWS, not lanes:
  overlapping tasks stack, and inclusive spans overlap more than they look
  (`Q1..Q2` then `Q2..Q3` both cover Q2), so a sequential-looking plan written that
  way costs two rows a lane. The status key costs about another lane (21 viewBox
  units). Measured with a key on a 1152x335 chart body: four one-row lanes fit and
  five overflow; on a roomier stage five fit. The numbers are in the component's
  docs and the enforcement is the render — past the budget a chart overflows and is
  named (`CONTENT CLIPPED`, with the first thing cut) rather than quietly scaled
  down. Four shipped decks were over the budget and are now inside it.
- **An over-budget gantt keeps its axis.** The chart is centered in its stage with
  `safe center`, so a chart TALLER than the stage aligns to the top and loses its
  tail rather than being centered and clipped at both ends — which took the time
  axis off the top, and a gantt without its axis is unreadable in a way one missing
  its last lane is not.
