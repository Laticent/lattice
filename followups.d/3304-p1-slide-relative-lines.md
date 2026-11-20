---
origin: 3304
priority: P1
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/gotchas/memory-profiling.md
deferred: large — about 1,500 fixed-px lengths across the engine's layout CSS; every gallery's goldens and the export bytes move, and the owner asked for it as its own PR (2026-11-20)
source: https://github.com/Laticent/lattice/pull/3304
---

# Make line weights slide-relative, so a 4K deck renders the same on HD and 4K

PR #3304 lays a 4K deck out on HD wherever the screen shows the slide at 2,560 device px or fewer across
(`lib/core/screen-canvas.mjs`; the Studio's live frames and the exported player). Text, icons and positions match
within 1 px between the two canvases, and sharpness follows the screen's density, not the canvas (an HD layout drawn
at 3x matched native 4K at 3840 px, 2026-11-20). What still differs is LINE WEIGHT, and with it a few line breaks:

- About 1,500 literal px lengths in the layout CSS (rules, borders, accents, texture stripe periods) do not scale with
  the canvas, so on HD they draw up to 3x heavier relative to the slide. Heaviest files: `lib/base/base.sketch.css`,
  `lib/components/math/math.styles.css`, `lib/base/base.modifiers.css`, `lib/plugins/chart-family/chart-family.styles.css`.
- `clamp(px, cqi, cap)` weights hit their cap at 4K (`--chart-hairline`, `--chart-fill-accent`; gantt's accent in
  `gantt.transform.js`).
- The overflow tolerance is 12 absolute px (`lib/core/overflow-probe.js` `FRAME_TOLERANCE`), so HD and 4K can disagree
  on what fits, which toggles `.lat-reflow-held`.
- Measured: of 120 gallery pages rendered both ways, the median differs on 1.3% of pixels and the worst on 5.1%; card
  texts rewrap on gallery slides 53 and 107 (red team, PR #3304).

done when — a 4K deck rendered at `--size deck` and at `--size hd`, both rasterized to the same width, differ only
in anti-aliasing on every gallery page (a pixel-diff gate, not a look), the fit tolerance is a fraction of the slide,
and the owner has signed off the moved goldens and export bytes in dark and light. Then the screen canvas switch in
#3304 is invisible as well as safe.
