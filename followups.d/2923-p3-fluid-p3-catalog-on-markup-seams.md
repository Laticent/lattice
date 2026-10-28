---
origin: 2923
priority: P3
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P3
---

# Fluid P3: seam census, then migrate the catalog to data-fluid-* behind a ratchet

why now   — the baked capacity map and the splitCapacityFrom whitelist silently drop fields; the four silent clips need a ruling.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P3.
done when — every strategy is sorted into seam or presentation; the enrolled-via-markup count reaches 37 and the bake and whitelist are deleted; perPage is gone; logo-wall, matrix-grid, state-chart and obligation-matrix each have a seam or a ring-by-rule; the owner reviewed the gallery page-count diff.
evidence  — the gallery page-count diff, reviewed.
verify    — npm run build:check; the gate named in the §8 row for P3.
