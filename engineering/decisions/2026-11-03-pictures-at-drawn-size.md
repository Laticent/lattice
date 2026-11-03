---
status: in-progress
summary: An iPhone's Studio export of a phone-photo deck was larger and laid out wrong for three WebKit-only reasons — a regex JSC gives up on past half a megabyte, a canvas handed off before WebKit drew it, and the engine's own shrink of a 12-megapixel photo. All three are fixed in the shared kernel; the slide camera now shrinks each picture itself to the pixels it covers. A nightly e2e exports a phone-photo deck on Chromium, Firefox and WebKit and fails on size, a repeated picture or a blank one.
---

# Pictures at the size they are drawn (2026-11-03)

**The question.** The owner's exports to PowerPoint, PDF and LibreOffice were large again, weeks after
`2026-10-21-slide-pictures-png-or-jpeg.md` fixed it, and they asked why this keeps happening. Their
exports come from the Studio on an iPhone.

**The answer.** The October fix still worked: the command line and the Studio on Chromium wrote small
files. Nothing measured the Studio on WebKit, and on WebKit three separate things were wrong. None of
them was a recent edit to the export; all three were invisible to every test, because every test of
picture size ran on Chromium and Node, which are both V8.

## What was measured

**The method.** Each slide picture is scored against an IDEAL: the original photo resized with a Lanczos
filter to exactly the pixels the slide shows it at. Each picture is aligned to its own photo box first
(size from the slide's layout in that engine, position searched to a quarter pixel), because WebKit
places the box a few pixels from where Chromium does. Three numbers, all on the photo's interior:

- **PSNR** (dB) and **SSIM** against the ideal: higher is closer to the photo;
- **sharpness**: the picture's Laplacian variance over the ideal's. 1.00 is as sharp as the ideal, under 1
  is softer, over 1 is grain that is not in the photo.

**A retraction.** The first version of this change shrank with halving steps (2x2 averages) and one
bilinear step, and was reported here as "closer to the ideal on every engine" (24.6 to 26.6 dB). That
score compared every picture at one fixed box position, and the misalignment flattered the softer
picture. Aligned, the halving shrink kept 35 to 47% of the detail Lanczos keeps (sharpness 0.35 to 0.47,
three photos), and a 12-megapixel photo came out at sharpness 0.24 in Chromium. It is replaced by a
Lanczos-3 resize (`lib/core/lanczos.mjs`), which matches PIL's Lanczos to within 2 levels in 255
(SSIM 0.999, sharpness 1.000) and runs in 0.6 s for a 5-megapixel photo and 1.0 s for 12 megapixels
in Node, streamed in 64-row strips.

**The crossover.** The camera alone (scale 2, lossless PNG, so no JPEG in the way), the same photo
content at three ratios of photo to box, and two of the owner's photos, in Playwright's Chromium 1243
and WebKit 26.0. "Browser only" is `main`: the photo drawn into the slide as it is.

| Photo | Photo ÷ box | Engine | Browser only (main): PSNR / SSIM / sharpness | Our Lanczos: PSNR / SSIM / sharpness |
|---|---:|---|---|---|
| 12MP content at 2.0x | 2.00x | chromium | 37.28 / 0.9745 / 0.70 | 40.54 / 0.9884 / 0.67 |
| 12MP content at 2.0x | 2.00x | webkit | 39.06 / 0.9842 / 1.09 | 48.98 / 0.9984 / 1.00 |
| 12MP content at 2.5x | 2.50x | chromium | 36.67 / 0.9713 / 0.62 | 40.60 / 0.9885 / 0.67 |
| 12MP content at 2.5x | 2.50x | webkit | 33.17 / 0.9423 / 1.79 | 49.06 / 0.9985 / 1.00 |
| 12MP content at 3.0x | 3.00x | chromium | 37.08 / 0.9739 / 0.91 | 40.69 / 0.9887 / 0.68 |
| 12MP content at 3.0x | 3.00x | webkit | 27.63 / 0.8265 / 3.32 | 49.15 / 0.9985 / 1.00 |
| yours: suede | 1.70x | chromium | 35.40 / 0.9781 / 0.89 | 43.13 / 0.9942 / 0.74 |
| yours: suede | 1.70x | webkit | 41.34 / 0.9931 / 0.93 | 40.65 / 0.9914 / 0.73 |
| yours: grain chukka | 1.34x | chromium | 34.10 / 0.9819 / 0.77 | 42.05 / 0.9958 / 0.75 |
| yours: grain chukka | 1.34x | webkit | 41.79 / 0.9962 / 0.80 | 38.16 / 0.9901 / 0.76 |

At 2x and above the camera's shrink is closer on both engines, every metric, every row; on WebKit by a
wide margin (at 3x, 49.2 dB and SSIM 0.9985 against 27.6 dB and 0.827, with grain at 3.3 times the
photo's own). Below 2x WebKit's own scaling is slightly closer (1.70x: 41.3 against 40.7 dB; 1.34x:
41.8 against 38.2 dB), so the camera leaves those pictures to the browser, exactly as `main` did:
`RESAMPLE_MIN_RATIO = 2`.

**Why the camera's own picture is not perfect.** Straight out of the resize it matches the ideal
(sharpness 1.000); drawn into the slide it measures 0.68 in Chromium. A photo box rarely starts on a whole
device pixel (690.19 CSS px at 2x), and the browser blends each pixel with its neighbor to place it. An
attempt to move the picture onto whole pixels was measured and changed nothing: the box inside the
slide's SVG copy sits about 0.1 px from where the live page measured it. It was removed.

**In the real Studio, PowerPoint** (the nightly gate's deck: three seeded 4032 x 3024 photos, `docs/e2e/export-photo-size.spec.ts`):

| Engine | `main` | This change |
|---|---:|---:|
| Chromium | 583 KB / 175 KB | 491 KB / 145 KB |
| WebKit | not measured: on `main` the gate stops at the unmeasured photo (cause 1) before it exports | 492 KB / 145 KB |
| Firefox | not run on `main` | 518 KB / 154 KB |

(File / largest photo slide's picture.) WebKit now writes what Chromium writes, to within 0.3%. The owner's nine photos (1179 to 2062 px wide)
sit at or under twice their boxes, so their exports keep `main`'s pictures; on WebKit they gain the
correct layout (cause 1).

## Cause 1: a regex WebKit gives up on

The `image` layout picks its composition from the photo's shape. The Studio finds the photo's address
in the slide's HTML with `BG_URL` (`lib/core/image-aspect.js`), and the runtime with `firstCssUrl`
(`lib/core/css-url.js`). Both were one regex with a group that repeats once per character:
`((?:(?!&#39;|&quot;)[^'")])+)` and `((?:[^"\\]|\\.)*)`. JavaScriptCore's regex engine gives up on
that shape and returns `null`, not an error. Measured in Playwright's WebKit: `BG_URL` fails from
0.5 MB, `firstCssUrl` between 0.5 and 2 MB; V8 matches both at 7 MB.

So on an iPhone, a slide with a phone photo was stamped final with no address and never measured. The
live preview hid it (a live card without a size takes the wide box), but the export's capture frame is
not live, and its fallback is a near-square box at the top right: a different layout from the one the
author saw, with more photo pixels in it.

**Fix.** Both readers keep a plain character class (`[^'")]+`, which JSC matches at 7 MB in under
60 ms) or scan with `indexOf`, and return what the old patterns returned. The unit tests keep the old
regex as the oracle and compare 20,000 fuzzed inputs each; the one difference is an address made only
of a space before an entity quote, which names no photo either way. The gotcha is in
`engineering/gotchas/browser-engine.md`.

The export also now waits for the probe: `image-adaptive.js` registers it in the document's measure
registry (`lib/core/measure-kit.js`), which `waitForMeasuring` already waits on, capped at 4 s. The
Studio's Print drawer waits on the same registry (`PrintOptionsPanel.tsx`, capped at 2.5 s), so Print
now also waits for a photo's size before it lays out, up to that cap: the same wait, for the same reason.

## Cause 2: a canvas handed off before WebKit drew it

One WebKit export repeated slide 2's picture on every slide after it, and another wrote a black title
slide. It was deterministic for a given deck and order: PowerPoint then LibreOffice in one page. The
SVG each slide was drawn from was correct and distinct (logged), and the camera alone, called slide by
slide outside the Studio, was correct. Reading the slide canvas's pixels back after the draw made the
bug disappear.

WebKit records a canvas's drawing and runs it later. The Studio hands the slide canvas to
`createImageBitmap` for its encode workers, and that can take the canvas before the drawing has run: it
then gets whatever the canvas's memory held, blank, or the previous slide when WebKit reused the memory.

**Fix, in two parts.** The camera reads one pixel back after the slide draw, and `encodeCanvas` does the
same before a writer reads the rows; one pixel makes WebKit run the drawing (`lib/core/slide-camera.mjs`,
so every host gets it). That cured the repeated pictures but not the blank title slide: with the encode
workers switched off the title was right, so the hand-off was at fault. The Studio's pool
(`picture-encoder-pool.js`) sent each slide to a worker as an `ImageBitmap`, and on WebKit the first one a
session sent arrived blank. It now sends the canvas's pixels (`getImageData`, the buffer transferred, not
copied), which the worker puts on its OffscreenCanvas; no bitmap is made. The deflate and the JPEG
encode, the expensive part, still run in the worker, and partial alpha now arrives exact (a bitmap's
round trip premultiplied it).

## Cause 3: the engine shrinks the photo

A 12-megapixel photo in a 552 x 345 box is shrunk about 3.6 times when the slide is drawn at 2x, and
the BROWSER did that shrink, inside the SVG image. Chromium filters it, though not perfectly; WebKit
left visible grain. Grain is detail a JPEG must spend bytes on, so the same slide's picture was larger
from WebKit than from Chromium, and both were further from the photo than a proper resize.

**Phone cost.** Each large photo is decoded once more and resized on the main thread, about 1 s for 12
megapixels in Node and more on a phone (not measured on a device); the source is read in 64-row strips,
and the last six shrinks are kept, so a photo repeated across slides is shrunk once.

**Fix.** The camera now shrinks each large picture itself, before the draw, to `ceil(natural x k x
scale)` pixels, where `k` is what the box asks of the picture (`object-fit` for an `<img>`,
`background-size` for a background; `cover` takes the larger ratio, so no part of the box is short of
pixels). A Lanczos-3 resize (`lib/core/lanczos.mjs`), read off the photo in 64-row strips so a phone never holds a
second full copy of it; the result is lossless PNG, so the shrink adds no compression of its own.

Left alone, deliberately:

- a picture with less than twice the pixels it covers, on each side (measured above: below 2x the browser is as close or closer);
- a vector picture (`data:image/svg+xml`);
- any use the camera did not measure: only the `<img>` or background it sized gets the shrunk copy, and the
  same picture as a mask, a pseudo-element's background, a video poster or in the stylesheet keeps the
  original. Uses are grouped by the picture's BYTES, not its address (`a.jpg` and `a.jpg?v=2` are one
  photo), and the largest use sets the size, so no use is drawn from fewer pixels than it needs;
- a background with `background-attachment: fixed` (sized against the viewport) or `background-repeat:
  round` (a tile may stretch), and anything drawn `image-rendering: pixelated` or `crisp-edges` (pixel art,
  a QR code), which a smoothing shrink would blur;
- the PDF's embedded original photos (`lib/core/pdf-compose` places the original file over the slide's
  picture, and the file is the author's; this touches only the slide's picture);
- the slide picture's own resolution (2x the slide, as before) and the JPEG rule from 2026-10-21.

## The gate

`docs/e2e/export-photo-size.spec.ts` builds three seeded 4032 x 3024 photo-like JPEGs in the page,
exports PowerPoint and LibreOffice from the real Studio, and reads the downloaded files. It fails when:

- the Studio did not measure the photo's shape (`data-img-bucket`, cause 1);
- two slide pictures are the same, or a picture is blank (cause 2);
- a photo slide's picture or the whole file is over a ceiling measured on this deck (cause 3, and
  any return of the old sizes).

It is tagged for Chromium desktop, Firefox and WebKit, and it runs nightly with the rest of the e2e
suite (`studio-e2e-nightly.yml`), not on every PR: the owner's call, 2026-11-03.

## Checked, and not checked

- **Real Studio, three engines** (Playwright's Chromium, Firefox and WebKit builds): the gate, and the
  before/after probe above.
- **Command line**: the four-photo deck, before and after, from `dist/lattice.js`.
- **Unit**: the two address readers against their old regexes (fuzzed), the camera's geometry, and the
  Lanczos resize (a flat color, a transparent edge, strips against the whole array, a stripe pattern).
- **The owner's own photos**: nine, through the real Studio on both engines (the crossover table above
  uses two of them).
- **Not run on a real iPhone or Mac Safari.** Playwright's WebKit is not Safari. The iOS Simulator
  suite is the next surface.
- **Not run on the owner's own deck file**, only on photos they sent.
- **Not opened** in desktop PowerPoint or LibreOffice: the parts are standard JPEG and PNG, and only
  their pixels changed.
