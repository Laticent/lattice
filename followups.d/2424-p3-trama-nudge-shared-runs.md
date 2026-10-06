---
origin: 2424
priority: P3
recorded: 2026-10-06
---

# Trama: nudge lines that would share a run apart, rather than trading them for crossings

```text
why now   — the fuzz corpus still pays 31 crossings, all on dagre layouts, mostly on charts
            already at the type cap, where a second ranker has no room
            (engineering/decisions/2026-10-06-trama-crossing-aware-wrap.md §5). Joins are a
            never-rule, so the solver buys a crossing wherever two lines would share a run;
            nudging the runs a lane apart could keep both lines clean.
where     — docs/src/lib/trama/kernel.ts, solveRoutes (sharesRun, lanes)
done when — CROSSING_BUDGET lower with zero hard faults and no join, on both corpora
evidence  — graph-layout.test.js counts; both chart decks rendered light and dark
verify    — tier 2 trio, because it rewrites the shared kernel
```
