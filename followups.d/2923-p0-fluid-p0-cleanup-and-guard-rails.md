---
origin: 2923
priority: P0
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P0
---

# Fluid P0: one split assembly, the parity golden, the one-paginator gate, strip forged seams, engineering/fluid.md

why now   — every later phase is checked against the golden and the gate; stale comments misled this design's own audit.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P0.
done when — the CLI calls structuralSplit; split-slides.js and its references are gone; the nine §2.4 claims read true (#506's body edited only with the owner's OK); the per-page parity golden exists; checkPaginationOwners + SANCTIONED_PAGINATORS fail on a planted second paginator; author-written data-fluid-*/data-split-* are stripped; engineering/fluid.md has the fluid-view vs Fluid glossary.
evidence  — the gate's mutation arm, and the golden's command and deck list in the PR body.
verify    — npm run build:check; the gate named in the §8 row for P0.
