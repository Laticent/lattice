- **Fixed: a `matrix-grid` rubric no longer runs off a portrait or story slide.** matrix-grid was the
  only chart-family member with **no adaptive arm at all**, and a table is the shape that can least
  afford to go without one. The `--fs-*` scale multiplies by `--canvas-scale` so text stays readable
  on a narrow deck, so `--fs-body-compact` rendered 17.92px at landscape and **39.96px at portrait** —
  2.2× the type inside a box that got 200px *narrower*. A `table-layout: auto` table cannot render
  below its min-content width, so `width: 100%` was a request the browser was free to ignore: measured
  on the committed gallery matrix, the table ran **1145px inside a 919px box** at portrait with the Verb
  column cut, and 1172.6 inside 912.9 at story. Portrait warned; **story was cut silently**, because that
  overflow lands inside `.chart-body`'s clip and never reaches the slide edge for the corpus probe to see.
  On tall and strip the cell text now steps to `--fs-meta` (a cell label is a chip — the token's stated
  role, and the step `roadmap`, the other table in this bucket, already reasoned out for the identical
  failure), the row label to `--fs-body-compact`, and the paddings to `--sp-2xs`. Landscape and square
  are untouched. Every size now fits, with 50.4px of min-content headroom at portrait and 23.7px at story.
- **`matrix-grid` is now gated at three deck sizes**, using the committed gallery matrix verbatim
  (`test/fixtures/chart-fit.md`) — it was the one chart the fit gate never carried, a gap
  `2026-08-11-stage-owns-the-outer-inset.md` §7.1 had noted and deferred. And `examples/adaptive-sweep.md`,
  whose thesis is "adaptive by box, not by size" and which carried **zero charts**, gains matrix-grid,
  progress and quadrant at `size: story` — none of the three appeared at a narrow size anywhere in the
  268-deck overflow corpus. (#1620)
