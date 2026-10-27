---
origin: 2923
priority: P3
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P2
---

# Fluid P2: carry seams in rendered markup and retire the baked capacity map

why now   — the post-render design needs the structure in the HTML; the splitCapacityFrom whitelist silently drops fields.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P2.
done when — the engine writes data-fluid-* seams, the capacity map bake and whitelist are gone, strategies only shape pages, and the owner has reviewed the gallery page-count diff (code slides change).
verify    — build:check green; the gate the §8 row names passes.
