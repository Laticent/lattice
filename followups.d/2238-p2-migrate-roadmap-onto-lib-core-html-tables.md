---
origin: 2238
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2238#issuecomment-5752514215
backfill: true
---

# Migrate roadmap onto lib/core/html-tables.js

Backfilled verbatim from the continuation brief on #2238 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Migrate roadmap onto lib/core/html-tables.js
       why now   — roadmap still carries byte-identical private copies of parseRowCells /
                   parseRows / splitTable; the kernel's own docblock names it as the
                   outstanding consumer, so the consolidation is unfinished until this lands
       where     — lib/components/chart/roadmap/roadmap.transform.js; kernel at
                   lib/core/html-tables.js (HARD RULES #1/#15)
       done when — roadmap's private walkers are gone, its committed goldens unchanged
       evidence  — roadmap gallery PDF rendered before/after, byte-identical
       verify    — tier 1 checker, because it touches a shipped component with committed
                   goldens on a render path
```
