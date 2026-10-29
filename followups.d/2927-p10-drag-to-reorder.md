---
origin: 2927
priority: P10
recorded: 2026-10-27
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §5
source: https://github.com/Laticent/lattice/pull/2927
---

# Drag to reorder slides in both strips

why now   — Moving slides by menu is slower than today's one-tap buttons, so drag ships with the menu.
where     — Strip-actions module, `docs/src/components/studio/StudioMap.tsx`, `docs/src/components/map-rail/MapRail.tsx` (`key={i}`), `docs/src/components/studio/preview-pool.tsx`.
done when — long-press lifts a tile and releasing without moving opens the menu (a pointer timer, since iOS fires no contextmenu); a floating copy from the poster follows the pointer; the strip holds the pointer and auto-scrolls at its edges; tiles are keyed by slide id (needs item 5); the redraw cost of an insert near the start is measured before and after.
evidence  — Design §5, §9.
verify    — Drag a far slide on a 120-slide deck with mouse and touch on real devices.
