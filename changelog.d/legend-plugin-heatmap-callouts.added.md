- **Added: the `legend` plugin, and heatmap callouts as its first capability.** A heatmap can now
  point at a cell in one line under its table:
  `` `@legend{{Onboarding change, tag, c4, for="Feb 2026 · M2"}}` ``. The label sits in a lane
  beside the grid, and a number ties it to its cell: the cell is ringed and carries a numbered
  marker in its corner, and the same marker leads the label. No line crosses the grid, so no
  printed number is covered. The marker is a circle in its number's color by default, sized
  from its cell, and the pill's shape and color words restyle it. `detail="…"` joins the cell's hover card and the speaker note, and
  narration reads each callout after the rows. A `for=` that names no cell is listed in the
  chart's description, and `lint:deck` rule `legend-span` warns on a span that does not read
  or that sits on a slide where no component reads one yet. The plugin is on by default; an
  author turns it off with `legend: off` in the front matter, or `legend-off` on one slide
  (`legend-on` turns a slide back on), which hides callouts while keeping their detail in the
  speaker note. It is the first wave of one model for every chart key and label
  (`lib/plugins/legend/legend.docs.md`,
  `engineering/decisions/2026-10-19-universal-legend.md`).
