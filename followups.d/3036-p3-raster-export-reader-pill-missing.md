---
origin: 3036
priority: P3
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-11-03-security-findings-spine.md
deferred: off-path — red on main (9dc7f3e) too, in the same way; found running the export specs for the security spine continuation's evidence plan
source: https://github.com/Laticent/lattice/pull/3036
---

# The Studio images and PowerPoint exports of a clipped slide lose the reader pill (`studio-raster-export-marker.spec.ts`)

why now   — The images and PowerPoint arms of `docs/e2e/studio-raster-export-marker.spec.ts` fail on every engine (desktop,
            mobile, webkit-phone, webkit-tablet, gecko) with "the clipped slide carries the reader pill": the bottom-center
            pixel of the clipped slide's picture is white. The PDF and Print arms pass. The spec runs only nightly.
where     — the Studio's raster exports (docs/src/components/studio/export/deck-export.js) and the capture frame's reader
            marker; the spec's oracle is `bottomCenter`.
done when — the reader pill is in the images and PowerPoint pictures of a clipped slide, or the spec's oracle is shown to
            read the wrong pixel and is corrected; the spec passes on every engine.
evidence  — `npx playwright test e2e/studio-raster-export-marker.spec.ts --project=desktop --retries=0` with lib/ and docs/src
            at main (9dc7f3e): 2 failed (images, PowerPoint), 3 passed.
verify    — self-review plus the spec on every engine.
