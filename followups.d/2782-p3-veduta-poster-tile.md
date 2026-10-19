---
origin: 2782
priority: P3
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: engineering/decisions/2026-10-16-preview-as-library-audit.md#11o
---

# Capture posters for the map's poster tier, and measure the capture on a real Safari.

The cache (`docs/src/components/map-rail/poster-cache.ts`) and the rail's poster tile (`poster`, `posterBudget` on
`MapRail`) are built and tested (audit §11o). What is left is the capture, and the reason to build it is thin: 12 of 295
example and baseline decks have more than 12 slides, so a poster would only show on overscan tiles of a long deck.

```text
  why now   — only when a deck large enough to scroll the rail past its live tiles is common, or a host lowers the pool's
              `maxSlots` (audit §11l). Measure real deck sizes again before starting.
  where     — docs/src/components/studio/preview-pool.tsx (a `capture(tileId)` that rasterizes a slot's section with
              html-to-image, the export's route), docs/src/components/studio/StudioMap.tsx (capture a tile once its live
              picture settles, store it under `posterKey(text, look)`, pin the rail's window, pass `poster`).
  done when — a long deck scrolled fast shows posters, not sketches, on the tiles past the live cap, and no capture runs
              while the reader is scrolling.
  evidence  — Safari measurements on a real device of the capture's main-thread time per tile; until then UNVERIFIED.
  verify    — tier 1 checker; tier 2 if the pool API changes.
```
