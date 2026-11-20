---
origin: 3335
priority: P13
recorded: 2026-11-20
area: engine
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §7
deferred: large — a keep-out hook on the finish layer plus three new finishes
source: https://github.com/Laticent/lattice/pull/3335
---

# L6, L7: a finish keep-out and grid, halftone and ruled finishes

why now   — Blueprint, Riso and Field Notes hand-place background plates; a true halftone needs dot size to follow tone; ruled paper needs to snap to the body line-height.
where     — lib/base/base.finish.css (the layer stack and :1242 no-finish), lib/finishes/.
done when — the finish clears the masthead box, footer box and hero stack by itself; `finish: grid|halftone|ruled` render in both modes; Field Notes and Riso rescored at 8.5 or higher by an independent judge.
