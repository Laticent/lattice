---
origin: 2376
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# a pane's shape family is estimated from a fixed stage fraction, not measured

why now   — `paneGeometry` (lib/engine/index.js) classifies each pane from STAGE_FRAC
            (1164x488 of 1280x720), but the real stage height moves with the subtitle and
            the coda (192px on the demo's first slide), so a pane can reflow for the wrong
            family.
where     — lib/engine/index.js (paneGeometry), the runtime pass that re-stamps
            `data-family` on sections (lib/adaptive/families.js is the one classifier).
done when — the runtime re-stamps each `<lat-pane>`'s data-family/orientation from its
            laid-out box, and a chart pane's kernel re-lays out if the family changed.
evidence  — engineering/decisions/2026-09-25-panes-two-components-one-slide.md §6.1.
verify    — a panes slide with and without a subtitle: the pane's data-family matches
            familyFor(its measured w/h) in both.
