---
origin: 3021
priority: P7
recorded: 2026-11-03
area: comparison
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — each component needs its own narrow form that keeps what position means
source: https://github.com/Laticent/lattice/pull/3021
---

# Refined stacks for components whose meaning is position: matrix-2x2, quadrant, risk-matrix

why now   — stacking these naively loses which corner means what. Each stacked cell has to carry its position as a label ("High impact · Low effort") and keep its color.
where     — lib/components/comparison/matrix-2x2/; the quadrant and risk-matrix chart kinds.
done when — each stacks in a narrow box with its position labeled, and full-width renders are unchanged.
evidence  — the Frame Lab entries.
verify    — npm run lab:build; galleries against main.
