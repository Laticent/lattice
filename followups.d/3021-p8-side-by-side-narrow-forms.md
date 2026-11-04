---
origin: 3021
priority: P8
recorded: 2026-11-03
area: code
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — redline needs an inline-diff form; compare-code and split-panel need stacked forms
source: https://github.com/Laticent/lattice/pull/3021
---

# Narrow forms for side-by-side components: redline inline diff, compare-code and split-panel stacking

why now   — in the Frame Lab, redline spills from 640px and compare-code from 960px; split-panel's panels squeeze.
where     — lib/components/comparison/redline/, lib/components/code/compare-code/, lib/components/statement/split-panel/.
done when — each has a narrow form that keeps its comparison readable, with the fit check on slides.
evidence  — the Frame Lab spill columns for these three.
verify    — npm run lab:build; galleries against main.
