---
origin: 2962
priority: P7
recorded: 2026-10-29
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §12
deferred: large — a design round for about 30 chart and diagram components, which reflow differently from text components
---

# Charts and diagrams need their own reflow design for narrow boxes

why now   — the owner wants as many components as possible to be responsive. The fit baseline shows about 30 chart and diagram galleries clipping at the narrow sizes (timeline-list 22, progress 21, journey 20, matrix-grid 19, gantt 15, state-chart 15, and more). The shared column rule (followups.d/2962-p3-…) does not apply to a drawing: a chart reflows by moving its legend under the plot, shortening or rotating labels and wrapping categories, while its marks stay as drawn.
where     — the chart and diagram components under lib/components/chart/ and lib/components/diagram/, and engineering/chart-styling.md.
done when — a design note names the narrow-box forms for each chart family (legend placement, label strategy, category wrap, minimum plot size), the owner picks one, and the chart galleries' clip counts at portrait@hall and story@hall fall in the fit ratchet.
evidence  — the design note with rendered options per chart family, then the ratchet diff for the built ones.
verify    — npm run fit:harness -- --only chart --sizes square,portrait,story --venues laptop,hall --packs none --edits none --ratchet test/fit/baseline.json
