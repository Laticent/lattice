---
origin: 2415
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2415
---

# Scenes for the components the narrator does not bind yet

why now   — engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §6 lists a scene
            for every chart and diagram. #2415 binds the 22 chart components whose narrators exist
            (the gate is test/unit/core/scene-binding.test.js). These still reach the Guide only by
            their words (the old text path), so each delivery's style reaches them only partly:
            - flowchart: no narrator at all; its edges carry an index but no data-from / data-to.
            - diagram (Mermaid): Lattice stamps nothing on Mermaid's SVG; verify Mermaid's own ids
              survive the render, then stamp data-mark from the parsed source.
            - table: the projection's "Row — Col: value" sentences resolve by words
              (findTableRowTarget); a table narrator would bind rows and columns outright.
            - kpi, stats, matrix-2x2, verdict-grid, cycle, list-steps, list-tabular: list items,
              resolved by words; a scene through `handles` would give them acts.
            - gantt lanes: a lane is its label only; stamp data-lane on its tasks so `enter lane`
              focuses the lane's bars.
where     — lib/core/chart-narration.js (narrators), lib/components/<bucket>/<name>/*.manifest.json
            (`scene`), the renderers named above for the stamps.
done when — each listed component has a scene, its gallery passes scene-binding.test.js, and its
            score is blessed in test/fixtures/delivery-scores/.
evidence  — the gate and the goldens; a filmstrip of one slide per component under each delivery.
verify    — tier 0 gates plus a Studio filmstrip.
