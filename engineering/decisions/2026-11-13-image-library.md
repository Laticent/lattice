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

### Measured (2026-11-13, slices 3 and 4: `docs/src/lib/lastra/decode`, after the trio's review and its second round)

**The corpus is ours.** `tools/lastra-corpus/generate.py` draws every picture from one seed (gradients,
grain, hard edges, bitmap-font text) and builds its own Display P3 and Adobe RGB ICC profiles
(`icc.py`), so no third-party photo or profile is in it and §8's licensing question does not arise for
the decoders. 70 JPEGs, 72 PNGs and 83 zlib streams, 1.56 MB, committed with `fixtures/expected.json`;
`--check` regenerates in memory and diffs (zero differences). The four `jpegtran-*` files are written by
the stock `jpegtran -scans` (libjpeg-turbo 2.1), not by lastra's generator. The tests read only committed files.

**The oracle, and the floor.** PNG: the tool's own encoder writes each file, so the expected pixels are
the ground truth it was given; Pillow decodes every file back to those samples, which proves the
encoder. JPEG: Pillow's decode (libjpeg-turbo 3.1.4.1), as a SHA-256 of the RGBA; for the three files cut
with no EOI, Pillow's decode of the same bytes with EOI appended (libjpeg reads the end of a file as
EOI; Pillow refuses cut files); for the two whose coefficients pass 16 bits, libjpeg-turbo's C build
(Pillow with `JSIMD_FORCENONE=1`; the generator asserts the C and SIMD decodes differ on them). The floor
is an exact match on every file, measured:

| JPEG fixtures (count) | vs oracle |
|---|---|
| baseline 4:4:4, 4:2:2, 4:2:0 at 1x1, 7x13, 64x48, 257x193, 1001x667 (12); progressive incl. 4:4:0 (8) | identical |
| 4:4:0, 4:1:1, 2x2/2x1/2x1 (5); quality 30/95, optimized tables, three restart spacings (8) | identical |
| grayscale (4); Adobe RGB, CMYK, YCCK (3); no DHT (1) | identical |
| phone-shaped: Display P3, Adobe RGB, EXIF orientation 6, MPF two pictures, Ultra HDR gain map, a profile over two APP2 segments (6) | identical pixels; `icc` byte-identical to Pillow's |
| damaged: an RST dropped, doubled, two behind, one ahead, four ahead; junk before an RST; a short interval; bad Huffman codes; EOI mid-scan (9) | identical |
| progressive missing its last scans, so libjpeg's block smoothing applies (5); cut with no EOI (3); quantization past 16 bits (2) | identical |
| `jpegtran -scans` scripts of 64, 65, 69 and 97 scans: one coefficient per scan, refined bands, a 4:4:4 file in pairs (4) | identical |

**PNG's inflate is in-tree** (`inflate.ts`, RFC 1950/1951). The first decoder used the platform's
`DecompressionStream`, and on the same bytes the engines disagreed: with trailing data or a missing or
bad Adler-32, Node decoded, Chromium decoded only small streams, and Firefox and WebKit refused, because a
stream that errors discards the output it had queued. lastra's own inflate stops at the size the header
implies and never reads the checksum, so its verdict is one answer everywhere. Up to that point it is
held to Python's zlib byte for byte on 83 streams (56 whole, 15 with a bad checksum, 9 cut, 3 refused),
and a seeded 2,000-case damage fuzz holds it to Node's zlib: identical output when zlib accepts, a prefix
of zlib's output when either refuses. Node, 24.4 MB 12 MP PNG: 981 ms with the platform inflate, about
1,170 ms with lastra's.

**Damaged-file parity, the review's sets.** The checker's and red team's 951 damaged and partial JPEGs
(corrupt entropy bytes, restart damage, partial progressive files, redefined tables, marker mixes),
before and after this batch:

| | reviewed (839861c6) | now |
|---|---:|---:|
| differ from libjpeg-turbo's C build | 97 | **0** |
| differ from Pillow (its SIMD build) | 183 | 93 |

All 93 that still differ from the SIMD build are files where a block's IDCT leaves 16 bits or the
range-limit window (instrumented; 2 of 735 matching files also touch it without changing a pixel):
there the SIMD code saturates in 16-bit lanes where the C code wraps. Browsers ship the SIMD code too, so
on such files lastra matches the C reference and not the browsers. No real encoder writes one. (The red
team's 40 PNG edge files differ from Pillow on 9, all tRNS cases: Pillow's PNG decoder is its own;
lastra follows libpng, and the browser table below pins that against the engines.)

**The browsers** (`tools/lastra-corpus/browser-compare.mjs --assert`, Playwright's Chromium 141,
Firefox 142, WebKit 26 on Linux; colorSpaceConversion `none`; alpha compared on every pixel, color on
opaque ones):

| Fixtures | Chromium | Firefox | WebKit |
|---|---|---|---|
| lastra itself, bundled and run inside the engine, vs lastra in Node (142 fixtures) | identical on all | identical on all | identical on all |
| valid JPEG (all modes, phone files, the `jpegtran` files) | identical | identical | identical, except files with an ICC profile, which WebKit color-manages even under `none` |
| damaged JPEG (9) | identical | identical | identical |
| smoothed partial progressive (5) | identical | identical | 4 differ by at most 14 levels (PSNR 40 to 69 dB) |
| cut with no EOI (3) | refuses all three | scan-boundary cut identical; the other two differ | shows nothing |
| quantization past 16 bits (2) | differ (SIMD) | differ (SIMD) | differ (SIMD) |
| PNG, 1 to 8 bits, every tRNS case, extra data past the image | identical, except a palette index past PLTE (a palette color, lastra black) and a tRNS longer than the palette or of the wrong length (applied, lastra ignores it, as libpng) | identical | identical |
| PNG, 16 bits | identical | rounds instead of the high byte: max 1, PSNR 53.7 to 56.3 dB | identical |
| PNG, zlib stream with a bad Adler-32 / none | identical / refuses | drops the last 9 of 63 pixels / refuses | drops rows of both |

lastra's PNG policy is libpng's (Firefox and WebKit decode with it), pinned by the 14 `edge-*` fixtures,
except on the Adler-32, where the engines split and lastra takes Chromium's answer (it never reads it).

**What a browser displays for a tagged file** (default color management, reported, not asserted):
Chromium's display differs from lastra's as-stored pixels by a mean CIE76 delta E of 5.2 (largest 14.2)
on the Display P3 JPEG, 6.9 (17.5) on Adobe RGB, 5.5 (18.3) on the P3 `iCCP` and `cICP` PNGs and 20.9
(36.5) on a PNG with `gAMA` 1.0; WebKit the same; headless Firefox applies no profile. An `sRGB` + `gAMA` +
`cHRM` PNG displays as stored everywhere. `icc` and `tags` let a host send such a file to a
color-managed decoder. Every engine turns a picture by its EXIF orientation even under
`imageOrientation: 'none'`; the comparison turns lastra's pixels with `applyOrientation` first and they
then match.

**Work bounds, before and after the first round** (the red team's files; Node 22, one run each, peak RSS
of the process):

| Attack | reviewed: time, RSS, steps | now: time, RSS, steps, outcome |
|---|---|---|
| SOF with no scan, 10000 x 10000 (95 B) | 0.9 s, 529 MB, 11,253; decoded gray | 1 ms, 46 MB, 4; `corrupt` |
| SOF and empty scans, 10000 x 10000 | 2.5 s, 816 MB, 15,003 | 1 ms, 46 MB, 4; `corrupt` |
| every legal empty scan, DRI 1, 1 component, 896 scans (9 KB) | 25.1 s, 539 MB, 2.8 billion | 55 ms, 47 MB, 1,513; `too-large` (scan cap) |
| the same, 4 components, 3,584 scans (36 KB) | 91.7 s, 837 MB, 11.2 billion | 14 ms, 48 MB, 1,513; `too-large` |
| end-of-band-run scans, 100 / 882 scans | 3.4 s / 19.3 s, 531 MB, 156 M / 1.38 billion | 1.1 s / 1.2 s, 57 MB, 50 M; `too-large` (visit cap) |
| 128 MB of unused DHT tables | 18.7 s, 201 MB, 2,063 steps | 0.2 s, 183 MB, 7.46 M steps |
| PNG 10000 x 10000 RGBA16, valid zero bomb (778 KB) | 3.5 s, 1,227 MB | 5.1 s, 462 MB (rows unfiltered as they inflate) |

**The second round.** The first round's cap of 32 visits per block refused legal files: `jpegtran -scans`
writes up to 100 scans, and a legal progression can visit a block up to 896 times. The cap is now what
libjpeg-turbo's fuzzer uses, 500 scans, plus at most 1,024 coefficients decoded per block over all scans
(2^26 in all below 2^16 blocks). First-pass end-of-band runs and refinement runs over blocks with no
nonzero coefficient are skipped in a tight loop, so an empty pass costs almost nothing. Node 22, one run
each, sync decode, peak RSS of the process:

| Attack | first round | second round |
|---|---|---|
| 20 million zero-length IDAT chunks, 255 MB | Node aborts: heap out of memory | `too-large` (more than 2^20 chunks) in 38 ms, 1,048,577 steps, 316 MB (the file itself) |
| end-of-band-run scans, 100 | 3.2 s, `too-large` | 1.25 s, decoded (a legal file now) |
| end-of-band-run scans, 882 | 12.2 s | 2.2 s, `too-large` (scan cap) |
| 10000 x 10000, 40 full-band refinements over zero blocks | 6.9 s, decoded | 0.87 s, decoded |
| 10000 x 10000, coefficient 1 set in every block, 20 refinements each reading a bit per block (4.7 MB): the worst case found at 100 MP | 7.2 s, 836 MB, decoded | 4.6 s, 353 MB, `too-large` (work cap) |
| every legal empty scan, 896 / 3,584 scans | `too-large` (scan cap) | `corrupt` in under 1 ms: the scans name a Huffman table never defined, which libjpeg refuses in a progressive frame |
| 128 MB of unused DHT tables | 0.2 s | 0.17 s |

An abort 1 s into the worst case ends the async decode 0.4 ms after the signal fires. The longest stretch
without a yield is 8 to 12 ms for the 12 MP benchmarks (the speed runs below): upsampling, block smoothing,
color conversion, the CRC (1 MB slices) and the inflate (32 KB flushes) all yield now. The
`MessageChannel` fallback, used where neither `scheduler.yield` nor `setImmediate` exists, opens and
closes a channel per turn; Node always has `setImmediate`, so no unit test reaches it.

A file cut inside any marker segment, a scan header included, is now `truncated`, and so is one that
ends before any scan is whole; a file that ends in scan data or between segments after a whole scan
decodes. A cut baseline file is therefore always refused. One rule for both kinds, pinned by a test
that cuts a baseline and a progressive file at about 100 points each and inside every later scan header.

The meter now counts per block and per 64 pixels, so steps track work (the DHT file's 2,063 steps for
18.7 s was the gap). The fuzz holds every case under a limit proven from the loops and under twice the
highest steps per unit of declared work measured over 40,600 cases (JPEG 15.59, PNG 0.87, after the
second round counts one step per 8 coefficients of a block's band); a change that multiplies the work
per block by 10 fails it (failing arm recorded).

**Fuzz.** Seed 20261113, 600 mutated JPEGs and 600 PNGs per run, 52 batches plus two summary tests that
compute their own cases. Default run, after the second round: JPEG 260 decode, 109 truncated, 106 bad-marker, 123
corrupt, 1 unsupported, 1 too-large; PNG 94 decode, 168 truncated, 136 corrupt, 133 bad-marker, 40 crc,
27 unsupported, 2 too-large. A run under 600 cases reports an outcome it never reached instead of
failing. Seed 1, 20,000 each: no other exception, no limit passed.

**Speed** (`tools/lastra-corpus/bench.mjs --browsers`, 4000 x 3000, median of 5, 4-core sandbox shared
with other sessions (load average 3 to 7), after the second round; two runs, the spread between them in
the notes below):

| File | Node 22 | Chromium 141 | Firefox 142 | WebKit 26 |
|---|---|---|---|---|
| JPEG baseline 4:2:0 q85, 1.65 MB | 387 ms | 414 ms (platform 203) | 440 ms (161) | 416 ms (192) |
| JPEG progressive 4:2:0 q85, 1.65 MB | 545 ms | 615 ms (291) | 688 ms (237) | 695 ms (289) |
| PNG RGB 8-bit, 24.4 MB | 1,237 ms | 1,295 ms (372) | 2,124 ms (366) | 1,857 ms (722) |

"Platform" is `createImageBitmap` plus `getImageData`. lastra takes about 2 to 3 times as long as the
engine's own decode for JPEG in all three engines, and for this PNG about 2.6 times (WebKit) to 5.8 times
(Firefox). The first round's table showed WebKit's own JPEG decode at 357 and 555 ms, which made lastra
look even with it; this run measured 192 and 289 ms, and the other run 209 and 296 ms, so that parity
was a slow WebKit run, not a property of lastra. The in-tree inflate costs PNG about a quarter in Node
(981 ms with `DecompressionStream`, 1,221 to 1,237 ms now). The two runs differed by up to 11% per cell.
The longest stretch without a yield was 8 to 12 ms in Node across both runs, with one outlier of 17 ms
on the progressive file while the load average was 7. Pillow's SIMD libjpeg-turbo decodes the same JPEGs
in 68 and 97 ms. §8's phone question stays open: these are desktop engines on x64.

**What stays open.** Matching the SIMD builds on overflowing files would mean emulating each SIMD
variant's 16-bit saturation (x86 and ARM differ in their code); not done. Safari's ImageIO is not
reachable here (UNVERIFIED). Firefox and WebKit decode cut files their own way.

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
| JPEG, TIFF magic 43 / Orientation 9 | policy 6 / 9, PDF and layout 1 | all unturned (but Playwright's Chromium 141 turns the magic-43 file; Chrome 153 does not) | 1 |
| JPEG, XMP APP1 then Exif 6 | all 6 | Chromium and WebKit turned, Firefox not | 6 |
| JPEG, junk or fill bytes between segments | policy: no size; layout: the size | all decode | the size |
| JPEG, `FF D8` not followed by a marker | PDF and Library: not JPEG; layout: the size | Chromium and WebKit refuse | not JPEG |
| PNG, wrong signature bytes 4 to 7 | policy, PDF, layout: PNG | all refuse | not PNG |
| PNG, a chunk before IHDR | policy and layout read a chunk length as the width | Chromium and WebKit refuse | no size |
| PNG, eXIf Orientation 6 | unturned | Chromium and Firefox turned, WebKit not | 6 (so the recode leaves it, and the PDF keeps it in the photo) |
| PNG, two eXIf chunks: 1 then 6 / 6 then 1 | unturned | Chromium and Firefox: the first decides (1 / 6); WebKit applies neither | the first |
| WebP, a first chunk too small for its header | layout read the next chunk's bytes as the size | (not decodable) | no size |
| WebP, EXIF Orientation 6 | unturned | all unturned | 1 |
| GIF, version `GIF8x` | layout: the size | all refuse | not GIF |

**Which exported bytes change, on purpose.** Only an export whose deck holds one of these pictures; every gallery and
both photo decks keep their bytes (§Measured). The demo deck `examples/lastra-image-reading.md` shows the first three.

| The picture | What changes |
|---|---|
| a JPEG whose first `Exif` block sits after the frame header | PDF: it stays in the slide's photo, upright, instead of being embedded sideways; image layout: sized upright (its bucket and composition) |
| a PNG whose first `eXIf` chunk turns it (before the pixels) | PDF: it stays in the photo instead of being embedded stretched across the turned box; image layout: sized turned; recode: no longer planned (PDF, player) |
| an AVIF on an `image` slide | image layout: sized (it fell to the Clean floor before) |
| a JPEG whose first `Exif` block says 1 or has no tag, with a later block that turns | PDF: embedded at its own bytes (it was kept in the photo as turned); image layout: sized unturned |
| a JPEG whose TIFF block has the wrong magic number, or an orientation outside 1 to 8 | recode: now planned like any upright JPEG (the policy read 9 as turned); PDF and player bytes change when it wins |
| a JPEG with junk or fill bytes between segments | recode: now planned (the policy could not read its size); PDF and player bytes change when it wins |
| a file whose first bytes only resemble a PNG (bytes 4 to 7 wrong), a JPEG (`FF D8` then no marker) or a GIF (`GIF8x`), or a PNG whose first chunk is not IHDR | PDF: no longer embedded (no browser decodes it either); image layout: no size; the CLI's PDF asset reader refuses it |
| a WebP whose first chunk is smaller than its own header | image layout: no size |
| in the Studio: a JPEG with two `Exif` blocks, or a PNG with two `eXIf` chunks or one after its pixels | the stored, cleaned bytes keep only the first block's turn, so they paint as the original did |

**Deliberate leftovers.** Each reads bytes for a reason of its own, not a picture's header, so each stays where it is:

| Where | What it reads | Why it stays |
|---|---|---|
| `docs/src/lib/calco/picture.ts` `imageMime` | JPEG or PNG of a slide picture Calco itself was handed | Calco has its own fence and no dependencies; it picks between the two formats its host gives it, never untrusted bytes |
| `lib/core/pdf-compose/compose.mjs` `pngIsFlat` | a slide photo's IHDR size against its byte count | a compression measure on a PNG the slide camera just wrote, not a header read of a stranger's file |
| `docs/src/components/studio/export/pdf-image-pool.js` `pngBytesOf` | two signature bytes | it routes bytes the shared writer just wrote to jsPDF's PNG step; `rgbPngIdat` (lastra) does the real check |
| `docs/src/components/studio/media-exif.ts` | EXIF, XMP and IPTC text for a caption, a credit and a date | metadata the importer shows the author, not the picture's format or size |
| `docs/src/lib/preview-image-scale.ts` `animated` | `acTL`, `ANIM`, `avis` in a worker's source text | runs inside a worker built from a string, which cannot import a module; it only decides "do not scale an animation" |

**Corrections.** `fa095bc4`'s commit message (now on the pushed branch) says the TIFF magic-number rule matches "every
engine"; Playwright's Chromium 141 turns a magic-43 file, Chrome 153, WebKit and Firefox do not (row above). The first
lastra build also let a later PNG `eXIf` chunk decide and let `cleanJpeg` and `cleanPng` keep the turn of every Exif
block; an independent check found the cleaner case, the engines' probe settled the PNG one, and both now follow the
first block, which `read.fuzz.test.ts` holds by reading every cleaned file against its original.

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
  the code, not the comparison: the CLI bundle and the Studio's player core both read lastra's CommonJS build, which
  stays inside its own closure, so its names cannot reach the rest of the bundle (structural). A CommonJS build is not
  tree-shaken, so the player core carries the parts of lastra it does not call; the decoders' own subpath,
  `@laticent/lastra/decode`, keeps them out of it. Lastra's private helpers also carry distinctive
  names (index.ts says why). Checked by counting renamed identifiers in the
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
