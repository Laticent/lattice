---
origin: 2376
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# a chart pane renders with a stand-in heading the embed then discards

why now   — the chart family's wrap locates the slide's h2, so renderPane gives a chart pane
            an invisible `## ​` and panes.embed drops its masthead (handing back any
            pill it lifted). It works, but it is a workaround future kernels must know.
where     — lib/components/chart/_chart-family/chart-family.js (the wrap), lib/engine/index.js
            (renderPane), lib/core/panes.js (dropMasthead).
done when — the chart wrap accepts a heading-less body and the stand-in is deleted.
evidence  — decision note §6.7.
verify    — test/unit/core/panes.test.js chart-pane and leading-pill cases still pass.
