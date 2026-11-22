---
origin: 3335
priority: P14
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §7
deferred: blocked — changes the bytes of every exported PDF, which needs the owner's export sign-off (Quality Bar)
source: https://github.com/Laticent/lattice/pull/3335
---

# L9: the PDF photographs every page background at 96 ppi

why now   — measured on shipped classic and editorial as well as the prototypes: each page carries a 1280×720 background image at 96 ppi, so any finish or pattern is soft when zoomed.
where     — the CLI PDF path that photographs "the page itself" (engineering/pipeline.md §3).
done when — the background is photographed at 2× or more (or pattern finishes are vector); a demo deck rendered in dark and light is signed off by the owner; byte-reproducibility (pipeline.md §4a) still holds.
