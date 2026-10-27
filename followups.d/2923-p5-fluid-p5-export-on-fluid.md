---
origin: 2923
priority: P5
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P5
---

# Fluid P5: PDF/PPTX and the player run Fluid; one box selector

why now   — until exports run the same adapter, the live surfaces and the exported files can disagree.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P5.
done when — PDF/PPTX run the /dom adapter in Chromium against the page canvas, the fluid CSS / Present fitScale / filmstrip share one box, and the owner signed off dark + light renders.
verify    — build:check green; the gate the §8 row names passes.
