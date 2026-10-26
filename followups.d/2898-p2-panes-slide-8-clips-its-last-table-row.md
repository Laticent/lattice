---
origin: 2898
priority: P2
recorded: 2026-10-25
area: engine
severity: medium
swimlane: engineering/decisions/2026-09-25-panes-two-components-one-slide.md
source: https://github.com/Laticent/lattice/pull/2898
---

# `examples/panes.md` slide 8 clips its last table row under the chart

why now   — the export warns `OVERFLOW — 1 slide exceed the frame and is CLIPPED in this export: page 8`,
            and the Q3 row of the table is cut by the bar chart below it. The deck is a pane demo.
found     — `node lattice.js examples/panes.md -o panes.pdf` on 919689d and on #2898, byte-identical.
where     — the stacked pane split on that slide (table over chart); either the deck's content or the
            stack's share for a table pane.
done when — page 8 renders with no overflow warning and the full table visible.
verify    — render `examples/panes.md` and send page 8 via SendUserFile.
