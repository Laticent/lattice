---
origin: 2640
priority: P3
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# The PowerPoint export intermittently reports "could not load every image" under load

why now   — Found by the nightly photo specs on PR #2640: `library-images-export.spec.ts` › PowerPoint failed 2 times in
            about 60 runs (once on Chromium, once on real Firefox), only inside full-suite runs with parallel
            workers. 48 runs of the same export in isolation (Library photo and a repo `sample:` image, 1 to 4
            workers) and 24 repeats of the spec itself all passed, so it is not specific to Library photos and is
            not reproducible on demand. The failing toast text was not captured; the spec now includes it in the
            assertion message, so the next failure names the image the capture could not load.
where     — `docs/src/components/studio/export/deck-export.js` (`onImageErrorHandler` in the html-to-image capture,
            about line 1155) and `missingImageReason`.
done when — A failure is reproduced with the toast text in hand, the cause (an image decode racing the capture under
            CPU load, or something else) is named, and the capture waits for it or retries that one image; the
            PowerPoint spec then passes 50 repeats at 3 workers.
