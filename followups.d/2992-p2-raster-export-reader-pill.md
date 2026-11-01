---
origin: 2992
priority: P2
recorded: 2026-11-01
area: website
severity: medium
swimlane: engineering/development.md §Studio e2e suite
deferred: off-path — both fail identically with main's sources (e6c3a4a) in the cloud sandbox; PR 2992 changes only the PDF writer and Calco's editable path, which neither export uses
source: https://github.com/Laticent/lattice/pull/2992
---

# The Studio's images and picture PowerPoint exports lose the "Content clipped" pill

```text
  P2 · [no ticket] find why the reader pill is missing from a clipped slide in two Studio raster exports
       why now   — the export evidence run for PR 2992 (2026-11-01) hit them on every engine it ran
                   (desktop, mobile, webkit-phone, webkit-tablet, gecko), and a build with main's
                   versions of every source file the PR changes failed the same two on desktop:
                     studio-raster-export-marker:66 (images export)
                     studio-raster-export-marker:76 (PowerPoint export)
                   Both fail on "the clipped slide carries the reader pill": the bottom-center pixel
                   of slide 2 is white. The author-ring half of each test passes. The PDF (:86) and
                   Print (:128) arms of the same spec pass.
       where     — docs/e2e/studio-raster-export-marker.spec.ts; the capture frame's overflow marker
                   at the `reader` level (followups.d/2739-p6, decisions/2026-10-16-player-as-library-audit.md §11.8)
       done when — both pass, or the pill is shown to have moved (then the probe pixel follows it).
       evidence  — the two green on desktop and webkit-tablet.
       verify    — tier 1 checker.
```
