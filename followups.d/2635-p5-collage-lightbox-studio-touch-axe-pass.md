---
origin: 2635
priority: P5
recorded: 2026-10-12
area: imagery
severity: medium
swimlane: engineering/decisions/2026-10-11-collage-component.md §11
source: https://github.com/Laticent/lattice/pull/2635
---

# Drive the collage lightbox on the real Studio preview and on touch, and run an accessibility checker

```text
  P5 · [no ticket] Drive the collage lightbox on the real Studio preview and on touch, and run an accessibility checker
       why now   — the lightbox shipped verified on the Playground and the exported player in Chromium only; the Studio's tap path (tapCollageAt) and iOS touch were never driven, and the photo-as-button markup has had no axe run.
       where     — docs/src/playground/collage-host.js (tapCollageAt, installCollageBridge), docs/src/components/studio/StudioShell.tsx (onTap), lib/export/player-core.mjs (the inlined opener).
       done when — on the real Studio preview a photo click opens, Escape and click-away close it and Space still advances; one iOS Safari or real-touch run opens and closes a photo; axe reports no list or role violation on examples/collage.md.
       evidence  — a screenshot sequence from the real Studio at 1440 and 390 via tools/screenshot.js, the iOS run (or UNVERIFIED named), and the axe report.
       verify    — tier 1 independent checker, because the Studio shares the host code with the shipped Playground and the fix, if any, touches the player.
```
