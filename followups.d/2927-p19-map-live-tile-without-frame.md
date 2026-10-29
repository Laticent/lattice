---
origin: 2927
priority: P19
recorded: 2026-10-29
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §9
deferred: off-path — the same shortfall on main at cd555a7; this PR does not change Veduta's budget or the frame pool
---

# The slide map asks for one more live tile than it gets frames at 820px touch

why now   — At 820x1180 with a touch screen, the map marks six tiles `data-tier="live"` but the pool positions five frames, so one live tile shows its sketch instead of its picture: the first tile (the current slide) on the docs dev server, a later one in a production build (`npm run build:e2e`). Measured on this branch and, with `MapRail.tsx` and `StudioMap.tsx` put back to `cd555a7`, on main: `0:live … 5:live`, 5 `[data-slide-frame]` after 6 s.
where     — `docs/src/components/map-rail/MapRail.tsx` (the live budget and `stage` cost passed to Veduta's `settle`), `docs/src/components/studio/preview-pool.tsx` (slot assignment), `docs/src/lib/veduta`.
done when — every tile Veduta asks at `live` holds a frame, on 820 touch and 1440, or the rail asks for no more than the pool places; a test counts tiers against frames.
evidence  — the measurement above (scratch script, Chromium), on the dev server and again on a production build: 6 live, 5 frames.
verify    — open the map at 820x1180 touch on the default deck; count `[data-map-rail] button[data-tier="live"]` against `[data-map-rail] [data-slide-frame]`.
