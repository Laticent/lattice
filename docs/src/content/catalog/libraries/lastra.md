---
kind: library
name: Lastra
order: 17
promise: Read, clean, resize and re-encode a picture, the same in every engine.
intro: Lastra is the family's image library. It reads a picture's format, size, transparency and turn from its header, strips its metadata without touching a pixel, decodes PNG and JPEG, resizes with Lanczos-3, writes JPEG and PNG, and decides whether a re-encode is worth keeping. Bytes go in and bytes come out, the same in Node, a browser and a worker.
group: Sharing and exporting
inLattice: Reads every picture's header, strips photos' metadata, and encodes the JPEGs and PNGs the exports write.
useWhen: Your app takes pictures from people and has to know their real size, drop their GPS, or make them smaller, and the browser's own answers differ from engine to engine.
mark: /lastra-mark.svg
facts:
  - { k: Package, v: '@laticent/lastra' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: 'The browser, a worker and Node' }
  - { k: Dependencies, v: None }
  - { k: License, v: Apache-2.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/lastra/README.md
    note: Every function, what it refuses, and how it holds up against hostile files.
  - label: The decoders
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/lastra/decode/README.md
    note: The PNG and JPEG decoders, their limits, and how they were measured against libjpeg-turbo.
  - label: The demo deck
    href: https://github.com/Laticent/lattice/blob/main/examples/lastra-image-reading.md
    note: Three pictures Lattice's old header readers got wrong, rendered.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-11-13-image-library.md
    note: The design note, the fifteen helpers it replaces, and the slices still to come.
---

## The problem

A picture's file says less than it seems to, and browsers read it differently. Take a phone photo dropped into a slide deck:

- **Its size lies.** The camera stores the pixels sideways and writes a turn into an EXIF block. Read the stored width and the picture is laid out in the wrong box.
- **Engines disagree on the turn.** A second EXIF block, an EXIF block after the frame header, or a PNG's `eXIf` chunk: Chromium, Firefox and WebKit don't all apply the same turn to the same file.
- **It carries more than pixels.** GPS coordinates, the camera's serial number, editing history. Send it on and they go with it.
- **The browser's encoder is not yours.** Ask a canvas for a JPEG and each engine writes different bytes. Safari's were 1.5 to 2.2 times the size of ours.

Lattice had grown a helper for each of these in each export path, about fifteen of them, and its four header readers disagreed on real files.

## The idea

**One library, bytes in and bytes out**, with every answer settled by what the engines actually paint.

- **Read the header, not the pixels.** `readImage` gives the format, the stored size, a transparency hint and the EXIF turn a browser applies, for PNG, JPEG, GIF, WebP and AVIF; `imageFormat` also names an SVG. `orientationAgreed` says whether all three engines apply that turn.
- **Strip metadata by an allow-list.** Each cleaner rebuilds the file from the blocks a picture needs, with no re-encode. EXIF, XMP, C2PA, text and every unknown block go; a turn survives as an orientation-only EXIF block, and one color profile stays.
- **Decode in plain JavaScript.** PNG and JPEG to RGBA, the same in every engine. The JPEG decoder matches libjpeg-turbo's C code on every file measured, and refuses a hostile file within stated pixel, byte and work limits.
- **Resize and encode it yourself.** Lanczos-3, weighted by transparency so no dark halo forms at an edge. A JPEG encoder and a PNG writer that write the same bytes everywhere.
- **Leave the policy to the caller.** `planRecode` and `acceptRecode` decide whether a re-encode is worth it, and every threshold is the caller's. Lastra holds no defaults.

## How to use it

```sh
npm install @laticent/lastra
```

> Lastra publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/lastra`.

Read a picture's header and strip its metadata, with no decode:

```ts
import { readImage, displaySize, cleanerFor } from '@laticent/lastra';

const info = readImage(bytes);        // { format, mime, width, height, alpha, orientation }, or null
const shown = displaySize(info);      // the size a browser paints, after the turn
const clean = cleanerFor(info.mime)?.(bytes); // the same picture, without its metadata
```

Shrink a photo and write a JPEG, the same bytes in every engine:

```ts
import { encodeJpeg, lanczosResize } from '@laticent/lastra';
import { applyOrientation, decodeJpeg } from '@laticent/lastra/decode';

const upright = applyOrientation(await decodeJpeg(bytes), info.orientation);
const small = lanczosResize(upright.data, upright.width, upright.height, 1280, 800);
const jpeg = encodeJpeg(small, 1280, 800, 90);
```

| Call | What it gives you |
| --- | --- |
| `readImage(bytes)` · `displaySize(info)` | Format, stored size, transparency hint and turn; the painted size |
| `orientationAgreed(bytes)` | Whether Chromium, Firefox and WebKit all apply that turn |
| `cleanerFor(mime)` · `cleanAsync(mime, bytes)` | The file without its metadata, by an allow-list of blocks |
| `decodeJpeg` · `decodePng` (from `/decode`) | RGBA pixels, with limits and an abort signal |
| `lanczosResize(src, sw, sh, dw, dh)` | The pixels at a new size, Lanczos-3 |
| `encodeJpeg` · `createJpegEncoder` · `encodePng` | JPEG and PNG bytes, the same in every engine |
| `planRecode` · `acceptRecode` | Whether a re-encode is worth doing, and worth keeping |

## Where else it fits

- **Upload forms** that should know a photo's real size before it is laid out, and drop its location before it is stored.
- **Static-site and CMS pipelines** that shrink and re-encode pictures in Node, with no native image tool to install.
- **Browser editors** that export pictures and need the same bytes from Chrome, Firefox and Safari.
- **Workers** that clean or resize a batch of pictures off the page, since nothing in Lastra needs a DOM.

## How Lattice uses it

Lattice reads a picture's format, size and turn through Lastra. The Studio strips a photo's metadata as it is added, and the command-line tool does the same when it packs a `.lattice` file, writes a player file, or writes a PDF. The JPEGs and PNGs Lattice's exports encode, from a slide picture in a PowerPoint file to a shrunken photo in a PDF, come from Lastra's encoders rather than the browser's, and Lattice's `images:` setting turns into the numbers `planRecode` and `acceptRecode` take.

The owner has ruled that all of Lattice's image work belongs in Lastra. Some of it hasn't moved in yet: Lattice's exports still decode pictures in a browser, and the region mean, the `cover`/`contain` crop and the grayscale and duotone tones are later slices of the design.

## What it doesn't do

- **It decodes only PNG and JPEG.** It reads the header of GIF, WebP and AVIF, and cleans GIF and WebP, but turns none of them into pixels.
- **It writes only JPEG and PNG.** A JPEG has no transparency, so transparent pixels land on white.
- **It doesn't read HEIC.** `imageFormat` returns null for it.
- **It doesn't draw.** No canvas, no layout, no filters yet: pixels in, pixels out.
