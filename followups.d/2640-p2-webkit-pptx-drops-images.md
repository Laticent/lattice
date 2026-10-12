---
origin: 2640
priority: P2
recorded: 2026-10-12
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# The PowerPoint export on WebKit drops every picture and still says "PowerPoint ready."

why now   — Found while putting the Library-photo export specs on real WebKit for the nightly (PR #2640).
            A control with no Library photo shows it is not the photo feature: a deck whose only content
            is `![](sample:photo-wide.jpg)`, exported to PowerPoint in Playwright's WebKit, produces a
            slide picture (`ppt/media/image-1-1.png`) with the title and NO image, plus the OVERFLOWS
            marker, and the toast reads "PowerPoint ready." with no missing-image warning. Safari users
            get a deck without its pictures and are not told.
where     — The PowerPoint raster camera in `docs/src/components/studio/export/deck-export.js`
            (`rasterizeSection`, html-to-image under `withCaptureFixups`). Chromium and Firefox keep the
            picture. The usual WebKit cause is an image that has not decoded when the SVG
            `foreignObject` is drawn, so the first capture is blank; the PDF export on WebKit did paint
            the photo in the same run, so it is specific to this lane.
done when — A deck with an image exports to PowerPoint on WebKit with the image in the slide picture, or
            the toast says which images it could not draw. Then add `@webkit-tablet` back to the
            PowerPoint test in `docs/e2e/library-images-export.spec.ts`.
evidence  — Slide pictures extracted from the .pptx on 2026-10-12 (real WebKit, `webkit-tablet` project):
            with `asset:p` and with `sample:photo-wide.jpg` both blank; the same two decks in Chromium
            and Firefox show the image.
verify    — `npx playwright test e2e/library-images-export.spec.ts --project=webkit-tablet`.
