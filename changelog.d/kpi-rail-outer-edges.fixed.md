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
- **Fixed: a `kpi spotlight` support's value keeps a lead under the rule that heads
  it.** Top-aligning the rail packed the value against its hairline: an accented
  capital measured 0.00px of white between rule and ink, at 400dpi and at 1x, and a
  `$` merged into the line at 1x. The lead is 0.12em, on the rows that carry a rule —
  `li:nth-child(n+3)`, plus `li:nth-child(2)` at `tall`/`strip`, where the reflow
  gives the first ledger row a border too. 0.12em is the ceiling a 4-metric slide
  allows: 0.13em shears the 4th status pill at 16:9, which the export's overflow
  warning does not report. At 1x the lead leaves `École` 1.0px, `Ärlig` 2.0px,
  `$2.4B` 6.0px and a bare `2.4` 18.0px.
