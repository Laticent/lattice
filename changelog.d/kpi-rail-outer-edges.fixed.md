- **Fixed: `kpi` draws a rule between its rows, never around them.** The support
  rail bracketed itself — a heavy rule above the first support and another below
  the last — and `compliance` carried the same defect one modifier over, a border
  under every row plus a heavy one under the last. Those are outer edges, not
  separators; `2026-09-03-table-outer-edge-rules.md` retired the same thing across
  the table family. Interior separators are unchanged at 1px `--border` and move by
  at most half a pixel at the painted edge — removing the floor takes a pixel of
  border out of the column and `compliance`'s `space-between` list hands it back to
  the gaps (+0.00px and +0.50px on the gallery). At `tall` and `strip`, where the rail linearizes
  into one ledger, the demoted hero loses the same outer top edge and the first
  support gains the separator that now divides it from the lead row.
- **Changed: the `kpi compliance` row no longer declares a status column it cannot
  fill.** The pill declared `grid-column: 3` but sat one level too deep to be a grid
  item, so the track resolved to 0px and the rule read as working while doing nothing.
  The phantom track is gone and the row is a truthful two-column grid, which
  hands its column gap back to the label: 858.9px to 922.9px, 64px reclaimed. The pill still
  trails its text: right-anchoring it needs a wrapper element around the label, which
  is a DOM change rather than a CSS one.
- **Fixed: a third sub-bullet on a `kpi compliance` row no longer prints on top of
  the second.** Every sub-bullet after the first was pinned to the same grid row.
- **Fixed: `kpi spotlight` supports sit under the rule that heads them,** and a
  fifth metric lands in the rail instead of under the hero card.
- **Fixed: `kpi trajectory` sizes its columns to the metrics authored.** The grid
  was pinned at four, so a 3-metric slide — the count the docs recommend — left an
  empty 270px track, 23% of the stage.
- **Changed: the `kpi` hero is composed as the focus it is.** Its content centers on
  both axes — value, label and status line together — instead of parking in the upper
  left, and the corner spark, orphaned once the content centers, retires. The value's
  size is deliberately unchanged: it is author-supplied text of unbounded width, and
  scaling it made ordinary figures like `$12,480,000` print over the rail. The column
  ratio is unchanged too — sweeping it showed the rail wraps at the documented density
  at every ratio worth having, so the split was never the lever.
- **Fixed: a `kpi spotlight` support's value keeps a lead under the rule that heads it,
  at `wide` and `square`.** Top-aligning the rail packed the value against its hairline —
  an accented capital measured 0.00px of white between rule and ink, at 400dpi and at 1x,
  and a `$` merged into the line at 1x. The lead is `0.12em` on the ruled rows. That is
  the ceiling a 4-metric slide allows: 0.13em is the first value that pushes the row past
  the stage (1.13px at 16:9) and the status pill starts losing ink at 0.14em, none of
  which the export's overflow warning reports. Measured at 600dpi the lead leaves `École`
  2.24px, `Ålborg` 2.40px, `Ärlig` 3.20px, `$2.4B` 6.24px and a bare `2.4` 18.72px.
  Doubly-marked capitals stay a known miss: `Ǻ` (U+01FA, ring *and* acute — not `Å`,
  which clears) starts its ink 5.60px above the hairline, and eight more cross by
  1.9–7.9px, further than the whole lead reaches.
- **Known, not fixed: at `tall` and `strip` the value's accent touches the rule above
  it.** Measured 0.00px across the full ledger width. No lead is applied there because
  one clips a dense 4-metric portrait deck inside the documented `tall.soft: 4` — so the
  choice is a crossing or a clip, and the crossing keeps the author's fourth metric. The
  crossing is largely pre-existing: one ruled row crosses without the row-2 separator
  this change adds, and this change takes it from one row to two. Closing it needs a
  type-metrics change (the value's line box or its size), not a padding.
