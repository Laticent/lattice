---
origin: 2907
priority: P3
recorded: 2026-10-26
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2907
---

# Two html-to-image captures outside the export still draw once, so WebKit drops their pictures

why now   — PR 2907 routed every capture in `deck-export.js` through `settledCanvas`
            (`docs/src/components/studio/export/settled-canvas.js`), which waits for WebKit to decode a
            slide's pictures. Two captures outside the export still call html-to-image directly.
where     — `docs/src/components/studio/pool-capture.ts` (the slide map's poster thumbnails, `toCanvas`)
            and `docs/src/pages/libraries/calco/index.astro` (the Calco demo page, `toBlob`). On WebKit a
            poster of a slide with a photo over about 100,000 pixels shows no photo.
done when — Both draw through `settledCanvas`, and a WebKit e2e shows a poster carrying its photo.
            `e2e/studio-map-posters.spec.ts` already samples poster pixels and is the place for it.
evidence  — Reasoned from the shared mechanism, not reproduced: both call html-to-image's single draw,
            which PR 2907 measured blank on WebKit for any picture over about 100,000 pixels.
verify    — `npx playwright test e2e/studio-map-posters.spec.ts --project=webkit-tablet` with a deck whose
            slide carries a 640x360 or larger photo.
