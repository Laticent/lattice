## Decode

PNG and JPEG bytes to RGBA pixels, in pure JavaScript: no dependencies, no DOM, the same answer in Node,
every browser and a worker. The only platform API is `DecompressionStream('deflate')`, which PNG's
inflate runs through (Node 18+, every current browser).

```ts
import { decodeJpeg, decodePng, isLastraError } from '@laticent/lastra';

try {
  const { width, height, data } = await decodeJpeg(bytes, { maxPixels: 40_000_000 });
  // data: Uint8ClampedArray, width * height * 4 bytes, RGBA, alpha not premultiplied
} catch (e) {
  if (isLastraError(e)) console.warn(e.code); // 'truncated' | 'bad-marker' | 'too-large' | 'unsupported' | 'crc' | 'corrupt'
  else throw e;
}
```

`decodePng` is async (the inflate is a stream). `decodeJpeg` is async for symmetry; `decodeJpegSync` is
the same decode without the promise.

### What decodes

| Format | Decodes | Refuses (`code`) |
|---|---|---|
| PNG | color types 0, 2, 3, 4, 6 at every legal bit depth (1, 2, 4, 8, 16); `PLTE` + `tRNS`; gray and RGB `tRNS` keys; Adam7; split `IDAT`; APNG's default image | no signature, a malformed chunk header, chunks out of order (`bad-marker`); the file ends mid-chunk or before image data (`truncated`); a bad CRC on IHDR, PLTE, IDAT or IEND (`crc`); an impossible header, a bad filter byte, image data that does not inflate to exactly the declared size (`corrupt`); an unknown critical chunk, interlace method 2 (`unsupported`) |
| JPEG | baseline, extended and progressive Huffman frames (SOF0, SOF1, SOF2); spectral selection and successive approximation; restart intervals; 1, 3 or 4 components; any whole-number chroma sampling (4:4:4, 4:2:2, 4:2:0, 4:4:0, 4:1:1, ...) at any size; Adobe APP14 RGB, YCbCr, CMYK and YCCK; files with no `DHT` (Motion-JPEG) through the Annex K tables | arithmetic coding, lossless, hierarchical, 12-bit, a height set by DNL, 2 or more than 4 components, a fractional sampling ratio (`unsupported`); the file ends before EOI (`truncated`); a malformed or misplaced segment (`bad-marker`); an over-full Huffman table, a progressive scan out of sequence, a component in two sequential scans, a table a scan needs that was never defined (`corrupt`) |

Corrupt entropy-coded data inside a JPEG scan is not a refusal, as in libjpeg: a bad Huffman code
decodes as symbol 0, and once a scan's data runs out at a marker, the rest of the scan up to the next
restart marker keeps its coefficients.

### Which pixels

- **JPEG matches libjpeg-turbo bit for bit**, the decoder behind Chromium, Firefox, Linux WebKit and
  Pillow: the accurate integer IDCT (`jidctint.c`), "fancy" chroma upsampling (`jdsample.c`) and the
  YCbCr tables of `jdcolor.c` are transcriptions. On the committed corpus every file of every mode is
  identical to Pillow's decode (maximum difference 0). Safari on Apple platforms decodes through
  ImageIO and is not measured here.
- **CMYK and YCCK decode** as Adobe-inverted CMYK to RGB with no color management,
  `R = K - K x C / 255` with Pillow's rounding: what Pillow and Chromium show when a file carries no ICC
  profile. A CMYK file with an embedded profile will look different in a color-managed viewer.
- **PNG is lossless**: the corpus matches its ground truth exactly. 16-bit samples keep their high byte
  (libpng `png_set_strip_16`, Chromium, WebKit, Pillow; Firefox rounds instead, at most 1 apart). A
  palette index past the end of `PLTE` is opaque black (libpng, Firefox, WebKit; Chromium uses a
  palette color).
- **No color management.** `gAMA`, `cHRM`, `sRGB`, `iCCP`, `cICP` and JPEG ICC profiles are not applied;
  samples come back as stored, which is what a browser shows for untagged and sRGB content.
- **EXIF orientation is not applied.** The reader reports it; `applyOrientation(image, orientation)`
  turns the pixels upright (1 to 8, Pillow's `exif_transpose` mapping).

### Hostile input

- `maxPixels` (default 100,000,000) and `maxBytes` (default 256 MiB) are checked on the header, before
  the pixels or the coefficients are allocated.
- PNG inflate stops as soon as the output passes the size the header implies, so a decompression bomb
  costs one input chunk of output.
- Every loop is bounded by the input length or the block count. A progressive JPEG coefficient can be
  in at most 14 scans (a first pass and 13 refinements), which bounds a file that replays scans; a scan
  whose data ran out skips to its next restart marker in one step.
- `opts.meter` (`{ steps, limit? }`) counts the work in loop steps and refuses (`too-large`) past
  `limit`. The fuzz tests hold every input under a proven budget with it, without a clock.
- Any exception other than `LastraError` (and a `TypeError` for a wrong argument type) is a bug.

### Speed

A 12-megapixel decode (4000 x 3000), Node 22 on the x64 sandbox: baseline 4:2:0 JPEG about 350 ms,
progressive about 520 ms, an RGB PNG about 820 ms. In browsers lastra runs 1.4 to 2.5 times the time
of `createImageBitmap` plus `getImageData` for JPEG (`tools/lastra-corpus/bench.mjs`; the full table is
in the design note §4).

### The corpus and the oracle

`tools/lastra-corpus/generate.py` draws every fixture from a seed and records the oracle in
`fixtures/expected.json` (Pillow's decode for JPEG, the encoder's ground truth for PNG);
`tools/lastra-corpus/browser-compare.mjs` measures the distance to Chromium, Firefox and WebKit. The
tests read only the committed files.
