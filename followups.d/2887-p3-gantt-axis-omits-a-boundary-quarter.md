---
origin: 2887
priority: P3
recorded: 2026-10-25
area: chart
severity: low
swimlane: lib/components/chart/gantt/gantt.transform.js
source: https://github.com/Laticent/lattice/pull/2887
---

# A gantt milestone at `Q4` sits past the last quarter label, with no `Q4` on the axis

```text
  P3 · a point on the window's last boundary draws, but its quarter has no label
       found     — #2887's milestone render: tasks `Q1..Q2`, `Q2..Q3`, a milestone `Q3` and one at `Q4`.
                   The axis prints Q1 Q2 Q3, and the `Q4` diamond sits at the plot's right edge, after
                   Q3, unlabeled. main renders the same (checked with main's own build).
       where     — gantt.transform.js, the derived axis window (a point counts as the start of its quarter,
                   so the window ends at Q4's start and Q4 gets no column).
       done when — a point's quarter is inside the derived window and labeled, or the docs say a point on
                   the boundary needs an explicit `[{…, Q1..Q4}]` axis.
       verify    — render the five-task deck above; the axis reads Q1 Q2 Q3 Q4.
```
