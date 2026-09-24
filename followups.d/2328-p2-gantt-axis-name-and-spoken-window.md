---
origin: 2328
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2328
---

# Give a gantt's axis window and today point a spoken and visible home

```text
why now   — `[{Timeline, 2026 Q1..2026 Q4, Q3}]` is lifted off the slide and its NAME is
            drawn nowhere (a gantt has no axis caption); in `--read` the pill form speaks its
            raw eyebrow ("2026 Q1 .. 2026 Q4 today Q3") and the list form says nothing about
            the window. The chart's <desc> names neither form's window or today.
where     — lib/components/chart/gantt/gantt.transform.js buildGanttChart (desc + an optional
            time-axis caption); engineering/decisions/2026-09-22-chart-axis-grammar.md
            "Gantt, beside its pills".
done when — both forms narrate the window and today the same way, and the list's name is
            either drawn or the grammar stops asking for it on gantt — decided, not defaulted.
evidence  — --read output for both forms; rendered PDF if a caption is drawn.
verify    — tier 0 gates, plus a visual review if a caption is drawn.
```
