---
origin: 2714
priority: P2
recorded: 2026-10-16
area: chart
severity: medium
swimlane: engineering/decisions/2026-06-19-chart-adaptive-sizing.md
source: https://github.com/Laticent/lattice/pull/2714#issuecomment-6234364708
---

# `check:chart-fit` cuts two portrait charts: progress and timeline-list

```text
  P2 · [no ticket] Two crowded fixture slides paint past the stage in portrait, and the stage clips them.
       why now   — found while adding the tower to test/fixtures/chart-fit.md in #2714; the same two
                   failures appear on the fixture as committed (without the tower slide), so they
                   predate #2714 and are off its path.
       where     — `npm run check:chart-fit`: [portrait] progress, bottom +11.6px; [portrait]
                   timeline-list, bottom +174.1px (slides 15 and 23 of the fixture).
       done when — both slides fit their portrait stage, or each component's manifest budget steers
                   the author away from the crowded case before it clips.
       evidence  — `npm run check:chart-fit` output on main and on #2714, identical for these two.
       verify    — tier 1: rerun `npm run check:chart-fit`, then render both slides portrait and look.
```
