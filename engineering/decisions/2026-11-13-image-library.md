---
status: in-progress
summary: Slices 1 and 2 built (the fenced package with read, resize, encode, decide and clean; byte-identical exports). Design for lastra, a zero-dependency image library (read, clean, decode, resize, encode, decide, measure, crop, tone) that replaces about fifteen scattered image helpers in lib/core, the Studio and Calco. Owner rulings 2026-11-13 — own pure-JS decoders, internal now in the publishable shape, built before the export-size fixes D1 to D3. Proposes six slices, each byte-identical on every export until the hosts adopt the decoders, and the review each one owes.
---

# lastra: one image library (2026-11-13)

**Status: in progress; slices 1 and 2 built (§5.1).** The owner asked for "a standard zero dependency general library
that can be used in other domains too", for stability first. Three forks and the name were settled on 2026-11-13
(§7); the open questions in §8 are not.

## 1. Why

The owner's photo decks exported large again, and the investigation (this session, written up in the
follow-ups PR) found no new break: three size leaks that were each found before, written down, and left.
The pattern under them is that image work has no home. Each export path grew its own helpers, and each past
size regression lived in one of them:

- **2026-10-21**: PowerPoint and LibreOffice wrote every slide as PNG (`slide-picture.js`).
- **2026-10-25**: PDF and the player embedded every photo as added (`pdf-compose`, `player-images.mjs`).
- **2026-11-03**: three WebKit-only causes, one of them a regex in ONE of the four header readers
  (`2026-11-03-pictures-at-drawn-size.md`).

## 2. What exists (read 2026-11-13)

| Job | Today | Importers | Problem |
|---|---|---:|---|
| Type, size, alpha, rotation from the header | `lib/core/image-policy.js` `readImageInfo`, `pdf-compose/compose.mjs` `sniffImage`, Studio `media-store.ts` `sniffImageMime`, `lib/core/image-dimensions.js` | 13, 1, 30, 6 | four readers of one fact; they can disagree |
| EXIF orientation | `lib/core/exif-orientation.mjs` and a copy inside `image-policy.js` | 3 | the copy exists because `image-policy.js` must be a require-free leaf for the docs dev server |
| Metadata scrub (JPEG, PNG, WebP, GIF) | Studio only, `media-scrub.ts` | 3 | the CLI cannot scrub, so it cannot pack a camera photo into a `.lattice` without its GPS |
| JPEG encode | `lib/core/jpeg-encode.mjs` (ours: Safari wrote 1.5 to 2.2x its bytes) | 5 | none; it moves |
| PNG write, PNG IDAT read | `lib/core/canvas-encode.mjs`, `png-idat.mjs` | 3, 2 | tied to the slide camera's module |
| Resize | `lib/core/lanczos.mjs` | 2 | none; it moves |
| Recode plan | `image-policy.js` `planRecode`, `acceptRecode`; `image-recode.mjs` | 13, 4 | general thresholds mixed with Lattice's `images:` words |
| Decode | the host: canvas in the Studio, a Chrome page from the CLI (`lib/export/chrome-recode.js`) | | the CLI needs a browser to resize a photo; engines decode differently |

## 3. Scope

**In lastra.** Pure functions, bytes in and bytes out, the same in Node, a browser and a worker, no DOM:

- **read**: format, width, height, alpha hint, orientation, for PNG, JPEG, GIF, WebP, AVIF and SVG, from
  the header alone. One reader replaces the four.
- **clean**: strip metadata by an allow-list of blocks per format (the red-team lesson in
  `2026-10-12-library-media-assets.md` §3), keeping an orientation-only EXIF.
- **decode**: JPEG (baseline and progressive, 4:4:4, 4:2:2, 4:2:0, grayscale) and PNG (all color types and
  bit depths, Adam7) to RGBA. PNG inflate uses the platform's `DecompressionStream`, which Node 18+ and every
  target browser have; that is a platform API, not a dependency, and the PNG writer already relies on its
  twin.
- **resize**: Lanczos-3, as today.
- **encode**: our JPEG encoder and PNG writer, as today.
- **decide**: `planRecode` and `acceptRecode` with every threshold passed in.
- **measure**: the mean color of a region, averaged in linear light (`card-ink.mjs` `meanLinear` moves). The
  WCAG choice of ink stays in Lattice; lastra gives it the number.
- **crop**: the `cover` and `contain` source rectangle for a box and a focus point (`top`, `bottom`, `left`,
  `right`, `center`, or a fraction), the math CSS `object-fit` and `object-position` do.
- **tone**: grayscale and duotone on pixels, built from the separable and non-separable blend modes of the
  W3C Compositing and Blending spec (`saturation`, `color`, …), so a baked picture matches the browser's
  blend layers within a stated tolerance.

**What the image plugin needs from it (2026-11-13).** The plugin (`lib/plugins/image`) has four features that work on
a photo's pixels, and each reads them its own way today:

| Plugin feature | Today | From lastra |
|---|---|---|
| `bleed` ink | three hosts read the photo: the runtime (`lib/transformers/bleed-ink.js`), the CLI (`lib/export/bleed-ink-stamp.js`, which draws the file in its page first) and the Studio (`photo-ink-read.ts`) | decode, crop, measure: one read in every host, the CLI without a page |
| card ink and the photo-contrast Coach | `card-ink.mjs` math, canvas `getImageData` in `card-ink-sampler.ts`, `photo-verdict.ts` | measure |
| `focus=` | CSS `object-position`, and the ink code repeats the crop | crop |
| `duotone`, `grayscale` | CSS blend layers (`lib/base/base.media.css`) | tone, so an export can ship a toned photo as one photo-sized file instead of a slide picture (the `filter` refusals in the PDF writer: 11 on the owner's Bilan deck) |

The image layout's shape (`image-dimensions.js`, `image-aspect.js`) uses `read`; the preview copies
(`docs/src/lib/preview-image-scale.ts`) use `resize`.

**Not in lastra.** Anything about a slide: frames, finishes, sizes, `show=`, the image layout's aspect
thresholds, the slide camera, the placed-picture rule, Calco's "is this slide a photograph", the `images:` front-matter words, the panels. Those
stay in Lattice and call lastra.

**Out of scope for decode.** WebP, AVIF, GIF and HEIC decoding. They are read and cleaned, never decoded; a
recode of one stays with the host, as today. Revisit only with a measured need. So the host's decode path is
permanent, not a fallback that slice 5 deletes, and the two paths must agree on color (§5, slice 5).

**No color management.** lastra decodes the samples a file holds and applies no ICC profile; it returns the
embedded profile so a host can decide. A browser converts a tagged photo to sRGB when it decodes it
(`createImageBitmap`'s default `colorSpaceConversion`), and every iPhone photo since 2016 is tagged Display P3.
A lastra decode of such a photo, written out untagged, looks duller than the browser's. That is why slice 5 is
guarded, not a swap.

## 4. Why our own decoders (the owner's ruling, and what it buys)

- **The CLI drops its browser for pictures.** Today a resize from the CLI opens a Chrome page
  (`chrome-recode.js`). With a decoder, shrinking and cleaning a photo is plain Node.
- **The same pixels on every engine.** Engines differ in chroma upsampling and IDCT rounding, which is
  part of why the 2026-11-03 note had to align pictures per engine. One decoder gives one answer.
- **The cost.** About 1,000 to 1,500 lines for JPEG, and a corpus to prove them. It is the novel part of
  this note, so it gets the adversarial trio (§6).

The oracle for each decoder is a reference decode of a licensed corpus (libjpeg-turbo and libpng through
`python3` + PIL, run by a tool, not shipped), with a PSNR floor per file and an exact match where the
format
is lossless. Hostile inputs (truncated, oversized dimensions, a Huffman table that never terminates, a
decompression bomb) must refuse with a typed error inside a pixel and time budget, never hang.

## 5. Slices

Each slice is its own commit series. Slices 1 to 3 change no exported byte, proven by exporting the six
galleries and two photo decks before and after and comparing SHA-256 (the photo decks from a licensed
corpus, never the owner's).

1. **The fenced package.** `docs/src/lib/lastra` with `package.json`, a builder, a boundary gate
   (`checkLastraBoundary`) and zero dependencies. Move `read` (one reader, all four callers moved, the
   duplicate EXIF parser deleted), `resize`, `encode` and `decide` in. `image-policy.js` keeps the Lattice
   words and calls lastra.
2. **Clean moves out of the Studio.** `media-scrub.ts` becomes lastra `clean`; the Studio calls it. The CLI
   gains it, which unblocks packing `assets/` photos into a CLI-written `.lattice` and `--reopenable`
   (held back in the CLI `.lattice` PR for exactly this).
3. **PNG decode, measure and crop.** The three `bleed` ink hosts and the card-ink samplers move onto one read; the
   inks they pick must not change on the galleries, the image plugin's demo deck and both photo decks.
4. **JPEG decode**, behind the trio.
5. **Hosts adopt decode, where it is provably equal.** Not a swap: lastra decodes an untagged or sRGB-tagged
   JPEG or PNG, and the host keeps its own color-managed decode for anything else (a non-sRGB ICC profile, CMYK
   with a profile, a refusal, a frame over the host's limit). A one-release setting keeps a kill switch back to
   the host decode. Before this slice may start (the inversion on the decoders, 2026-11-13):
   - **color**: tagged fixtures (Display P3, Adobe RGB, CMYK with a profile, sRGB) and a ceiling on the color
     difference between the lastra path and the browser's, with color conversion left on;
   - **memory on a real iPhone**: peak memory and time for 12, 24 and 48 megapixel photos in a 50-photo deck,
     measured on the device (the simulator does not reproduce iOS's memory limit); the condition
     `followups.d/3148-p4-photo-resample-in-a-worker.md` already sets. Until it passes, the Studio stays on its
     strip-read decode. A baseline JPEG decoded by row bands with no coefficient store, and a scaled IDCT where
     the target is small, are the expected answer;
   - **no silent refusal**: an export counts refusals by code in its report and falls back to the host, so a
     refused photo never ships at full size unannounced;
   - **worker only**: a boundary test that the Studio imports decode only from worker modules, and a time and
     memory bench row (byte-identical gates cannot see either);
   - **orientation**: a rotated fixture exports upright on both hosts;
   - **sign-off decks with phone-shaped photos** (tagged, rotated, 24 megapixel, multi-picture), side by side with
     today's export, dark and light;
   - **the browser comparison runs nightly**, and Safari on Apple hardware is measured, not assumed.

   This slice changes picture bytes, so it owes the owner's export sign-off.
6. **Tone.** Grayscale and duotone on pixels, held to the browser's blend layers by a pixel-difference
   ceiling in Chromium, WebKit and Firefox. Nothing uses it until D2 lifts toned photos.

Then D1 to D3 from the export-size investigation build on it.

### 5.1 What slices 1 and 2 built (2026-11-13)

**The package.** `docs/src/lib/lastra/` is `@laticent/lastra`, private, in the publishable shape of `@laticent/markup`:
`package.json` with `exports` (`@laticent/source`, `import`, `require`), `tools/build-lastra-lib.js` on the shared
library builder, a boundary gate (`checkLastraBoundary`: nothing outside the folder, not even `node:`), a standalone
typecheck with no DOM and no Node types (`cd docs && npm run check:lastra`), and a README. The PNG writer finds
`CompressionStream` on `globalThis` at run time, so not even the DOM's types are needed.

**One implementation each; every caller moved; no shim.**

| Job | Was | Now | Callers moved |
|---|---|---|---|
| read | `image-policy.js` `readImageInfo` and its private EXIF parser; `compose.mjs` `sniffImage`; `media-store.ts` `sniffImageMime`'s magic numbers; `image-dimensions.js` `pngSize`, `jpegSize`, `gifSize`, `webpSize`; `exif-orientation.mjs`; `media-scrub.ts` `tiffOrientation` | `imageFormat`, `readImage`, `displaySize`, `tiffOrientation` (read.ts) | image-recode.mjs, compose.mjs, image-dimensions.js (`dimensionsOf`), media-store.ts (the Library's five types over `imageFormat`) |
| resize | `lib/core/lanczos.mjs` | `lanczosResize`, `lanczosWeights` (resize.ts) | slide-camera.mjs |
| encode | `lib/core/jpeg-encode.mjs`; the PNG writer inside `canvas-encode.mjs`; `lib/core/png-idat.mjs` | `createJpegEncoder`, `encodeJpeg`, `encodePng` (rows in, through a reader), `rgbPngIdat`, `crc32` (jpeg.ts, png.ts) | canvas-encode.mjs keeps only the canvas half (`encodePng(canvas)`, `encodeJpegCanvas`), image-recode.mjs, chrome-recode.js, write-pdf.mjs (`RGB_PNG_DECODE_PARMS` moved in, its one user), pdf-image-pool.js, pdf-export-worker.js, the iOS probe and the engines spec |
| decide | `image-policy.js` `planRecode`, `acceptRecode` | the same two with every threshold passed in, PNG and JPEG only (decide.ts) | image-recode.mjs, which also owns the `original` word now |
| clean | Studio `media-scrub.ts` | `cleanPng`, `cleanJpeg`, `cleanWebp`, `cleanGif`, `cleanerFor` (clean.ts); its tests and every red-team case moved with it | media-import.ts, workspace-media.ts |

**The dev-server constraint, solved by the split rather than a shim.** `image-policy.js` had to stay a require-free
CommonJS leaf because the docs dev server serves such a file to the browser only when it requires nothing
(`docs/src/plugins/vite-cjs-lib-dev.mjs`), and that is why it carried its own EXIF parser. It now holds only Lattice's
`images:` words and their numbers: those numbers ARE lastra's thresholds, and the one place that applies them,
`lib/core/image-recode.mjs`, is an ES module that imports lastra directly. The policy file no longer reads bytes, so
it needs nothing, and the constraint costs nothing. `image-dimensions.js` (Node-only, it reads files) `require`s the
package.

**Where the old readers disagreed.** Every row is in `read.test.ts` with each old reader's answer; the answer lastra
gives is what Chromium, WebKit and Firefox paint, probed on self-made files in Playwright's builds, and where they split,
Chromium's (both export hosts paint with it). `docs/e2e/lastra-read-engines.spec.ts` holds the engines to the probe.

| File | Old answers | Engines | lastra |
|---|---|---|---|
| JPEG, an Exif block with Orientation 1, then one with 6 | policy 1, PDF writer 6, layout 6 | all unturned | 1 |
| JPEG, first Exif block without the tag, then 6 | policy 1, PDF 6, layout 6 | Chromium and Firefox unturned, WebKit turned | 1 |
| JPEG, Exif 6 after the frame header | policy 6, PDF 1, layout 1 | all turned | 6 |
| JPEG, TIFF magic 43 / Orientation 9 | policy 6 / 9, PDF and layout 1 | all unturned | 1 |
| JPEG, XMP APP1 then Exif 6 | all 6 | Chromium and WebKit turned, Firefox not | 6 |
| JPEG, junk or fill bytes between segments | policy: no size; layout: the size | all decode | the size |
| JPEG, `FF D8` not followed by a marker | PDF and Library: not JPEG; layout: the size | Chromium and WebKit refuse | not JPEG |
| PNG, wrong signature bytes 4 to 7 | policy, PDF, layout: PNG | all refuse | not PNG |
| PNG, a chunk before IHDR | policy and layout read a chunk length as the width | Chromium and WebKit refuse | no size |
| PNG, eXIf Orientation 6 | unturned | Chromium and Firefox turned, WebKit not | 6 (so the recode leaves it) |
| WebP, EXIF Orientation 6 | unturned | all unturned | 1 |
| GIF, version `GIF8x` | layout: the size | all refuse | not GIF |

What it changes: on those files only. A JPEG with its Exif block after the frame header now stays in the PDF's photo
(upright) instead of being embedded sideways, and the image layout sizes it upright; the other rows move the recode
plan, the PDF's embed-or-photo choice or the layout's bucket for files no gallery and no photo deck here contains.
One addition: the image layout now sizes an AVIF photo (its header reader read none, so an AVIF fell to the Clean floor).

**SVG.** `imageFormat` recognizes an SVG, but `readImage` gives it no size: an SVG's box is its markup's
`width`/`height`/`viewBox`, which `lib/core/image-aspect.js` `aspectFromSvgTag` reads for files AND for inline
posters. Moving that parser would make `image-aspect.js`, a browser-served CommonJS leaf, require a package. Left for
the slice that needs an SVG size from bytes.

**Measured.**

- Byte-identical exports, before (`f0e4c6d9`) and after, `SOURCE_DATE_EPOCH=1700000000`, with the CLI (`dist/lattice.js`):
  `test/integration/baseline-decks/gallery.md`, `examples/gallery-jargon.md`, `examples/data-viz-gallery.md`, and the
  imagery, image and collage galleries, plus a self-generated photo deck (a 4032 px JPEG, a progressive JPEG, JPEGs
  turned 3, 6 and 8, a small JPEG, an opaque PNG, an RGBA PNG, an opaque RGBA PNG, a palette PNG with tRNS, a GIF and a
  WebP), each to PDF, PPTX and `--player` HTML. The 7 PDFs and 7 player files have the same SHA-256 before and after.
  The 7 PowerPoints have the same bytes in every part but `docProps/core.xml`, whose created and modified stamps are the
  time of the run: the PowerPoint export ignores `SOURCE_DATE_EPOCH`, so two runs of the base differ there too.
- A first run was NOT identical, and it is the finding of this slice: every player file differed. A bundler that
  scope-hoists a library renames each same-named local elsewhere in the bundle, and the player ships functions as
  `toString()` source, so lastra's private helpers `info` and `view` turned a player's `info` into `info2`. The fix is in
  the code, not the comparison: lastra's private helpers carry distinctive names (index.ts says why), and the CLI bundle
  reads lastra's CommonJS build, which stays inside its own closure. Checked by counting renamed identifiers in the
  CLI and player-core bundles before and after: none outside lastra's own code.
- The golden JPEG hash (`jpeg.test.ts`) did not move.
- Failing arms: 15 deliberate breaks across read, clean, decide, resize and encode each turned their test red, and each
  file was restored byte for byte. Two breaks first survived and got tests (a version 1 `pitm` cut short, a box longer
  than the file); a third showed that the JPEG encoder's literal `cos(pi/4)` is not pinned by the golden picture, and
  its comment now says so.
- Fuzz: `read.fuzz.test.ts` corrupts a JPEG, PNG, GIF, two WebPs and an AVIF 4,000 times each per run (seed printed;
  five more seeds at 40,000 rounds each also clean): no throw, no impossible header, and every cleaned file cleans to
  itself.

**Found, not caused:** the `--player` export of the photo deck runs out of the default 2 GB Node heap on the base
commit too (40 MB of pictures as data URIs through jsdom); the comparison ran both trees with an 8 GB heap. The
PowerPoint export writes the wall-clock time into `docProps/core.xml` whatever `SOURCE_DATE_EPOCH` says.

## 6. Review tier and budget

- Slices 1 to 3 and 6: maker-checker (one `checker`), because they move code every export runs.
- Slice 4: the adversarial trio (red team, inversion, checker) on the decoders as they will ship. Novel
  code that parses untrusted bytes.
- Session count so far: two agents (the CLI `.lattice` builder and its checker). This note adds one checker
  per slice for 1 to 3 and 6, and three for slice 4: seven, nine in the session. Under the ~10 that needs an OK.

## 7. Owner rulings (2026-11-13)

1. **Decoders: our own, pure JavaScript.** Not passed in by the host.
2. **Internal now, in the publishable shape.** Fence, package and zero dependencies from slice 1. Publishing
   waits for its own ruling, the trio over the whole library and the license call
   (`2026-10-08-library-audit.md` §3).
3. **Order: the library before D1 to D3.**
4. **The name: lastra.**
5. **It serves the image plugin too** (the owner, 2026-11-13): measure, crop and tone join the scope (§3).

## 8. Open

- **The phone-photo corpus.** Load-bearing for slice 5, not optional: which licensed (public-domain or CC0)
  phone photos, tagged and untagged, and whether they live in the repo or are fetched by the corpus tool.
- **Speed and memory on a phone.** Measured on a real iPhone, not in desktop WebKit (§5, slice 5).
- **Matrix-shaper profile conversion.** Display P3 and Adobe RGB are simple matrix-and-curve profiles; converting
  them to sRGB in lastra (a few hundred lines) would let slice 5 narrow its host fallback. Not built.
