---
origin: 2927
priority: P8
recorded: 2026-10-27
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §5
source: https://github.com/Laticent/lattice/pull/2927
---

# The slide menu on both Studio strips, from one strip-actions module

why now   — It replaces the icon row and gives every slide its own actions.
where     — New module beside `docs/src/lib/veduta`, `docs/src/components/studio/SlideRail.tsx`, `docs/src/components/studio/StudioMap.tsx` (inject; never `MapRail.tsx` itself, which the Playground shares), command palette in `docs/src/components/studio/StudioShell.tsx`.
done when — each strip slide opens one menu (⋯ beside the current slide, 44px on touch; right-click; Shift+F10; tap the current slide again); opening makes it current with grab:false and expand:false and suppresses centering; it closes only on user scrolls; it exists only on the full view and not for read-only Live members; empty and one-slide decks behave as §5; the gallery target is fixed at open; the palette has every action.
evidence  — Design §5, §9.
verify    — Drive the real Studio at three widths with mouse, touch and keyboard; screenshot both strips.
