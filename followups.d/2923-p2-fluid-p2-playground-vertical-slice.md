---
origin: 2923
priority: P2
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P2
---

# Fluid P2: the /dom adapter on the Playground (move, unapply, watch), with the identity rig and the jank canvas axis

why now   — it retires the riskiest unknowns on one surface before the catalog migrates; it closes #506 for the Playground, and #506 does not cover panes or the jank axis.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P2.
done when — a 16:9 deck paginates in a narrow Playground frame; page chrome is built host-side; identity ≥ 96.8%; check:jank has a canvas axis (390/820/1440, rotate, resize storm, URL-bar collapse, scrollbar loop); the render-time family-read inventory is written.
evidence  — three-width screenshots and the jank rig output in the PR.
verify    — npm run build:check; the gate named in the §8 row for P2.
