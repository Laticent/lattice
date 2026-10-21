---
origin: 2782
priority: P3
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: engineering/decisions/2026-10-16-preview-as-library-audit.md#11q
---

# Measure the poster capture on Safari on a real device, and cap it if one capture is too long for a frame.

The capture is built (audit §11q): the Studio map's pool rasterizes a tile once its live picture has rendered and the
rail has been still for 300 ms, and each capture records a `lattice-poster-capture` performance measure. On this
sandbox, Playwright's WebKit measured a median of 48 to 49 ms and a worst case of 94 to 130 ms of WALL time per capture
(clone to JPEG, across awaits). That is the engine, not an iPhone's CPU or memory, and wall time is not the main thread's.

```text
  why now   — before the Studio map is on by default, or before a host lowers the pool's `maxSlots`; until then a
              capture runs only after a tile has been live, and only while the rail is still.
  where     — docs/src/components/studio/preview-pool.tsx (`captureSlot`, `CAPTURE_QUIET_MS`).
  done when — the capture's main-thread time per tile is measured on Safari on an iPhone and an iPad: the long tasks
              (Web Inspector's timeline, or Long Animation Frames where supported) inside each `lattice-poster-capture`
              span, after the walk e2e/studio-map-posters.spec.ts makes, done by hand; if one exceeds ~50 ms there,
              the capture is split or its pixel ratio lowered on WebKit.
  evidence  — the device numbers in the audit; until then UNVERIFIED.
  verify    — tier 1 checker.
```
