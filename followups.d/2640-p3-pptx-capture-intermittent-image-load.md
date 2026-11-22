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

2026-11-12 — investigated on claude/flaky-e2e-export; still not reproduced, so still open.
            - 150 loaded runs green: the PowerPoint case 50 of 50 (Chromium and Firefox, 4 workers, two cores pinned), and
              the whole spec 30 of 30 on Chromium, Firefox and WebKit.
            - Refuted: that `needsDecodePriming` misreads Chromium or Firefox as a late decoder under load, which would send
              them through WebKit's settle loop and its 5 s wall-clock deadline (`SETTLE_DEADLINE_MS`). Its exact logic ran
              1,600 times on both engines, 4 workers with three cores pinned: 0 misreads.
            - Ruled out by reading: a revoked `blob:` URL. The preview's photo copies (`preview-image-scale.ts`, revoked on
              a timer) never reach the export's capture frame, and `media-urls.ts` revokes only a deleted photo's URL.
            - Fixed on the way: `addPhoto` clicked "Keep original", slept 150 ms and clicked Add, so a loaded runner could
              store the probe as the default JPEG. It now confirms the radio before Add.
            - Left: the two counting paths (`inlineAll`'s failed fetch, the settle loop's `stuck`) both log no name, so the
              next failure's toast still cannot say which fired. The next step is to name the path in the log.

2026-11-21 — investigated on claude/flake-backlog-sweep (flake desk); still not reproduced, so still open.
            - 101 more loaded runs green on a `build:e2e` of main 450df6d plus this branch: the PowerPoint case 20 of 20
              at 4 workers while 64 concurrent clients pulled the server's four largest bundles, and the five photo-export
              specs together (library-images-export, pptx-export-photo-size, pptx-export-worker, export-photo-size,
              export-missing-image) 81 of 81 on Chromium and Firefox, 6 workers, 3 repeats.
            - Refuted: that the preview server drops a same-origin fetch under load, so `studioDataUri` counts a
              transient network error as a lost picture. At 512 concurrent clients the server answered 1,190 of 1,190.
            - Done, the step this note named: every path that counts a lost picture now says which and why on the
              console. The camera hands `onImageError` the reader's error (lib/core/slide-camera.mjs `inlineAll`);
              deck-export.js logs `[deck-export] the capture could not read <url>: <error>` and `the background probe
              could not load <url>`; settled-canvas.js logs how many pictures had not decoded when the settle loop gave
              up. The PowerPoint spec puts those lines in its failure message, so the next red names the address and the
              path that counted it.
            - Next: when a nightly reports it, read that message. A `blob:` read error points at the Library's object
              URL; `image fetch 404` points at a path; the settle line points at decode priming.
