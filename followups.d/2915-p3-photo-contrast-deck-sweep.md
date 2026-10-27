---
origin: 2915
priority: P3
recorded: 2026-10-26
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2915
---

# The photo-contrast check covers only the slide on screen

why now   — The preview frame holds one slide at a time, so the Coach warns about the slide in view and the
            finding follows the author. A deck of twenty photo slides shows nothing about the other nineteen
            until each is opened. The CLI has no photo check either (`check-slide-contrast.js` lists raster
            backdrops as a known limit).
where     — `docs/src/components/studio/coach/photo-contrast-watch.ts`; a deck-wide pass would need an
            off-screen render per slide or a CLI-side sampler.

done when — A deck-wide photo-contrast read exists (Studio or CLI), or the owner decides the on-screen slide is enough and this file is deleted.
