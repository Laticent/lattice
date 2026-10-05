---
origin: 2424
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2427#issuecomment-5864048730
---

# Trama: crossing-aware wrap placement, and nudging for lines that share a run

```text
why now   — the reading-order grid places boxes blind to the lines, so the router pays
            for placement in crossings and time. The fuzz corpus went from 10 to 39
            crossings when joined and collinear runs became a hard fault, and solveRoutes
            is 69% of a wrapped layout call (CPU profile of the 11-state chart). Proposed:
            wrap as a width-bounded layering (Coffman–Graham) with barycenter ordering
            inside each row, so crossings are settled at placement; then nudge shared runs
            apart instead of trading them for crossings. A genetic search was considered
            and rejected (thousands of routings per chart, and non-deterministic).
            It is also the remaining lever for the state chart's live-typing gap: the fit
            loop (#2427's secant step) and a flowchart-sized tile were both measured on #2424
            and neither closes it; what is left is the cost of one routing pass.
where     — docs/src/lib/trama/kernel.ts (wrapped, solveRoutes, the grid layoutOnce path)
measured  — 2026-10-05: engineering/decisions/2026-10-05-graph-chart-typing-latency.md. The
            cap is rarely hit (0 capped routings on either bench deck); the router is 23-38%
            of a 70-101 ms key on the real Studio. The note proposes main-thread and
            stale-job cuts first; the owner picks.
done when — bench GRAPH LAYOUT faster and CROSSING_BUDGET lower, with zero hard faults
            across the shipped corpus (state-chart.test.js corpus quality)
evidence  — npm run bench before/after, graph-layout.test.js fuzz counts, both chart decks
            rendered light and dark
verify    — tier 2 trio, because it rewrites the shared kernel every graph chart draws
            through
```
