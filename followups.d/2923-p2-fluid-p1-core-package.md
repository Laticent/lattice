---
origin: 2923
priority: P2
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P1
---

# Fluid P1: the @laticent/fluid pure core, with splitDoc as a connector over it

why now   — P2-P6 all build on the core's plan() and familyFor.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P1.
done when — the package exists with a boundary gate like checkMosaicoBoundary, splitDoc output is byte-identical on every gallery at square/tall/strip, and a bench scenario is blessed (HARD RULE #19).
verify    — build:check green; the gate the §8 row names passes.
