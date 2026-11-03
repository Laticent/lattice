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

A deck of a title slide and two `image` slides, each holding a 4032 x 3024 photo-like JPEG (5.3 MB, a
1/f noise field, the spectrum of a natural photograph), pasted into the Studio as `data:` URLs, the way
the Library adds a photo. Exported to PowerPoint from the real Studio (`docs/e2e`, Playwright's
Chromium 1243 and WebKit 26.0 builds), and from the command line.

| Surface | Before: file / slide picture | After: file / slide picture |
|---|---:|---:|
| Studio, WebKit | 1,286 KB / 615 KB | see the PR |
| Studio, Chromium | 817 KB / 382 KB | 648 KB / 298 KB |
| Command line (Chromium) | 1.6 MB (four photo slides) | 1.2 MB |

Quality is measured against an ideal: the original photo resized with a Lanczos filter to exactly the
pixels the slide shows it at (the box read from the rendered slide). PSNR of the slide picture's photo
region against that ideal, higher is closer:

| Surface | Before | After |
|---|---:|---:|
| Studio, WebKit | 16.1 dB (wrong layout) | see the PR |
| Studio, Chromium | 24.6 dB | 26.6 dB |
| Command line | 24.6 dB | 26.6 dB (bicubic reference: 24.9 → 27.1) |

The pictures got smaller AND closer to the ideal on every surface: the grain an engine's shrink leaves
is detail that was never in the photo, and it is what a JPEG cannot compress.

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

**Phone cost.** Each large photo is decoded once more and shrunk on the main thread; every intermediate
canvas is released as soon as the next step is drawn (a phone caps a page's canvas memory), and the last
six shrinks are kept, so a photo repeated across slides is shrunk once.

**Fix.** The camera now shrinks each large picture itself, before the draw, to `ceil(natural x k x
scale)` pixels, where `k` is what the box asks of the picture (`object-fit` for an `<img>`,
`background-size` for a background; `cover` takes the larger ratio, so no part of the box is short of
pixels). Halving steps first (each a 2x2 average, which every engine draws the same way), then one step
to the exact size; the result is lossless PNG, so the shrink adds no compression of its own, and the
slide then draws the picture at 1:1.

Left alone, deliberately:

- a picture shown at or near its own size (it must have 1.25 times the pixels it covers, on each side);
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
- **Unit**: the two address readers against their old regexes (fuzzed), the camera's geometry and its
  halving steps.
- **Not run on a real iPhone or Mac Safari.** Playwright's WebKit is not Safari. The iOS Simulator
  suite is the next surface.
- **Not run on the owner's own deck.** Synthetic photos: real ones could not be downloaded here.
- **Not opened** in desktop PowerPoint or LibreOffice: the parts are standard JPEG and PNG, and only
  their pixels changed.
