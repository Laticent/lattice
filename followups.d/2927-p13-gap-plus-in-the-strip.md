---
origin: 2927
priority: P13
recorded: 2026-10-27
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §5
source: https://github.com/Laticent/lattice/pull/2927
---

# A + in the strip gaps to add a slide anywhere

why now   — It reaches any position without a switch.
where     — Strip-actions module, `docs/src/components/studio/SlideRail.tsx` (pill gap 6px), `docs/src/components/map-rail/MapRail.tsx` (`GAP` 8px).
done when — a + shows in every gap on hover; on touch only either side of the current slide, widened to 44px; clicking opens the gallery at that position.
evidence  — Pill geometry from the UI/UX review.
verify    — Measure the touch target at 390px on a real phone before building.
