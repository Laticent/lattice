---
origin: 2355
priority: P3
recorded: 2026-09-24
---

# The portrait gantt/state-chart deck trips the type floor on pages 7 and 8

```text
  P3 · [no ticket] examples/portrait-gantt-statechart.md warns TYPE FLOOR on pages 7 and 8.
       why now   — the export reports two scaled figures under the 1% floor. On main they set
                   at 1.9pt; #2355 raises them to 3pt, still short of 5.4pt. #2355 did not cause
                   it and does not fix it.
       where     — the deck has six slides, so pages 7 and 8 are extra export pages; find which
                   figure they carry before touching the layout.
       done when — the deck exports with no TYPE FLOOR line.
       evidence  — `node lattice-emulator.js examples/portrait-gantt-statechart.md out.pdf`
                   stderr on main and on the #2355 head.
       verify    — tier 1: render.
```
