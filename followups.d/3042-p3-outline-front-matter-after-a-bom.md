---
origin: 3042
priority: P3
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §The outline keeps one deck model
deferred: off-path — the cause is docs/src/lib/front-matter.ts `frontMatterBlock`, shared by nine Studio front-matter writers; the outline behaves exactly as on main here, and changing the shared reader moves every writer
source: https://github.com/Laticent/lattice/pull/3042
---

# The outline misses front matter under a leading BOM

why now   — the PR 3042 maker-checker found that a deck opening with a BOM and then front matter
            (`﻿---\ntheme: x\n---\n\n# A\n`) renders one section (`# A`; the engine strips the BOM first), while the
            Studio outline reads `theme: x` as a slide, because `frontMatterBlock` does not skip a BOM. Same on main.
where     — docs/src/lib/front-matter.ts `FM_RE` / `frontMatterBlock`, and its nine importers.
done when — the outline and the engine agree on a BOM-led deck, and each writer's round-trip tests stay green.
evidence  — a BOM-led deck through `buildDeckIndex` and `splitSourceToSections`, before and after.
verify    — tier 2, maker-checker: nine writers read this block.
