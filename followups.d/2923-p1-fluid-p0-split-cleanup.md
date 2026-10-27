---
origin: 2923
priority: P1
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P0
---

# Fluid P0: one split assembly, delete split-slides.js, fix the nine stale split claims

why now   — every later phase reads these files; stale comments misled this audit's scouts.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P0.
done when — the CLI calls structuralSplit, split-slides.js and its test are gone, and the nine claims in §2.4 read true; goldens byte-identical.
verify    — build:check green; the gate the §8 row names passes.
