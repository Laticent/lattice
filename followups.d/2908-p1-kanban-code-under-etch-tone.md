---
origin: 2908
priority: P1
recorded: 2026-10-28
area: chart
severity: high
swimlane: engineering/decisions/2026-10-28-finish-invariant.md §4
deferred: off-path — the finish-invariant study's brief scopes it to analysis and sends each fix to its own PR
source: https://github.com/Laticent/lattice/pull/2908
---

# Inline code on a kanban card falls under 4.5:1 under etch and tone

```text
  P1 · Cap the light-slide kanban card wash at 8% under every finish
       why now   — #2908 gave etch and tone kanban cards a wash (tone 12%, etch 14% on a light slide) above
                   the 8% ceiling inline code tolerates. Measured: etch 4.07:1 on carbone, cuoio, indaco and
                   laguna light (and their -dark twins in light mode), tone 4.19:1 on carbone light. Shipped
                   on main; the chart gallery misses it because its code sits on cards no finish washes.
       where     — tools/build-marks-css.js § KANBAN (`wash` / `tint`), light face only; dark clears.
       done when — every <code> run on a plain kanban card clears 4.5:1 on every theme x mode under all three
                   finishes, and a unit test pins the light-face wash at or under 8%.
       evidence  — the tint sweep and per-finish table in the decision note §4 (8% → 4.52:1 worst).
       verify    — tier 1: the probe in the note's §2 over all 32 themes, plus a rendered look at an etch board.
```
