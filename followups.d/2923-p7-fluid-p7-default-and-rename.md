---
origin: 2923
priority: P7
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P7
---

# Fluid P7: fluid by default, retire --fluid, rename the autosplit vocabulary, absorb the notes into engineering/fluid.md

why now   — two names for one operation is what this design ends.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P7.
done when — --fluid and fluid: are retired; no autosplit/split-* name remains in engine vocabulary; the Fit Spine and 2026-09-01 notes are absorbed into engineering/fluid.md.
evidence  — build:check and a vocabulary grep in the PR.
verify    — npm run build:check; the gate named in the §8 row for P7.
