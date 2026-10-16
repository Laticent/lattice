---
origin: 2640
priority: P3
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# Library photos are embedded as `data:` URIs once per use, so a photo used on many slides is copied many times

why now   — Exports render with a name → `data:` map (`dataUrlsFor`), so each slide that shows a photo
            carries its own base64 copy in the HTML. Correct, and fine for the usual one or two uses,
            but a 1 MB photo used as a background on every slide of a 30-slide webpage export adds ~40 MB.
where     — `docs/src/components/studio/media-urls.ts` `dataUrlsFor` and the webpage export in
            `share-export.ts`. A CSS custom property or a single `<img>` defined once and referenced
            would collapse the copies.

done when — A 20-slide deck with one Library photo as every slide background exports to a webpage whose size grows by about one copy of the photo, not twenty; `npm run test:docs` stays green.
