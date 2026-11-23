---
origin: PRNUM
priority: P1
recorded: 2026-11-23
area: engine
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §9
deferred: large — post-1.0 direction set by the owner on 2026-11-23; moving every image job behind one library touches the CLI export, the Studio and the player, and each move owes its own differential test
source: https://github.com/Laticent/lattice/pull/PRNUM
---

# Move the repo's remaining image work into lastra

why now   — The owner ruled on 2026-11-23 that "all image work we do … belongs [in] lastra", and lastra
            publishes with 1.0.0 as an official library. Its first slices (engineering/decisions/
            2026-11-13-image-library.md §2 and §5) already took over the header read, EXIF orientation,
            the metadata scrub, the JPEG and PNG writers, Lanczos resize, the PNG IDAT read and the
            recode plan; `lib/core/exif-orientation.mjs`, `jpeg-encode.mjs`, `lanczos.mjs`, `png-idat.mjs`
            and the Studio's `media-scrub.ts` are gone. What is left is below.
where     — Inventory, read on `main` at 005950a (2026-11-23). Lines are file lengths.
            Already thin wrappers over lastra, which could stay as host glue or fold in:
              lib/core/image-policy.js (82; `readImageInfo`, Lattice's `images:` words over `planRecode`),
              lib/core/image-recode.mjs (82), lib/core/image-dimensions.js (143; SVG size via markup),
              lib/core/canvas-encode.mjs (77; canvas rows into lastra's writers),
              lib/export/chrome-recode.js (40; sends lastra's encoder into a Chrome page),
              lib/export/player-images.mjs (344), docs/src/components/studio/media-import.ts (421),
              docs/src/components/studio/export/pdf-image-pool.js (167).
            Image work that does not use lastra yet:
              lib/core/pdf-compose/compose.mjs `sniffImage` (a fifth header reader) and `pngIsFlat`;
              docs/src/lib/preview-image-scale.ts (639; preview-sized photo copies, canvas resize in a worker);
              docs/src/components/studio/media-exif.ts (429; EXIF, XMP and IPTC text for captions);
              docs/src/components/studio/chat-photos.ts and agent-assets-browser.ts (canvas `toBlob` downscales);
              lib/export/slide-picture.js (46) and lib/core/office-export-policy.js `choosePicture`
              (PNG-or-JPEG choice for a slide picture); lib/export/image-set.js (608; the image-set ZIP's
              size presets and formats); tools/make-pwa-icons.js and tools/make-og-card.js (build-time rasters).
            The image-library note §4 lists five "deliberate leftovers" that each read bytes for a
            reason of their own (calco `imageMime`, `pngIsFlat`, `pngBytesOf`, `media-exif.ts`, the
            worker's animation sniff). The owner's ruling reopens that list; each one needs a fresh yes or no.
done when — Each item above is either moved into lastra (with the old copy deleted in the same PR) or
            recorded in the image-library note as staying out, with the owner's reason. No header
            reader outside lastra.
evidence  — Before/after count of image readers and encoders outside docs/src/lib/lastra; for each
            move, a differential test showing the same bytes or pixels as before.
verify    — `grep -rn "sniffImage\|toBlob(\|convertToBlob" lib docs/src` finds only lastra and
            the sanctioned host glue.
