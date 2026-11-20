---
origin: 3335
priority: P7
recorded: 2026-11-20
area: chart
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §4
deferred: large — a new mark renderer for every chart kind
source: https://github.com/Laticent/lattice/pull/3335
---

# Hand-drawn chart marks for sketch mode

why now   — ingredient 3; Field Notes needs it, and Chalkboard returns with it (D3, third).
where     — lib/plugins/chart-family and the marks register.
done when — sketch mode draws chart marks with rough strokes and a hatched fill that pass 3:1, and Field Notes scores at 8.5 or higher (D5).
