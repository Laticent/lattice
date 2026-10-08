---
origin: 2609
priority: P2
recorded: 2026-10-08
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-08-library-trio-before-publish.md
source: engineering/decisions/2026-10-08-library-trio-before-publish.md §3 (TRA-R1)
---

# Trama's route solver has a work budget but no wall-clock bound

why now   — the red team measured `solveRoutes` (docs/src/lib/trama/kernel.ts ~1013) at 1.2 s for
            20 shapes and 60 edges, 12.5 s at 80/240 and 79 s at 160/480; `K.route()` alone took
            23 s at 160/480. The first sweep is not counted against `BUDGET`, and each evaluation
            scans every route, so a large chart blocks the render thread.
where     — docs/src/lib/trama/kernel.ts `solveRoutes`; the flowchart and state-chart adapters.
done when — the first sweep counts against the budget (or shapes and edges are capped with a
            degraded layout and a lint finding), and 160/480 lays out in under 2 s.
evidence  — `npm run bench` before/after with a scenario at 80/240 and 160/480 (HARD RULE #19).
verify    — tier 1 checker; the layouts of every shipped chart must not move (goldens).
