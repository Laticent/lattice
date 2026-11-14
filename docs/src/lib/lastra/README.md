# @laticent/lastra

**One image library: read a picture's header, strip its metadata, resize its pixels, write JPEG and PNG, and decide
whether a re-encode is worth it.** Bytes in, bytes out, the same in Node, a browser and a worker. No DOM, no Node
APIs, no dependencies.

Lattice grew a header reader in each export path, and they disagreed on real files: a second EXIF block, an EXIF
block after the frame header, junk bytes between JPEG segments, an orientation of 9. Lastra is the one place those
answers live now, and each disagreement is a test row settled by what Chromium, WebKit and Firefox actually paint
(`read.test.ts`).

| Function | What it does |
|---|---|
| `imageFormat(bytes)` | `'png'` · `'jpeg'` · `'gif'` · `'webp'` · `'avif'` · `'svg'` by magic number (12 bytes is enough for every raster format; an SVG is markup that opens with a tag and names `<svg>` in its first 2 KB), or null. HEIC is null |
| `readImage(bytes)` | `{ format, mime, width, height, alpha, orientation }` from the header alone, or null. `width` and `height` are the STORED size, a positive integer within the format's limit. `alpha` is a hint: false only when the format or header rules transparency out. `orientation` is the EXIF turn a browser applies, 1 to 8 (JPEG `Exif`, PNG `eXIf`, AVIF `irot`/`imir`; a WebP's EXIF is ignored because no engine applies it). An SVG has no pixel size here |
| `displaySize(info)` | The size a browser paints: width and height swapped for orientations 5 to 8 |
| `orientationAgreed(bytes)` | Whether Chromium, Firefox and WebKit all apply the turn `readImage` reports; false for an Exif block after another APP1, a turn WebKit reads past a first untagged block for, and a PNG's eXIf |
| `tiffOrientation(tiff)` | The Orientation tag of a TIFF block; 1 for anything that is not TIFF, not 1 to 8, or cut short |
| `cleanPng` · `cleanJpeg` · `cleanWebp` · `cleanGif` · `cleanerFor(mime)` · `cleanAsync(mime, bytes, { signal? })` | The file without its metadata, by an allow-list of the blocks a picture needs (EXIF, XMP, C2PA, text, comments, timestamps and every unknown block go; a turn survives as an orientation-only EXIF block; one color profile stays, read as decoders read it), or null when the file does not parse or is cut short. No re-encode: pixels, transparency and animation are untouched. Each walks the file twice, counting and then writing, so it holds the input and the result and nothing per block. `cleanAsync` yields after every 1 MB or 2^14 blocks, for a page; the others run to the end, for a worker, the CLI or a small file |
| `lanczosResize(src, sw, sh, dw, dh, strip?)` · `lanczosWeights(src, dst)` | Lanczos-3 on RGBA, weighted by alpha (no dark halo at a transparent edge). `src` may be a function that returns rows, so a caller reads a large picture in strips |
| `createJpegEncoder({ width, height, quality })` · `encodeJpeg(rgba, w, h, q)` | Baseline JFIF, 4:2:0, libjpeg's quality tables, Huffman tables built per picture. The same bytes on every engine. Takes rows as they come; transparency lands on white. `createJpegEncoder` uses nothing outside its own body, so a host can send its source into a page as text |
| `encodePng(width, height, readRows, { fast? })` | A PNG with a per-row adaptive filter and the platform's `CompressionStream` deflate: RGB when every pixel is opaque, RGBA otherwise. Reads `PNG_BAND` rows at a time |
| `rgbPngIdat(png)` | An 8-bit RGB, non-interlaced PNG's concatenated IDAT bytes, which a PDF carries under `/FlateDecode` with `/Predictor 15`; null for any other PNG |
| `decodeJpeg(bytes, opts?)` · `decodePng(bytes, opts?)` (and `…Sync`), from `@laticent/lastra/decode` | RGBA pixels, `{ width, height, data, icc, … }`, in pure JavaScript, the same answer in every engine: JPEG identical to libjpeg-turbo's C code on every file measured, PNG lossless through lastra's own inflate. Pixel, byte and work limits and an abort signal. A subpath, so a bundle that only reads or encodes does not carry the decoders. See [`decode/README.md`](decode/README.md) |
| `LastraError` · `isLastraError(e)` | The one error lastra throws when it refuses an input, with a `code` to branch on |
| `applyOrientation(image, orientation)`, from `@laticent/lastra/decode` | A decoded image turned upright by its EXIF orientation, 1 to 8 |
| `planRecode(info, byteLength, thresholds)` · `acceptRecode(original, recoded, plan, thresholds)` | Whether a PNG or JPEG is worth re-encoding as a JPEG (its size, its turn, how tight it already is), and whether the result is small enough to keep. Every number is the caller's |

```js
import { readImage, displaySize, cleanerFor } from '@laticent/lastra';

const info = readImage(bytes); // { format: 'jpeg', mime: 'image/jpeg', width: 4032, height: 3024, alpha: false, orientation: 6 }
displaySize(info); // { width: 3024, height: 4032 }: a phone's portrait
const clean = cleanerFor(info.mime)?.(bytes); // the same picture, its GPS and camera tags gone, its turn kept
```

**Untrusted bytes.** Every read is bounds-checked and every loop advances. `read.fuzz.test.ts` corrupts a valid file
of each format thousands of times from a printed seed and holds the reader to a valid header or null, and each
cleaner to null or a file of the same format that cleans to itself, with no throw.

**Not here yet.** The region mean, the `cover`/`contain` crop and the grayscale and duotone tones are later slices
of the design.

Design: [`engineering/decisions/2026-11-13-image-library.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-11-13-image-library.md).

## Build

`npm run lastra-lib:build` writes `dist/` (ESM + CJS + `.d.ts`); `npm run lastra-lib:check` fails if it is stale.
Tests: `cd docs && npx vitest run src/lib/lastra`. The standalone typecheck (no DOM, no Node types):
`cd docs && npm run check:lastra`.

## Status

Private for now: the package is not published to npm until its publish is approved (the design note's §7, ruling 2),
so it has no page on the docs site yet. Lattice resolves it as a workspace package.

## License

AGPL-3.0-only.
