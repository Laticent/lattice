---
origin: 2789
priority: P2
recorded: 2026-10-19
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: engineering/decisions/2026-10-16-preview-as-library-audit.md#11l
---

# Decide the Studio's pill rail against the map, and give the stage a window Veduta ranks, before anything is published.

The pool now reports its capacity and the rail passes it to `settle` (audit §11l), and the Studio rail prices the
focused preview as the stage under one live budget. Two pieces of the original item are left.

```text
  why now   — the npm tripwire (section 11f.2) still has no production caller for a stage window that changes
              what is mounted: the Studio's stage is one fixed frame, so Veduta's stage answer is always "the focus,
              live". Publishing is the irreversible step.
  where     — docs/src/components/studio/StudioShell.tsx (SlideRail, the pill navigator) and
              docs/src/components/studio/FocusedPreview.tsx.
  done when — the pill rail is either a map tier (pills are a tile kind the map can fall to) or hidden at widths
              where the map fits beside the preview, with screenshots at 1440, 820 and 390; and either the stage
              mounts a neighbor ahead (a `multi` stage under the same budget) or the README says why `pip` with one
              stage frame is the whole stage story.
  evidence  — screenshots at three widths; a test that a stage over budget falls down the ladder before the pool
              sees it, through the real rail.
  verify    — tier 2 trio (HARD RULE #25): shared preview path, and a visible Studio change.
```
