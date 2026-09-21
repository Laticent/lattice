- **Added: every picture-bound chart reads its numbers aloud.** A bar chart used to say
  "Revenue · FY26. Growth is concentrated in two regions." and stop — the four regions and
  their four values never reached the voice, because the speech walker skips the `<svg>`
  they live in and only six hand-written narrators existed to replace it. A generic
  data-series narrator now covers every component whose manifest declares `data: true` and
  an `svg`/`spatial` figure, in three list shapes plus a markdown table. Measured with
  `node tools/measure-narration-coverage.mjs`, real CLI and real `--captions`: mean coverage
  0.674 → 0.839 across 71 components, with `line` 0.09 → 1.19, `map` 0.12 → 1.25, `slope`
  0.14 → 1.19, `piechart` 0.16 → 1.03, `word-cloud` 0.16 → 0.88, `stacked-bar` 0.19 → 1.14,
  `heatmap` 0.22 → 1.26, `waterfall` 0.23 → 1.38, `bullet` 0.26 → 1.47, `bar` 0.28 → 1.33
  and `scatter` 0.35 → 1.83. No component regressed.
- It computes nothing and claims nothing. A `scatter` row binds each value to the axis the
  eyebrow names; a `bullet` row's two pills read in authored order, because nothing in the
  Markdown says which is the measure and which the target. The roster is derived from each
  manifest's own `projection` block, so a new SVG chart is covered the day it declares
  itself.
