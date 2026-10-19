---
origin: veduta-map
priority: P2
recorded: 2026-10-19
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: engineering/decisions/2026-10-16-preview-as-library-audit.md#11j
---

# Make the pool report its capacity to Veduta and let Veduta drive the Studio stage, before anything is published.

Both map adopters use Veduta's band and map window; neither uses the half that makes it a library rather than a
helper: the pool's real capacity reported through `settle`, the page-global live budget priced per connector, and a
stage window ranked together with the map.

```text
  why now   — the npm tripwire (section 11f.2) reads as met when it is only half tested. Publishing is the
              irreversible step.
  where     — docs/src/components/studio/preview-pool.tsx (an onSettle report: slots, retained high-water mark),
              docs/src/components/map-rail/MapRail.tsx (send `cap.live` from it, drop the fixed ceiling of 24),
              docs/src/components/studio/FocusedPreview.tsx (a stage window), docs/src/lib/veduta/core.ts.
  done when — the pool reports a capacity and `settle` receives it; the Studio asks Veduta for its stage and its map
              under one budget; the pill rail is either a map tier or retired at widths where the map fits.
  evidence  — a test where the pool reports a smaller capacity than asked and the rail is not asked for more; a
              WebKit measurement of the retained frames across toggles.
  verify    — tier 2 trio (HARD RULE #25): shared preview path.
```
