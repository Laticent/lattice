---
origin: 3183
priority: P10
recorded: 2026-11-14
area: engine
severity: medium
swimlane: engineering/pipeline.md §4a
deferred: large — re-encoding a turned picture upright changes lastra's planRecode contract and the encoder in two hosts, and needs WebKit, Gecko and Chromium checks of createImageBitmap's turn
source: https://github.com/Laticent/lattice/pull/3183
---

# A turned phone photo goes into the PDF as a whole-slide picture, because the image policy never re-encodes it

why now   — With originals as the Library default, a phone portrait (EXIF orientation 6) reaches every export as a turned
            JPEG. lastra's planRecode returns null for any orientation above 1 (the encoder would squeeze the upright
            pixels into the stored box), so under `images: optimized` the photo is never shrunk. PR 3183's PDF writer can
            draw a turned JPEG from its own bytes (write-pdf.mjs turnMatrix), but compose.mjs drawableTurned sends a photo
            the policy would shrink to the slide photo instead, so the PDF never grows past main. The slide photo is a
            whole-slide 2560 px JPEG where the photo alone would be smaller.
where     — docs/src/lib/lastra/decide.ts planRecode (plan at displaySize), lib/core/image-recode.mjs encodeJpegInPage
            (decode with the turn applied, check the bitmap's sides against displaySize, write no tag), compose.mjs
            drawableTurned (then a recoded turned picture is upright and embeds like any other).
done when — a 4032x3024 orientation-6 phone JPEG under the default policy embeds as an upright 2560 px JPEG with no tag,
            the same size as its untagged twin, in the CLI and in the Studio in Chromium, WebKit and Gecko; a browser
            whose bitmap is not turned keeps the file as it is.
evidence  — the PR 3183 checker's big-photo probe: untagged 2,833,500 bytes (recoded) against turned 208,402 bytes in
            the slide photo today; the target is the untagged size or less with the picture drawn, not photographed.
verify    — tier 2 maker-checker; iOS Safari photo suites.
